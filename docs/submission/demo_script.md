# Planzo Demo Video Script

**Target Duration:** ~2 minutes 30 seconds  
**Track:** Amazon Developer Hackathon 2026 — Alexa+ Simulated Experience  
**Core Story:** A simulated weather disruption threatens an outdoor workshop, and Planzo uses conversational AI and deterministic planning to evaluate backup venues, guide human approval, and draft attendee announcements.

---

### [0:00 – 0:25] The Hook & The Problem

| Time | Screen / Action | Narration (Spoken) |
| :--- | :--- | :--- |
| **0:00 – 0:10** | **Operations Dashboard (`/`)** showing 1 priority alert: **TechFest Workshop** in Outdoor Courtyard, 50 attendees, simulated heavy rain risk (85%). | *"It's Friday morning on campus, and 50 attendees are heading to the TechFest Workshop at the Outdoor Courtyard. Suddenly, a simulated forecast warns of heavy rain right during the event window. In traditional event management, finding a dry backup room takes frantic calls and cross-checking spreadsheets. Meet Planzo."* |
| **0:10 – 0:25** | Click **"Review contingency"** to open the TechFest Cockpit (`/events/techfest`). Highlight attendees (50), Outdoor Courtyard, and required equipment: Projector, Microphones, Seating. | *"Planzo is an intelligent event operations assistant that pairs conversational AI with deterministic planning logic. Let's enter the TechFest Cockpit."* |

---

### [0:25 – 1:05] The Alexa+ Conversational Simulation

| Time | Screen / Action | Narration (Spoken) |
| :--- | :--- | :--- |
| **0:25 – 0:40** | Click **"Enter Alexa+ Simulation"** toggle button in the top right. The voice interface badge activates with prompt suggestions. Click prompt chip: *"Alexa, ask Planzo what's happening with TechFest Workshop"*. Live response streams via SSE. | *"Planzo features an interactive Alexa+ Experience Simulation. We can ask Planzo hands-free: 'Alexa, ask Planzo what's happening with TechFest Workshop.' The query is normalized, grounded in live event data, and streamed in real time using Google Gemini via our FastAPI backend."* |
| **0:40 – 1:05** | Click prompt chip: *"Alexa, ask Planzo to find a safer venue"*. Gemini streams the advisory response; below, the deterministic proposal card renders. | *"Next, we ask: 'Alexa, ask Planzo to find a safer venue.' Gemini streams the explanation, while our deterministic engine evaluates every campus venue against physical constraints."* |

---

### [1:05 – 1:40] Grounded Reasoning & Action Safety

| Time | Screen / Action | Narration (Spoken) |
| :--- | :--- | :--- |
| **1:05 – 1:25** | Point to the **Proposed Change** card. Highlight **Seminar Hall A** (80 seats, indoor). Show before/after table, rationale, and **Venue Evidence** showing why Seminar Hall B (too small, booked) and Conference Room 2 (conflicting faculty meeting) were excluded. | *"Notice what happened here: Planzo didn't hallucinate a venue. Our deterministic planning engine evaluated capacity, equipment, and room conflicts. It selected Seminar Hall A—indoor, fully equipped, and free. It also transparently proves why other venues were excluded."* |
| **1:25 – 1:40** | Type in chat input: *"Alexa, please approve this change and move it"* and press Enter. Planzo streams safety guidance: *"To ensure operational safety, booking changes cannot be executed conversationally... click the explicit Approve button."* | *"Now, what if we try to approve through voice? Planzo strictly enforces human-in-the-loop safety. It tells us that room reallocations cannot be executed conversationally, directing the human operator to manually authorize the change."* |

---

### [1:40 – 2:10] Human Authorization & Post-Approval Recovery

| Time | Screen / Action | Narration (Spoken) |
| :--- | :--- | :--- |
| **1:40 – 1:55** | Click the green **"Approve"** button. The card transforms to **"Recovery completed"** with **"Handled & verified"** badge, updated room assignment, and the **"Attendee announcement draft"**. | *"We review the terms and click Approve. Instantly, Planzo atomically reassigns the reservation and marks the risk as handled. But Planzo doesn't stop at planning—it completes the recovery by auto-generating a ready-to-send attendee announcement."* |
| **1:55 – 2:10** | Highlight subject line: *"Subject: Important Venue Update — TechFest Workshop"*. Show body mentioning move from Outdoor Courtyard to Seminar Hall A. Click **"Copy announcement"**; show the green *"Copied!"* badge and toast. | *"The announcement has the exact new venue, unchanged time, and contingency context. With one click, the operator copies the text directly to clipboard for broadcast."* |

---

### [2:10 – 2:30] Audit Trail & Strong Closing

| Time | Screen / Action | Narration (Spoken) |
| :--- | :--- | :--- |
| **2:10 – 2:20** | Click **"Activity"** in the navigation rail. Show the newest approved decision logged with timestamp, from-to venues, and rationale. | *"In the Activity tab, every approved and rejected action is permanently logged for a transparent operational audit trail."* |
| **2:20 – 2:30** | Quick pan to the Planzo logo in header. | *"Planzo proves how next-generation Alexa+ ambient intelligence can combine conversational fluency with deterministic safety to protect real-world events. When plans change, move smarter with Planzo. Thank you!"* |

---

### Recording Checklist for Presenter
- [ ] Ensure FastAPI backend is running on `http://127.0.0.1:8000` with valid `GEMINI_API_KEY`.
- [ ] Ensure Frontend is running on `http://localhost:8080`.
- [ ] Click "Reset" before starting to ensure clean initial seed state.
- [ ] Set browser zoom to 100% or 110% for crisp readability.
- [ ] Keep mouse movements deliberate and smooth.
