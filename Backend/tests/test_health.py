from fastapi.testclient import TestClient
from app.config import settings


def test_health_when_configured(client: TestClient, monkeypatch):
    """Verifies that health check returns ok and indicates Gemini is configured."""
    monkeypatch.setattr(settings, "gemini_api_key", "mock_key_12345")
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["gemini_configured"] is True
    assert data["model"] == settings.gemini_model
    # Ensure raw API key is never exposed
    assert "mock_key_12345" not in response.text


def test_health_when_unconfigured(client: TestClient, monkeypatch):
    """Verifies health check when API key is missing or blank."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["gemini_configured"] is False
    assert data["model"] == settings.gemini_model


def test_allowed_origins_env_override(monkeypatch):
    """Verifies that ALLOWED_ORIGINS env variable dynamically overrides default origins."""
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://planzo.app, https://demo.planzo.app")
    from app.config import Settings
    s = Settings()
    assert s.allowed_origins == ["https://planzo.app", "https://demo.planzo.app"]

