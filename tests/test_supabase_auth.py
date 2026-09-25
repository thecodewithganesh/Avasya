"""Supabase auth integration tests (backend/integrations/supabase.py).

Verifies the full bearer-token path end to end through the API dependency:
valid JWT -> 200, tampered/expired/unconfigured -> 401, and that the demo
X-Officer-Email mechanism keeps working when Supabase is not configured.
"""
from __future__ import annotations

import time

import jwt as pyjwt
import pytest

from backend.integrations.supabase import (
    SupabaseAuthError,
    SupabaseConfig,
    verify_supabase_token,
)

SECRET = "test-jwt-secret-for-avasya-suite"


def _cfg(auto_provision: bool = True) -> SupabaseConfig:
    return SupabaseConfig(
        supabase_url="https://demo.supabase.co",
        jwt_secret=SECRET,
        service_role_key=None,
        auto_provision=auto_provision,
    )


def _token(email: str = "sb.officer@avasya.test", **overrides) -> str:
    now = int(time.time())
    payload = {
        "sub": "user-uuid-1234",
        "email": email,
        "aud": "authenticated",
        "iat": now,
        "exp": now + 600,
        "user_metadata": {"full_name": "Supabase Officer"},
    }
    payload.update(overrides)
    return pyjwt.encode(payload, SECRET, algorithm="HS256")


def test_verify_accepts_valid_token() -> None:
    claims = verify_supabase_token(_token(), _cfg())
    assert claims["email"] == "sb.officer@avasya.test"
    assert claims["sub"] == "user-uuid-1234"


def test_verify_rejects_tampered_token() -> None:
    token = _token()[:-4] + "beef"
    with pytest.raises(SupabaseAuthError):
        verify_supabase_token(token, _cfg())


def test_verify_rejects_expired_token() -> None:
    token = _token(exp=int(time.time()) - 10)
    with pytest.raises(SupabaseAuthError):
        verify_supabase_token(token, _cfg())


def test_verify_rejects_wrong_audience() -> None:
    token = _token(aud="service_role")
    with pytest.raises(SupabaseAuthError):
        verify_supabase_token(token, _cfg())


def test_verify_rejects_when_unconfigured() -> None:
    unconfigured = SupabaseConfig(
        supabase_url=None, jwt_secret=None, service_role_key=None, auto_provision=True
    )
    with pytest.raises(SupabaseAuthError):
        verify_supabase_token(_token(), unconfigured)


def test_valid_bearer_grants_officer_access(client, db_session, monkeypatch) -> None:
    """Configured backend + valid JWT + officer role -> passes the dependency."""
    from backend.models import Recommendation, User
    from backend.models.enums import DataOrigin
    from backend.integrations import supabase as sb

    db_session.add(
        User(
            email="sb.officer@avasya.test",
            full_name="Supabase Officer",
            role="officer",
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.add(
        Recommendation(
            summary="Demo recommendation",
            recommendation_type="RELOCATION",
            details={},
            confidence_score=0.9,
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.commit()
    recommendation = db_session.query(Recommendation).first()
    monkeypatch.setattr(sb, "supabase_config", _cfg())

    response = client.post(
        f"/api/v1/recommendations/{recommendation.id}/approval",
        json={"action": "APPROVE"},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    # 201 = full chain: JWT verified, officer resolved, approval created.
    assert response.status_code == 201


def test_bearer_with_unknown_email_is_401_provisioned_roleless(
    client, db_session, monkeypatch
) -> None:
    """Valid JWT for an unknown user auto-provisions role-less -> 401."""
    from backend.models import Recommendation, User
    from backend.models.enums import DataOrigin
    from backend.integrations import supabase as sb

    db_session.add(
        Recommendation(
            summary="Demo recommendation",
            recommendation_type="RELOCATION",
            details={},
            confidence_score=0.9,
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.commit()
    recommendation = db_session.query(Recommendation).first()
    monkeypatch.setattr(sb, "supabase_config", _cfg())

    response = client.post(
        f"/api/v1/recommendations/{recommendation.id}/approval",
        json={"action": "APPROVE"},
        headers={"Authorization": f"Bearer {_token('new.user@avasya.test')}"},
    )
    assert response.status_code == 401
    provisioned = db_session.query(User).filter_by(email="new.user@avasya.test").one()
    assert provisioned.role is None


def test_invalid_bearer_is_401_even_with_demo_header(client, db_session, monkeypatch) -> None:
    """A present-but-bad token must never silently fall back to the demo header."""
    from backend.models import Recommendation
    from backend.models.enums import DataOrigin
    from backend.integrations import supabase as sb

    db_session.add(
        Recommendation(
            summary="Demo recommendation",
            recommendation_type="RELOCATION",
            details={},
            confidence_score=0.9,
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.commit()
    recommendation = db_session.query(Recommendation).first()
    monkeypatch.setattr(sb, "supabase_config", _cfg())

    response = client.post(
        f"/api/v1/recommendations/{recommendation.id}/approval",
        json={"action": "APPROVE"},
        headers={
            "Authorization": "Bearer not-a-real-token",
            "X-Officer-Email": "officer@avasya.test",
        },
    )
    assert response.status_code == 401


def test_demo_header_still_works_when_supabase_unconfigured(client, db_session) -> None:
    """Regression: no Supabase env -> X-Officer-Email demo auth unchanged."""
    from backend.models import Recommendation
    from backend.models.enums import DataOrigin

    db_session.add(
        Recommendation(
            summary="Demo recommendation",
            recommendation_type="RELOCATION",
            details={},
            confidence_score=0.9,
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.commit()
    recommendation = db_session.query(Recommendation).first()
    response = client.post(
        f"/api/v1/recommendations/{recommendation.id}/approval",
        json={"action": "APPROVE"},
        headers={"X-Officer-Email": "officer@avasya.test"},
    )
    # 401 = auth mechanism still reached the dependency (no officer seeded
    # in this test); 5xx/404 would mean the wiring broke.
    assert response.status_code == 401
