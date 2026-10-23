# Planzo Backend API

FastAPI backend service powering conversational intelligence and grounded reasoning for **Planzo**, an intelligent event contingency and recovery assistant.

## Tech Stack

- **Runtime**: Python 3.11+
- **Framework**: FastAPI + Uvicorn
- **AI SDK**: Google GenAI Python SDK (`google-genai`)
- **Default Model**: `gemini-3.8-flash` (configurable via `GEMINI_MODEL`)
- **Streaming**: Server-Sent Events (SSE) via `text/event-stream`
- **Validation**: Pydantic v2

---

## Getting Started (Windows PowerShell)

All commands should be executed from the `Backend` directory or repository root.

### 1. Create Virtual Environment

```powershell
cd D:\planzo-ai\Backend
python -m venv .venv
```

### 2. Activate Virtual Environment & Install Dependencies

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Copy the example environment configuration:

```powershell
Copy-Item .env.example .env
```

Edit `.env` to supply your Google Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
PORT=8000
HOST=127.0.0.1
```

*(Note: `GEMINI_MODEL` defaults to `gemini-3.8-flash`. You can also configure `gemini-3.5-flash` or `gemini-3.5-flash-lite` if desired.)*

### 4. Start the Backend Server

```powershell
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```

The server starts at `http://127.0.0.1:8000`.

---

## Testing the API (PowerShell)

### Test Health Endpoint (`GET /api/health`)

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" | ConvertTo-Json
```

**Expected Response**:
```json
{
  "status": "ok",
  "gemini_configured": true,
  "model": "gemini-3.8-flash"
}
```

### Test Chat Streaming Endpoint (`POST /api/chat`)

```powershell
$body = @{
    eventContext = @{
        event = @{
            id = "techfest"
            name = "TechFest Workshop"
            start = "2026-10-23T10:00:00"
            end = "2026-10-23T13:00:00"
            attendees = 50
            venueId = "courtyard"
            requiredEquipment = @("projector", "microphones", "seating")
            risk = @{
                kind = "heavy-rain"
                title = "Heavy rain during event window"
                detail = "Sustained heavy rain expected over courtyard."
                source = "Simulated scenario"
                probability = 85
                window = "09:30 - 14:00"
                status = "active"
            }
        }
        currentVenue = @{
            id = "courtyard"
            name = "Outdoor Courtyard"
            building = "Central Campus"
            indoor = $false
            capacity = 120
            equipment = @("projector", "microphones", "seating")
        }
        candidates = @(
            @{
                venue = @{
                    id = "hall-a"
                    name = "Seminar Hall A"
                    building = "Innovation Block, L1"
                    indoor = $true
                    capacity = 80
                    equipment = @("projector", "microphones", "seating")
                }
                eligible = $true
                checks = @{ indoor = $true; capacity = $true; equipment = $true; availability = $true }
                missingEquipment = @()
                reasons = @("Fits 50 of 80 seats", "Has all required equipment", "Free for the full event slot")
            },
            @{
                venue = @{
                    id = "hall-b"
                    name = "Seminar Hall B"
                    building = "Innovation Block, L1"
                    indoor = $true
                    capacity = 30
                    equipment = @("projector", "microphones", "seating")
                }
                eligible = $false
                checks = @{ indoor = $true; capacity = $false; equipment = $true; availability = $true }
                missingEquipment = @()
                reasons = @("Too small: 30 seats for 50 attendees")
            }
        )
        bestProposal = @{
            id = "techfest:courtyard->hall-a"
            eventId = "techfest"
            fromVenueId = "courtyard"
            toVenueId = "hall-a"
            rationale = @(
                "Indoor, so heavy rain does not affect it",
                "Fits 50 of 80 seats",
                "Has all required equipment",
                "Free for the full event slot",
                "Smallest eligible room — least unused capacity"
            )
        }
    }
    userMessage = "Why is Seminar Hall A recommended for TechFest Workshop instead of Seminar Hall B?"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/chat" -Method Post -ContentType "application/json" -Body $body
```

---

## Running Automated Tests

Run the full pytest suite (all 13 tests mock upstream Gemini calls and do not consume quota):

```powershell
.\.venv\Scripts\pytest.exe -v
```

---

## Architectural Boundaries (M1)

- **Grounded Assistant Only**: This backend provides conversational assistance grounded in deterministic event contexts.
- **Authoritative Planning**: Venue eligibility evaluations, proposal generation, booking changes, and approvals remain deterministic operations evaluated and confirmed by the human operator via the Decision Studio UI.
