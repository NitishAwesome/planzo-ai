from typing import AsyncIterator
from google import genai
from google.genai import types, errors
from .config import settings
from .prompt import SYSTEM_INSTRUCTION, build_user_prompt
from .schemas import ChatRequest


class GeminiConfigError(Exception):
    """Raised when Gemini API is not configured."""
    pass


class GeminiUpstreamError(Exception):
    """Raised when an error occurs while communicating with Gemini API."""
    pass


def get_gemini_client() -> genai.Client:
    """Returns an authenticated Gemini client if configured."""
    if not settings.is_gemini_configured:
        raise GeminiConfigError("Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.")
    return genai.Client(api_key=settings.gemini_api_key)


async def stream_chat_response(request: ChatRequest) -> AsyncIterator[str]:
    """
    Streams textual responses from Gemini using the async streaming interface.
    Yields chunks of text as they arrive from the model.
    """
    client = get_gemini_client()
    prompt = build_user_prompt(request)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.2,
    )

    try:
        response_stream = await client.aio.models.generate_content_stream(
            model=settings.gemini_model,
            contents=prompt,
            config=config,
        )
    except errors.APIError as e:
        raise GeminiUpstreamError(f"Gemini API error: {e.message or 'Upstream error'}") from e
    except Exception as e:
        raise GeminiUpstreamError(f"Upstream communication failure: {str(e)}") from e

    try:
        async for chunk in response_stream:
            text = chunk.text
            if text:
                yield text
    except errors.APIError as e:
        raise GeminiUpstreamError(f"Gemini streaming error: {e.message or 'Stream error'}") from e
    except Exception as e:
        raise GeminiUpstreamError(f"Stream interrupted: {str(e)}") from e
