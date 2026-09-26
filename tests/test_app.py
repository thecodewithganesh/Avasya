from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def application(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    import backend.core.config as config

    importlib.reload(config)  # settings must re-read env before main builds CORS
    import backend.main

    yield importlib.reload(backend.main)

    # Restore the test-suite DATABASE_URL after any test that cleared it,
    # otherwise later tests reload settings with a missing URL or attempt a
    # real DB connection and hang. Set explicitly (monkeypatch undo happens
    # after this fixture's teardown, so the env var may be absent here).
    import os

    os.environ["DATABASE_URL"] = "postgresql+psycopg://test:test@localhost:5432/test"
    os.environ["CORS_ORIGINS"] = "https://example.com"
    importlib.reload(config)
    importlib.reload(backend.main)


def test_fastapi_import_and_health(application) -> None:
    class FakeSession:
        def execute(self, statement):
            assert "SELECT 1" in str(statement)

    def override_get_db():
        yield FakeSession()

    application.app.dependency_overrides[application.get_db] = override_get_db
    try:
        response = TestClient(application.app).get("/health")
    finally:
        application.app.dependency_overrides.clear()

    assert response.status_code == 200
    # /health includes a database probe so the frontend status chip can
    # distinguish CONNECTED from backend-only availability.
    assert response.json()["status"] == "ok"
    assert "database" in response.json()


def test_root_returns_api_status_and_links(application) -> None:
    response = TestClient(application.app).get("/")

    assert response.status_code == 200
    assert response.json() == {
        "name": "AVASYA Backend",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


def test_database_health(application) -> None:
    class FakeResult:
        def scalar_one(self):
            return 1

    class FakeSession:
        def execute(self, statement):
            assert "SELECT 1" in str(statement)
            return FakeResult()

    def override_get_db():
        yield FakeSession()

    application.app.dependency_overrides[application.get_db] = override_get_db
    try:
        response = TestClient(application.app).get("/health/db")
    finally:
        application.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_cors_is_environment_driven(application) -> None:
    class FakeSession:
        def execute(self, statement):
            return None

    def override_get_db():
        yield FakeSession()

    application.app.dependency_overrides[application.get_db] = override_get_db
    try:
        response = TestClient(application.app).get(
            "/health",
            headers={"Origin": "https://example.com"},
        )
    finally:
        application.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://example.com"


def test_cors_allows_production_netlify_frontend(application) -> None:
    class FakeSession:
        def execute(self, statement):
            return None

    def override_get_db():
        yield FakeSession()

    application.app.dependency_overrides[application.get_db] = override_get_db
    try:
        response = TestClient(application.app).get(
            "/health",
            headers={"Origin": "https://avasya1.netlify.app"},
        )
    finally:
        application.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://avasya1.netlify.app"


def test_configuration_requires_database_url(application, monkeypatch) -> None:
    """Runs through the `application` fixture so config/main are restored
    afterwards instead of leaving a broken no-DATABASE_URL module state."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import backend.core.config as config

    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        importlib.reload(config)


def test_render_database_url_uses_psycopg_driver(application, monkeypatch) -> None:
    import backend.core.config as config

    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@db.example.com:5432/app")
    reloaded = importlib.reload(config)

    assert reloaded.settings.DATABASE_URL == (
        "postgresql+psycopg://user:pass@db.example.com:5432/app"
    )


def test_habitation_routes_validate_input_and_unknown_resources(application) -> None:
    class FakeScalars:
        def all(self):
            return []

    class FakeSession:
        def scalar(self, statement):
            return None

        def scalars(self, statement):
            return FakeScalars()

    def override_get_db():
        yield FakeSession()

    application.app.dependency_overrides[application.get_db] = override_get_db
    try:
        client = TestClient(application.app)
        assert client.get("/api/v1/habitations?limit=0").status_code == 422
        assert client.get("/api/v1/habitations/999999").status_code == 404
        assert client.get("/api/v1/habitations").status_code == 200
    finally:
        application.app.dependency_overrides.clear()


def test_approval_requires_authentication(application) -> None:
    response = TestClient(application.app).post(
        "/api/v1/recommendations/1/approval",
        json={"action": "APPROVE"},
    )
    assert response.status_code == 401
