# Planzo — Intelligent Event Contingency & Recovery Assistant

## One-Line Pitch
Planzo pairs Google Gemini conversational intelligence with a deterministic planning engine to simulate an Alexa+ event operations assistant that senses weather disruptions, recommends grounded venue alternatives, and drafts attendee communications upon human authorization.

---

## Problem
Event operations teams manage complex, high-stakes logistics under tight deadlines. When unexpected disruptions occur—such as an unpredicted rainstorm threatening an outdoor workshop—organizers face a chaotic scramble:
1. **Fragmented Room Information:** Identifying available backup spaces requires frantically cross-referencing campus booking calendars, room capacities, and A/V equipment lists.
2. **Hallucination Risk in Agentic AI:** Generic LLM agents cannot be trusted to autonomously execute facility relocations; an ungrounded model might promise a hall that is already booked, lacks required projectors, or is physically too small for the attendee count.
3. **Communication Bottlenecks:** Even after a decision is made, drafting clear, accurate notifications with updated building locations and unchanged timelines takes valuable time.

---

## Solution
Planzo resolves this challenge by strictly separating **conversational intelligence** from **deterministic execution**:
- **Grounded Conversational Interface (Alexa+ Simulation):** Organizers interact naturally through voice or text prompts (e.g. *"Alexa, ask Planzo what's happening with TechFest"*, *"Alexa, ask Planzo to find a safer venue"*).
- **Authoritative Deterministic Engine:** Rather than allowing the LLM to guess, Planzo's TypeScript planning engine computes physical feasibility: evaluating venue capacity ($\ge$ attendee count), indoor protection against rain, required A/V equipment presence, and booking conflicts across the event time window.
- **Human-in-the-Loop Safety Guardrail:** The AI is strictly advisory. Conversational attempts to execute bookings (e.g. *"Alexa, approve this change"*) are intercepted with safety guidance directing the user to review the proposal card and click an explicit authorization button.
- **Automated Post-Approval Recovery:** Upon human approval, Planzo updates reservations atomically and auto-generates a formatted attendee announcement ready for one-click clipboard copying.

---

## Core Features

### 1. Operations Overview Dashboard
- High-level bird's-eye view of upcoming events, at-risk events, and suitable backup venues.
- Priority alert highlighting events facing simulated disruptions.

### 2. Alexa+ Experience Simulation Mode
- Emulates a multimodal smart display or voice assistant within the Event Cockpit.
- Voice query normalization that automatically handles Alexa wake words and invocation phrasing.
- Real-time Server-Sent Events (SSE) token streaming powered by Google Gemini via FastAPI.
- Optional speech synthesis to read assistant responses aloud hands-free.

### 3. Deterministic Decision Studio
- Side-by-side before/after comparison table (venue setting, capacity, time window).
- "Why Recommended" rationale highlighting least-wasted capacity and weather protection.
- Transparent venue evidence explaining exactly why other venues were excluded (e.g., conflicting booking, missing equipment, insufficient seats).

### 4. Human-Authorized Action Safety
- Clear separation between advisory reasoning and operational execution.
- Conversational attempts to approve trigger safety guidance directing users to manual confirmation.

### 5. Post-Approval Recovery & Attendee Announcement Draft
- Immediate status transition to "Handled & verified" upon approval.
- Grounded announcement generator producing an accurate notification with event name, previous venue, new venue, unchanged schedule, and contingency context.
- Single-click clipboard copy with visual feedback toast.

### 6. Chronological Activity History
- Permanent audit trail logging all approved and rejected decisions with timestamps and explanations.

---

## Technical Architecture

```mermaid
sequenceDiagram
    actor Operator as Event Operator
    participant UI as Planzo Cockpit (React 19 + TanStack)
    participant Engine as Planning Engine (TypeScript)
    participant API as Backend (FastAPI)
    participant Gemini as Google Gemini API

    Operator->>UI: "Alexa, ask Planzo to find a safer venue"
    UI->>Engine: evaluateVenues() + buildProposal()
    Engine-->>UI: Grounded Proposal (Seminar Hall A, Evidence)
    UI->>API: POST /api/chat (EventContext + UserMessage)
    API->>Gemini: Stream grounded explanation
    Gemini-->>API: Chunks
    API-->>UI: SSE stream (tokens)
    UI-->>Operator: Display streamed explanation + ProposalCard
    Operator->>UI: Click "Approve"
    UI->>Engine: approveProposal()
    Engine-->>UI: Atomic Booking Swap + Handled Status
    UI-->>Operator: RecoveryCompleted (Announcement Draft + Copy)
```

- **Frontend:** React 19, TypeScript, TanStack Start, TanStack Router, Vite, Tailwind CSS, Lucide Icons, Sonner.
- **Backend:** Python 3.11, FastAPI, Uvicorn, Google GenAI SDK (`google-genai`), Pydantic v2.
- **Model:** Google Gemini (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) via streaming SSE.
- **Data Architecture:** Authoritative typed seed state in `localStorage` with instant reset capability.

---

## Alexa+ Simulation Explanation
Planzo entered the **Alexa+ Simulated Experience** track to explore how next-generation, agentic ambient assistants can assist operations managers. Instead of rigid slot-filling skills, Planzo illustrates how an agentic assistant can:
1. Ground conversational answers in live application state.
2. Formulate multi-step recovery proposals with explicit rationale.
3. Gracefully refuse unsafe autonomous actions and guide the human operator to authorize decisions.

---

## Innovation & Impact
- **Zero-Hallucination Operations:** By offloading room constraints, capacities, and scheduling logic to deterministic algorithms, the LLM is restricted to explanation and synthesis—eliminating catastrophic scheduling errors.
- **Human-in-the-Loop Governance:** Combines the speed of AI recommendations with human oversight for physical asset allocation.
- **Instant Recovery Time:** Reduces contingency decision-making and attendee communication drafting from 30+ minutes of manual coordination to under 30 seconds.

---

## What's Next
- **Production Alexa Skill Deployment:** Implementing an Alexa Presentation Language (APL) interface for physical Echo Show and smart display devices.
- **Multi-Tenant Calendar Integrations:** Live sync with Google Workspace Calendar, Microsoft 365, and campus room scheduling systems (e.g. EMS).
- **Multi-Channel Notification Dispatch:** Direct integration with Twilio SMS, Slack webhooks, and email listservs for instant one-click broadcasting upon approval.
