# Product Feedback & Developer Experience Report

This report provides factual feedback on the core technologies, developer tools, and SDKs utilized while architecting and building **Planzo**.

---

## 1. Google Gemini API & Google GenAI Python SDK (`google-genai`)

### What It Was Used For
- Powering the conversational intelligence layer in the FastAPI backend (`Backend/app/gemini_service.py`).
- Generating grounded, streamed explanations of simulated weather disruption risks and venue trade-offs via Server-Sent Events (`POST /api/chat`).
- Adapting to the Alexa+ simulation voice persona while respecting strict grounding constraints.

### What Worked Well
- **Asynchronous Streaming (`client.aio.models.generate_content_stream`):** The streaming API in the new `google-genai` SDK is responsive, producing initial tokens in sub-500ms with low latency.
- **System Instructions Integration:** Passing strict operational boundaries and grounding rules via `types.GenerateContentConfig(system_instruction=...)` proved highly effective at keeping Gemini focused solely on the provided structured JSON context.
- **Model Efficiency (`gemini-3.5-flash-lite` / `gemini-3.8-flash`):** High throughput and low latency made the conversational exchange feel natural for a real-time voice-assistant simulation.

### Challenges Encountered
- **SDK Transition:** Migrating from legacy packages (`google-generativeai`) to the unified `google-genai` SDK required adjusting import paths (`from google import genai`, `from google.genai import types`). Once established, the type hints in Pydantic and async interfaces were clean.

### Would We Use It Again?
- **Yes.** The combination of fast streaming, structured system prompts, and competitive cost-to-performance makes Gemini an outstanding choice for operational AI copilots.

---

## 2. FastAPI & Uvicorn

### What It Was Used For
- Lightweight asynchronous backend service exposing `GET /api/health` and `POST /api/chat`.
- Streaming Server-Sent Events (`StreamingResponse` with `media_type="text/event-stream"`).
- Strict contract validation using Pydantic v2 schemas (`ChatRequest`, `EventContext`, `Venue`, `Evaluation`).

### What Worked Well
- **Native Async & SSE Support:** Handling long-lived streaming responses with async generator functions was straightforward and required zero heavy background queue infrastructure.
- **Pydantic v2 Validation:** Automatic serialization, deserialization, and schema validation guaranteed that invalid client payloads were rejected before invoking upstream model calls.
- **Testing:** `starlette.testclient.TestClient` with `pytest` allowed fast, comprehensive testing of both healthy and failing SSE stream paths.

### Challenges Encountered
- **Streaming Exception Handling:** Once SSE headers (`HTTP 200`) are sent to the client, downstream errors (e.g., model rate limits) cannot be communicated via standard HTTP status codes. We resolved this by defining an explicit SSE error event (`event: error\ndata: {...}`) that the frontend parser recognizes.

### Would We Use It Again?
- **Yes.** For streaming AI backends and microservices, FastAPI remains the standard for speed, typing, and developer ergonomics.

---

## 3. TanStack Start, TanStack Router & Vite

### What It Was Used For
- Frontend application routing, SSR/client builds, and development server (`Frontend/`).
- File-based route hierarchy:
  - `/` — Operations Dashboard
  - `/events` — All Events List
  - `/events/$id` — Event Cockpit & Decision Studio
  - `/activity` — Decision History Audit Trail

### What Worked Well
- **Type-Safe Routing:** Catching route parameter errors at compile time (`Route.useParams()`, typed `Link` params).
- **Fast HMR:** Vite v8 provided sub-second Hot Module Replacement during component styling and state iterations.
- **SSR Compilation:** Clean Nitro presets producing static assets and lightweight server handlers.

### Challenges Encountered
- **Initial Lovable Config Removal:** The initial template had dependencies on `@lovable.dev/vite-tanstack-config` and Bun. Transitioning to a pure Vite + TanStack Start configuration with standard npm required cleaning up custom plugins, adjusting path aliases in `vite.config.ts`, and regenerating `package-lock.json`.
- **Fast Refresh Warnings:** Exporting constants alongside React components in UI libraries triggers standard `react-refresh/only-export-components` warnings during linting.

### Would We Use It Again?
- **Yes.** TanStack Router is among the best type-safe routing solutions in the React ecosystem.

---

## 4. Tailwind CSS & Lucide Icons

### What It Was Used For
- Complete design system, dark/light theme tokens, responsive layouts, and UI iconography across desktop and mobile form factors.

### What Worked Well
- **Design Tokens:** Pre-configured CSS variables (`--background`, `--foreground`, `--primary`, `--warning`, `--success`) allowed creating a cohesive, high-contrast operational aesthetic without ad-hoc styling.
- **Responsive Utilities:** Effortless responsive adaptation between desktop two-column layouts and mobile stacked views with sticky bottom navigation.

### Would We Use It Again?
- **Yes.** Unmatched development speed and maintainability.

---

## 5. Developer Notes Requiring Human Confirmation

> [!NOTE]
> *The following questions should be reviewed by the human developer based on personal experience prior to final submission:*
> - **Did you experience any API quota issues or geographical latency during development?** (Default assumption: Local execution with Gemini flash-lite was responsive without quota bottlenecks.)
> - **Any specific feedback on the Amazon Developer Hackathon portal submission flow?**
