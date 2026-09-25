"""Supabase integration for AVASYA (auth today; storage/realtime optional).

What this module does
---------------------
1. **Auth verification (wired):** officer requests may carry a Supabase
   access JWT (`Authorization: Bearer <jwt>`). When ``SUPABASE_URL`` +
   ``SUPABASE_JWT_SECRET`` are configured, HS256 tokens are verified
   cryptographically (signature, audience ``authenticated``, expiry) and the
   user is resolved/created against the ``users`` table so RBAC continues to
   work unchanged.
2. **Demo fallback (unchanged):** with no Supabase configuration the header
   mechanism stays exactly as documented (X-Officer-Email), so local demo and
   all existing tests keep working.
3. **Storage (optional helper):** lazy ``storage_client()`` factory for
   evidence-document buckets — created only if/when first used.

Security notes
--------------
- ``SUPABASE_JWT_SECRET`` is the **HS256 secret** (Dashboard → Settings →
  API → JWT Secret), NOT the anon/publishable key.
- Role mapping: a user gains officer rights only if their DB row has
  role officer/admin (unchanged rule). A valid JWT for an unknown email is
  auto-provisioned as a role-less user -> 401 until an admin grants a role.
  (Tighten by requiring SUPABASE_REQUIRED_ROLE, or check ``user_roles`` in
  the JWT app_metadata when you add role management.)
- Never log raw tokens; never commit the secret (.env only).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import jwt as pyjwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import User

logger = logging.getLogger(__name__)

_SUPABASE_AUDIENCE = "authenticated"


@dataclass(frozen=True)
class SupabaseConfig:
    supabase_url: str | None
    jwt_secret: str | None
    service_role_key: str | None
    auto_provision: bool

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url and self.jwt_secret)

    @staticmethod
    def from_env() -> "SupabaseConfig":
        def _clean(name: str) -> str | None:
            value = os.environ.get(name)
            return value.strip() if value and value.strip() else None

        return SupabaseConfig(
            supabase_url=_clean("SUPABASE_URL"),
            jwt_secret=_clean("SUPABASE_JWT_SECRET"),
            service_role_key=_clean("SUPABASE_SERVICE_ROLE_KEY"),
            auto_provision=os.environ.get("SUPABASE_AUTO_PROVISION", "true").strip().lower() != "false",
        )


supabase_config = SupabaseConfig.from_env()


class SupabaseAuthError(RuntimeError):
    """Raised when a bearer token is present but fails verification."""


def verify_supabase_token(token: str, config: SupabaseConfig | None = None) -> dict[str, Any]:
    """Verify a Supabase access token (HS256) and return its claims.

    Raises:
        SupabaseAuthError: on any verification failure (expired, bad
            signature, wrong audience, malformed token).
    """
    cfg = config or supabase_config
    if not cfg.auth_configured:
        raise SupabaseAuthError("Supabase auth is not configured")
    try:
        claims: dict[str, Any] = pyjwt.decode(
            token,
            cfg.jwt_secret,  # type: ignore[arg-type]
            algorithms=["HS256"],
            audience=_SUPABASE_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise SupabaseAuthError("Supabase token has expired") from exc
    except pyjwt.InvalidTokenError as exc:
        raise SupabaseAuthError(f"Invalid Supabase token: {exc}") from exc
    return claims


def claims_email(claims: dict[str, Any]) -> str | None:
    email = claims.get("email")
    if isinstance(email, str) and email.strip():
        return email.strip().lower()
    # Sb v4 tokens sometimes carry the email only under user_metadata.
    metadata = claims.get("user_metadata") or {}
    if isinstance(metadata, dict):
        meta_email = metadata.get("email")
        if isinstance(meta_email, str) and meta_email.strip():
            return meta_email.strip().lower()
    return None


def resolve_user(db: Session, claims: dict[str, Any]) -> User | None:
    """Map verified Supabase claims to a ``users`` row (optionally create)."""
    from backend.models.enums import DataOrigin

    email = claims_email(claims)
    if not email:
        return None
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user
    if not supabase_config.auto_provision:
        return None
    user = User(
        email=email,
        full_name=(claims.get("user_metadata") or {}).get("full_name") or claims.get("name"),
        role=None,  # no rights until an admin grants officer/admin
        data_origin=DataOrigin.REAL,
    )
    db.add(user)
    db.flush()  # not commit: the request's transaction owns this row
    logger.info("Supabase auth: auto-provisioned user %s (role pending)", email)
    return user


def storage_client(config: SupabaseConfig | None = None) -> Any:
    """Lazily build a Supabase Storage client (service-role key required).

    Only the Storage REST surface is used; nothing here competes with
    Postgres as the system of record. Raises SupabaseAuthError when the
    service-role key or URL is missing.
    """
    cfg = config or supabase_config
    if not (cfg.supabase_url and cfg.service_role_key):
        raise SupabaseAuthError(
            "Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
        )
    try:
        from supabase import create_client

        return create_client(cfg.supabase_url, cfg.service_role_key)
    except Exception as exc:  # pragma: no cover - depends on optional package
        raise SupabaseAuthError(f"Supabase client unavailable: {exc}") from exc
