# Planzo Devpost Submission Checklist

**Hackathon:** Amazon Developer Hackathon 2026  
**Category / Track:** Alexa+ Simulated Experience  
**Deadline:** October 24, 2026, 00:30 IST  

---

## 1. Codebase & Repository Verification

- [x] **Public GitHub Repository:** Codebase structured into clean `Frontend/` and `Backend/` workspaces in `D:\planzo-ai`.
- [x] **Open-Source License:** Standard MIT License present in repository root (`LICENSE`).
- [x] **Reproducible Setup Instructions:** Comprehensive Windows PowerShell setup and test commands documented in root `README.md`, `Frontend/README.md`, and `Backend/README.md`.
- [x] **Secret-Key & Credential Audit:**
  - `Backend/.env` is strictly git-ignored (`.gitignore`).
  - `.env.example` provides clean mock values (`GEMINI_API_KEY=your_gemini_api_key_here`).
  - No API keys, credentials, or personal secrets committed anywhere in git history or repository files.
- [x] **Clean Dependency Manifests:**
  - `package.json` and `package-lock.json` are consistent; standard npm workflow verified.
  - `Backend/requirements.txt` specifies tested pinned versions (`fastapi`, `uvicorn`, `google-genai`, `httpx`, `pydantic`).

---

## 2. Technical Capabilities & Testing

- [x] **FastAPI + Gemini Streaming Backend:**
  - Live SSE streaming endpoint at `POST /api/chat`.
  - Health check endpoint at `GET /api/health` returning configured status and model name.
  - Live meteorological search and forecast proxy at `GET /api/locations/search` and `GET /api/weather/forecast`.
  - 21/21 Pytest tests passing in `Backend/`.
- [x] **Live Meteorological Intelligence (Open-Meteo):**
  - City geocoding with 10-minute in-memory TTL caching.
  - Hourly forecast parsing within event time windows with 5-minute TTL caching.
  - Distinct badges for `Forecast from Open-Meteo` vs `Simulated scenario` with Open-Meteo attribution.
- [x] **Facility & Event Management (CRUD):**
  - Venue creation, editing, and safe deletion (blocking deletion of occupied venues).
  - Dynamic slot availability checker.
  - Event creation, editing, cancellation, and deletion with capacity warnings.
- [x] **Interactive Alexa+ Experience Simulation:**
  - Voice query normalization strips wake words and prefixes (`"Alexa, ask Planzo..."`).
  - Streaming UI with dynamic cursor, token-by-token rendering, and fallback indicators.
  - Optional browser speech synthesis (Text-to-Speech) for hands-free audio.
- [x] **Deterministic Planning Engine:**
  - Evaluates indoor suitability, seat capacity, required A/V equipment, and booking conflicts.
  - Selects smallest eligible room (least wasted capacity).
  - Provides full transparent evidence explaining why alternative venues were excluded.
- [x] **Human-in-the-Loop Action Safety Guardrail:**
  - Conversational approval attempts are intercepted with safety guidance.
  - Relocations can only be executed by clicking the manual "Approve" button.
- [x] **Post-Approval Recovery Workflow:**
  - Instant transition to "Handled & verified" status upon approval.
  - Auto-generated attendee announcement draft with previous venue, new venue, unchanged time, and contingency reason.
  - Single-click clipboard copy with visual feedback toast.
  - Permanent audit logging in Activity history.
- [x] **Automated Test Suites Passing:**
  - Frontend Vitest: 130 / 130 tests passing (`npm test`); see the [independent Codex review](../audits/2026-10-23-codex-review.md).
  - TypeScript Typecheck: 0 errors (`npx tsc --noEmit`).
  - ESLint: 0 errors (`npm run lint`).
  - Frontend Production Build: Succeeded cleanly (`npm run build`).
  - Backend Pytest: 21 / 21 tests passing (`pytest`).

---

## 3. Demo Video Requirements

- [ ] 🚨 **USER ACTION REQUIRED — Record Video:** Record demo video following [demo_script.md](file:///d:/planzo-ai/docs/submission/demo_script.md).
- [ ] 🚨 **USER ACTION REQUIRED — Duration Check:** Confirm total video duration is strictly under 3 minutes (script targets ~2 minutes 30 seconds).
- [ ] 🚨 **USER ACTION REQUIRED — Upload Video:** Upload video to YouTube (as Public or Unlisted) or Vimeo.
- [ ] 🚨 **USER ACTION REQUIRED — Copy Video URL:** Paste the public video link into the Devpost submission form.

---

## 4. Devpost Submission Materials

- [x] **Project Description Prepared:** Complete markdown draft ready in [project_description.md](file:///d:/planzo-ai/docs/submission/project_description.md) (Pitch, Problem, Solution, Features, Architecture, Innovation, What's Next).
- [x] **Demo Video Script Prepared:** Word-for-word timed script ready in [demo_script.md](file:///d:/planzo-ai/docs/submission/demo_script.md).
- [x] **Product Feedback Draft Prepared:** Tool evaluation ready in [product_feedback.md](file:///d:/planzo-ai/docs/submission/product_feedback.md).
- [x] **Final Status Report Prepared:** Engineering status and limitations documented in [final_status.md](file:///d:/planzo-ai/docs/submission/final_status.md).

---

## 5. Devpost Form Fields Reference

| Devpost Field | Recommended Value / Content Source |
| :--- | :--- |
| **Project Title** | `Planzo — Intelligent Event Contingency & Recovery Assistant` |
| **Tagline (One-line pitch)** | `Grounded conversational operations assistant simulating Alexa+ to sense event disruptions, evaluate venue contingencies, and coordinate human-approved recovery.` |
| **Track / Category** | `Alexa+ Simulated Experience` |
| **Built With** | `React, TypeScript, TanStack Start, TanStack Router, Vite, Tailwind CSS, Python, FastAPI, Uvicorn, Google Gemini API, Google GenAI SDK, Open-Meteo API, HTTPX, Server-Sent Events` |
| **GitHub Repository URL** | `https://github.com/NitishAwesome/planzo-ai` (public repository verified during the independent review) |
| **Demo Video URL** | `[YOUR_YOUTUBE_OR_VIMEO_URL]` (🚨 *User action required*) |
| **Project Description** | Copy formatted contents from `docs/submission/project_description.md`. |

---

## 6. Final Pre-Submission Verification

- [ ] 🚨 **Git Final Push:** Verify with `git status` that all changes are staged and pushed to your public GitHub repository before the deadline.
- [ ] 🚨 **Submit on Devpost:** Complete the Devpost submission before October 24, 2026, 00:30 IST.
