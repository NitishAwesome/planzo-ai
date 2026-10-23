import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from google.genai import errors
from app.config import settings
from app.gemini_service import (
    GeminiConfigError,
    GeminiUpstreamError,
    get_gemini_client,
    stream_chat_response,
)
from app.schemas import ChatRequest, EventContext


def test_get_gemini_client_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    with pytest.raises(GeminiConfigError):
        get_gemini_client()


@pytest.mark.asyncio
async def test_stream_chat_response_success(sample_payload, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")

    mock_chunk_1 = MagicMock()
    mock_chunk_1.text = "Hello "
    mock_chunk_2 = MagicMock()
    mock_chunk_2.text = "World"

    async def mock_async_stream():
        yield mock_chunk_1
        yield mock_chunk_2

    mock_client = MagicMock()
    mock_client.aio.models.generate_content_stream = AsyncMock(return_value=mock_async_stream())

    with patch("app.gemini_service.get_gemini_client", return_value=mock_client):
        request = ChatRequest(**sample_payload)
        tokens = [token async for token in stream_chat_response(request)]
        assert tokens == ["Hello ", "World"]


@pytest.mark.asyncio
async def test_stream_chat_response_upstream_api_error(sample_payload, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")

    mock_client = MagicMock()
    # Mocking an API error on call
    mock_client.aio.models.generate_content_stream = AsyncMock(
        side_effect=errors.APIError(429, {"error": {"message": "Quota exceeded"}})
    )

    with patch("app.gemini_service.get_gemini_client", return_value=mock_client):
        request = ChatRequest(**sample_payload)
        with pytest.raises(GeminiUpstreamError) as exc_info:
            async for _ in stream_chat_response(request):
                pass
        assert "Quota exceeded" in str(exc_info.value)
