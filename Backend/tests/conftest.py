import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings


@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    return TestClient(app)


@pytest.fixture
def sample_payload():
    """Realistic chat payload representing an event at risk of heavy rain."""
    return {
        "eventContext": {
            "event": {
                "id": "techfest",
                "name": "TechFest Workshop",
                "organizer": "Student Tech Council",
                "start": "2026-10-23T10:00:00",
                "end": "2026-10-23T13:00:00",
                "attendees": 50,
                "venueId": "courtyard",
                "bookingId": "bk-techfest",
                "requiredEquipment": ["projector", "microphones", "seating"],
                "schedule": [
                    {"time": "10:00", "item": "Registration & welcome"},
                    {"time": "10:30", "item": "Hands-on build session"},
                    {"time": "12:00", "item": "Demos & feedback"},
                    {"time": "12:45", "item": "Wrap-up"}
                ],
                "risk": {
                    "kind": "heavy-rain",
                    "title": "Heavy rain during event window",
                    "detail": "Sustained heavy rain expected over courtyard.",
                    "source": "Simulated scenario",
                    "probability": 85,
                    "window": "09:30 – 14:00",
                    "status": "active"
                }
            },
            "currentVenue": {
                "id": "courtyard",
                "name": "Outdoor Courtyard",
                "building": "Central Campus",
                "indoor": False,
                "capacity": 120,
                "equipment": ["projector", "microphones", "seating"]
            },
            "risk": {
                "kind": "heavy-rain",
                "title": "Heavy rain during event window",
                "detail": "Sustained heavy rain expected over courtyard.",
                "source": "Simulated scenario",
                "probability": 85,
                "window": "09:30 – 14:00",
                "status": "active"
            },
            "candidates": [
                {
                    "venue": {
                        "id": "hall-a",
                        "name": "Seminar Hall A",
                        "building": "Innovation Block, L1",
                        "indoor": True,
                        "capacity": 80,
                        "equipment": ["projector", "microphones", "seating"]
                    },
                    "eligible": True,
                    "checks": {
                        "indoor": True,
                        "capacity": True,
                        "equipment": True,
                        "availability": True
                    },
                    "missingEquipment": [],
                    "conflict": None,
                    "reasons": [
                        "Fits 50 of 80 seats",
                        "Has all required equipment",
                        "Free for the full event slot"
                    ]
                },
                {
                    "venue": {
                        "id": "hall-b",
                        "name": "Seminar Hall B",
                        "building": "Innovation Block, L1",
                        "indoor": True,
                        "capacity": 30,
                        "equipment": ["projector", "microphones", "seating"]
                    },
                    "eligible": False,
                    "checks": {
                        "indoor": True,
                        "capacity": False,
                        "equipment": True,
                        "availability": True
                    },
                    "missingEquipment": [],
                    "conflict": None,
                    "reasons": ["Too small: 30 seats for 50 attendees"]
                }
            ],
            "bestProposal": {
                "id": "techfest:courtyard->hall-a",
                "eventId": "techfest",
                "fromVenueId": "courtyard",
                "toVenueId": "hall-a",
                "rationale": [
                    "Indoor, so heavy rain does not affect it",
                    "Fits 50 of 80 seats",
                    "Has all required equipment",
                    "Free for the full event slot",
                    "Smallest eligible room — least unused capacity"
                ],
                "evaluations": []
            }
        },
        "userMessage": "Why is Seminar Hall A recommended?"
    }
