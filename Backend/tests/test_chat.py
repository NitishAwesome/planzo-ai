import json
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from app.config import settings
from app.gemini_service import GeminiUpstreamError


def test_chat_missing_api_key(client: TestClient, sample_payload, monkeypatch):
    """Detects missing API key before starting stream and returns 503."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    response = client.post("/api/chat", json=sample_payload)
    assert response.status_code == 503
    assert "Gemini API is not configured" in response.json()["detail"]


def test_chat_empty_user_message(client: TestClient, sample_payload, monkeypatch):
    """Rejects empty or whitespace-only user messages with 422."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")
    payload = dict(sample_payload)
    payload["userMessage"] = "   "
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_chat_missing_user_message(client: TestClient, sample_payload, monkeypatch):
    """Rejects requests missing userMessage with 422."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")
    payload = dict(sample_payload)
    del payload["userMessage"]
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_chat_malformed_event_context(client: TestClient, monkeypatch):
    """Rejects malformed eventContext with 422."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")
    payload = {
        "eventContext": "not-an-object",
        "userMessage": "Hello"
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_chat_user_message_too_long(client: TestClient, sample_payload, monkeypatch):
    """Rejects excessively long user messages."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")
    payload = dict(sample_payload)
    payload["userMessage"] = "x" * 2001
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_chat_valid_sse_streaming(client: TestClient, sample_payload, monkeypatch):
    """Verifies successful SSE streaming response with token events and done event."""
    monkeypatch.setattr(settings, "gemini_api_key", "mock_key")

    mock_tokens = [
        "Seminar Hall A is recommended ",
        "because it is indoor, fits 50 attendees, ",
        "and has all required equipment."
    ]

    async def mock_stream_chat(request):
        for token in mock_tokens:
            yield token

    with patch("app.main.stream_chat_response", side_effect=mock_stream_chat):
        response = client.post("/api/chat", json=sample_payload)
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        assert response.headers["cache-control"] == "no-cache"

        raw_text = response.text
        # Verify valid SSE framing
        assert "event: token\n" in raw_text
        assert "event: done\n" in raw_text

        # Parse SSE messages
        events = []
        blocks = raw_text.strip().split("\n\n")
        for b in blocks:
            if not b.strip():
                continue
            lines = b.strip().split("\n")
            ev = None
            data = None
            for line in lines:
                if line.startswith("event: "):
                    ev = line[len("event: "):].strip()
                elif line.startswith("data: "):
                    data = json.loads(line[len("data: "):].strip())
            if ev:
                events.append((ev, data))

        # Check token events
        token_events = [e for e in events if e[0] == "token"]
        assert len(token_events) == 3
        assert token_events[0][1]["text"] == mock_tokens[0]
        assert token_events[1][1]["text"] == mock_tokens[1]
        assert token_events[2][1]["text"] == mock_tokens[2]

        # Check done event
        done_events = [e for e in events if e[0] == "done"]
        assert len(done_events) == 1
        assert done_events[0][1]["status"] == "complete"


def test_chat_upstream_error_handling(client: TestClient, sample_payload, monkeypatch):
    """Verifies that upstream errors during streaming yield an error event."""
    monkeypatch.setattr(settings, "gemini_api_key", "mock_key")

    async def mock_stream_error(request):
        yield "Starting analysis... "
        raise GeminiUpstreamError("Gemini rate limit exceeded.")

    with patch("app.main.stream_chat_response", side_effect=mock_stream_error):
        response = client.post("/api/chat", json=sample_payload)
        assert response.status_code == 200
        raw_text = response.text

        # Verify an error event was emitted
        assert "event: error\n" in raw_text
        assert "Gemini rate limit exceeded" in raw_text


def test_cors_configuration(client: TestClient):
    """Verifies CORS headers for allowed and disallowed origins."""
    # Test allowed origin
    allowed_origin = "http://localhost:5173"
    response = client.options(
        "/api/health",
        headers={
            "Origin": allowed_origin,
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.headers.get("access-control-allow-origin") == allowed_origin

    # Test disallowed origin
    unauthorized_origin = "http://malicious-website.com"
    response_unauth = client.options(
        "/api/health",
        headers={
            "Origin": unauthorized_origin,
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response_unauth.headers.get("access-control-allow-origin") is None
