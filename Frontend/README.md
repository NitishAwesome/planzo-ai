# Planzo Frontend

React 19 + TanStack Start frontend application for **Planzo**, an intelligent event contingency cockpit and Alexa+-inspired simulation.

---

## Capabilities

- **Operations Dashboard (`/`):** High-level view of upcoming events, at-risk events, available alternative venues, and priority decision highlights.
- **Event List & Cockpit (`/events`, `/events/$id`):** Detailed event schedule, attendee count, current venue specifications, and equipment needs.
- **Alexa+ Experience Simulation:** Toggleable conversational interface simulating an Alexa+ multimodal smart screen experience, powered by live Gemini SSE streaming via the FastAPI backend.
- **Deterministic Decision Studio:** Real-time venue eligibility evaluation (capacity, indoor setting, equipment match, schedule conflict).
- **Human-in-the-Loop Guardrail:** Natural-language approval requests are safely intercepted with instructions directing users to manual confirmation buttons.
- **Post-Approval Recovery (`RecoveryCompleted.tsx`):** Displays updated venue assignment, verification badges, and an auto-generated attendee communication draft with one-click clipboard copy.
- **Activity Log (`/activity`):** Chronological history of all approved and rejected contingency actions.
- **Offline Fallback:** Pre-computed advisory replies if the backend or internet connection is unavailable.
- **Browser-Local Persistence:** Dynamic state saved to `localStorage` with an instant demo reset modal.

---

## Scripts & Development

From `Frontend/`:

```powershell
# Install dependencies
npm install

# Run development server (Vite on http://localhost:8080)
npm run dev

# Run Vitest test suite (43 tests)
npm test

# Run TypeScript type check
npx tsc --noEmit

# Run ESLint + Prettier
npm run lint

# Build production bundle
npm run build
```

---

## Configuration

Environment variables can be supplied in `Frontend/.env` or via Vite:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | URL of the Planzo FastAPI backend service |

---

## Directory Structure

- `src/components/` — UI components (`DecisionStudio.tsx`, `RecoveryCompleted.tsx`, `DecisionRow.tsx`, `AppShell.tsx`, `bits.tsx`).
- `src/lib/planning.ts` — Deterministic venue eligibility, proposal generator, voice query normalizer, and announcement builder.
- `src/data/` — Types and seed data (`seed.ts`, `types.ts`).
- `src/services/` — `demo-store.ts` (localStorage state store), `chat-api.ts` (FastAPI SSE client).
- `src/routes/` — TanStack file-based routes (`index.tsx`, `events.index.tsx`, `events.$id.tsx`, `activity.tsx`).
- `src/test/` — Vitest unit and component tests.
