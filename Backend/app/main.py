import asyncio
import json
import logging
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .gemini_service import (
    GeminiConfigError,
    GeminiUpstreamError,
    stream_chat_response,
)
from .schemas import ChatRequest, HealthResponse
from .weather import router as weather_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("planzo-backend")

app = FastAPI(
    title="Planzo API",
    description="Intelligent Event Contingency & Recovery Assistant API",
    version="1.0.0",
)

# Mount Open-Meteo Weather router
app.include_router(weather_router, prefix="/api")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Returns the operational status of the service and Gemini configuration state."""
    return HealthResponse(
        status="ok",
        gemini_configured=settings.is_gemini_configured,
        model=settings.gemini_model,
    )


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    POST /api/chat
    Streams grounded natural language responses for event contingency queries via SSE.
    """
    # Detect configuration errors before starting the streaming response
    if not settings.is_gemini_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API is not configured on this server.",
        )

    async def sse_event_stream():
        try:
            async for token in stream_chat_response(request):
                payload = json.dumps({"text": token})
                yield f"event: token\ndata: {payload}\n\n"

            done_payload = json.dumps({"status": "complete"})
            yield f"event: done\ndata: {done_payload}\n\n"
        except GeminiUpstreamError as e:
            logger.error("Gemini upstream error during stream: %s", e)
            safe_msg = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {safe_msg}\n\n"
        except asyncio.CancelledError:
            logger.info("Client disconnected from chat stream")
            raise
        except Exception as e:
            logger.exception("Unexpected error during stream: %s", e)
            safe_msg = json.dumps({"error": "An internal error occurred while generating response."})
            yield f"event: error\ndata: {safe_msg}\n\n"

    return StreamingResponse(
        sse_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
