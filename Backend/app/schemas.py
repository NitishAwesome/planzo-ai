from typing import Any
from pydantic import BaseModel, Field, field_validator


class Venue(BaseModel):
    id: str
    name: str
    building: str = ""
    indoor: bool = False
    capacity: int = 0
    equipment: list[str] = Field(default_factory=list)


class Booking(BaseModel):
    id: str
    venueId: str
    eventId: str | None = None
    holder: str = ""
    start: str = ""
    end: str = ""


class Risk(BaseModel):
    kind: str = "heavy-rain"
    title: str = ""
    detail: str = ""
    source: str = "Simulated scenario"
    probability: int | float = 0
    window: str = ""
    status: str = "active"


class ScheduleItem(BaseModel):
    time: str
    item: str


class PlanEvent(BaseModel):
    id: str
    name: str
    organizer: str = ""
    start: str = ""
    end: str = ""
    attendees: int = 0
    venueId: str = ""
    bookingId: str | None = None
    requiredEquipment: list[str] = Field(default_factory=list)
    schedule: list[ScheduleItem] = Field(default_factory=list)
    risk: Risk | None = None


class VenueChecks(BaseModel):
    indoor: bool = False
    capacity: bool = False
    equipment: bool = False
    availability: bool = False


class VenueEvaluation(BaseModel):
    venue: Venue
    eligible: bool = False
    checks: VenueChecks | dict[str, bool] = Field(default_factory=dict)
    missingEquipment: list[str] = Field(default_factory=list)
    conflict: Booking | None = None
    reasons: list[str] = Field(default_factory=list)


class Proposal(BaseModel):
    id: str
    eventId: str
    fromVenueId: str
    toVenueId: str
    rationale: list[str] = Field(default_factory=list)
    evaluations: list[VenueEvaluation] = Field(default_factory=list)


class EventContext(BaseModel):
    event: PlanEvent | None = None
    currentVenue: Venue | None = None
    risk: Risk | None = None
    candidates: list[VenueEvaluation] = Field(default_factory=list)
    bestProposal: Proposal | None = None


class ChatRequest(BaseModel):
    eventContext: EventContext = Field(default_factory=EventContext)
    userMessage: str = Field(..., min_length=1, max_length=2000)

    @field_validator("userMessage")
    @classmethod
    def validate_user_message(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("userMessage cannot be empty or whitespace only")
        return trimmed


class HealthResponse(BaseModel):
    status: str = "ok"
    gemini_configured: bool
    model: str
