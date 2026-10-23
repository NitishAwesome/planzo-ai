import { useEffect, useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CloudRain,
  Info,
  MapPin,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  EQUIPMENT_LABEL,
  type Equipment,
  type EventFormData,
  type GeoLocation,
  type PlanEvent,
} from "@/data/types";
import {
  checkBookingConflict,
  type EventValidationErrors,
  fmtDay,
  fmtTime,
  PlanningError,
  toMs,
  validateEventInput,
} from "@/lib/planning";
import { createEventAction, updateEventAction, useDemoState } from "@/services/demo-store";
import { DEMO_TODAY } from "@/data/seed";
import { searchLocations } from "@/services/weather-api";
import { cn } from "@/lib/utils";

const ALL_EQUIPMENT: Equipment[] = ["projector", "microphones", "seating"];

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: PlanEvent | null;
  onSuccess?: (event: PlanEvent) => void;
}

export function EventFormDialog({ open, onOpenChange, event, onSuccess }: EventFormDialogProps) {
  const state = useDemoState();
  const isEdit = !!event;

  // Form field state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizer, setOrganizer] = useState("Campus Events");
  const [date, setDate] = useState<string>(DEMO_TODAY.split("T")[0] ?? "2026-10-22");
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [attendees, setAttendees] = useState<number>(40);
  const [venueId, setVenueId] = useState<string>("");
  const [requiredEquipment, setRequiredEquipment] = useState<Equipment[]>(["projector", "seating"]);
  const [location, setLocation] = useState<GeoLocation | undefined>(event?.location);
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoLocation[]>([]);
  const [isSearchingLoc, setIsSearchingLoc] = useState(false);
  const [simulateRisk, setSimulateRisk] = useState<boolean>(false);
  const [riskDetail, setRiskDetail] = useState(
    "Heavy rain and sustained winds expected during the event window. Outdoor setting would be exposed.",
  );
  const [riskProbability, setRiskProbability] = useState<number>(85);
  const [riskWindow, setRiskWindow] = useState("14:00 – 16:00");

  const [formErrors, setFormErrors] = useState<EventValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when opening or event changes
  useEffect(() => {
    if (!open) {
      setFormErrors({});
      return;
    }

    if (event) {
      setName(event.name);
      setDescription(event.description ?? "");
      setOrganizer(event.organizer);
      const startParts = event.start.split("T");
      const endParts = event.end.split("T");
      const d = startParts[0] ?? DEMO_TODAY.split("T")[0] ?? "2026-10-22";
      const t = (startParts[1] ?? "14:00").slice(0, 5);
      const endT = (endParts[1] ?? "16:00").slice(0, 5);
      setDate(d);
      setStartTime(t);
      setEndTime(endT);
      setAttendees(event.attendees);
      setVenueId(event.venueId);
      setRequiredEquipment([...event.requiredEquipment]);
      setLocation(event.location);
      setLocQuery("");
      setLocResults([]);
      setSimulateRisk(event.risk?.source === "Simulated scenario");
      setRiskDetail(
        event.risk?.detail ?? "Heavy rain and sustained winds expected during the event window.",
      );
      setRiskProbability(event.risk?.probability ?? 85);
      setRiskWindow(event.risk?.window ?? `${t} – ${endT}`);
    } else {
      // Create defaults
      setName("");
      setDescription("");
      setOrganizer("Campus Events");
      setDate(DEMO_TODAY.split("T")[0] ?? "2026-10-22");
      setStartTime("14:00");
      setEndTime("16:00");
      setAttendees(40);
      setVenueId(state.venues[0]?.id ?? "");
      setRequiredEquipment(["projector", "seating"]);
      setLocation(undefined);
      setLocQuery("");
      setLocResults([]);
      setSimulateRisk(false);
      setRiskDetail(
        "Heavy rain and sustained winds expected during the event window. Outdoor setting would be exposed.",
      );
      setRiskProbability(85);
      setRiskWindow("14:00 – 16:00");
    }
    setFormErrors({});
  }, [open, event, state.venues]);

  // Keep risk window in sync if start/end changes and user hasn't edited risk window manually
  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (!isEdit && !event) {
      setRiskWindow(`${val} – ${endTime}`);
    }
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    if (!isEdit && !event) {
      setRiskWindow(`${startTime} – ${val}`);
    }
  };

  const toggleEquipment = (eq: Equipment) => {
    setRequiredEquipment((prev) =>
      prev.includes(eq) ? prev.filter((x) => x !== eq) : [...prev, eq],
    );
  };

  // Live venue evaluation
  const selectedVenue = state.venues.find((v) => v.id === venueId);
  const venueEvaluation = useMemo(() => {
    if (!selectedVenue || !date || !startTime || !endTime) return null;
    const startIso = `${date}T${startTime}:00`;
    const endIso = `${date}T${endTime}:00`;

    const capacityOk = attendees <= selectedVenue.capacity;
    const missingEquip = requiredEquipment.filter((eq) => !selectedVenue.equipment.includes(eq));
    const equipOk = missingEquip.length === 0;

    let conflict = null;
    if (toMs(endIso) > toMs(startIso)) {
      conflict = checkBookingConflict(state, selectedVenue.id, startIso, endIso, event?.id);
    }

    return {
      capacityOk,
      equipOk,
      missingEquip,
      conflict,
      isFullyEligible: capacityOk && equipOk && !conflict,
    };
  }, [selectedVenue, date, startTime, endTime, attendees, requiredEquipment, state, event?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormErrors({});

    const formData: EventFormData = {
      name: name.trim(),
      description: description.trim() || undefined,
      organizer: organizer.trim() || "Campus Events",
      date,
      startTime,
      endTime,
      attendees: Number(attendees),
      venueId,
      requiredEquipment,
      location,
      simulateRisk,
      riskDetail: simulateRisk ? riskDetail.trim() : undefined,
      riskProbability: simulateRisk ? Number(riskProbability) : undefined,
      riskWindow: simulateRisk ? riskWindow.trim() : undefined,
    };

    const { valid, errors } = validateEventInput(state, formData, event?.id);

    if (!valid) {
      setFormErrors(errors);
      setIsSubmitting(false);
      const first = Object.values(errors)[0];
      if (first) toast.error(first);
      return;
    }

    try {
      if (isEdit && event) {
        const updated = updateEventAction(event.id, formData);
        toast.success(`Event "${updated.name}" updated successfully.`);
        onOpenChange(false);
        onSuccess?.(updated);
      } else {
        const created = createEventAction(formData);
        toast.success(`Event "${created.name}" created successfully.`);
        onOpenChange(false);
        onSuccess?.(created);
      }
    } catch (err) {
      const msg = err instanceof PlanningError ? err.message : "Failed to save event.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isEdit ? "Edit Event" : "Create New Event"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update event parameters, booking schedule, required equipment, or risk simulation."
              : "Schedule a campus event with automated capacity, equipment, and venue conflict validation."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Event Name */}
          <div className="space-y-1.5">
            <Label htmlFor="event-name" className="text-sm font-bold">
              Event Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-name"
              placeholder="e.g. AI Agents & Systems Workshop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(formErrors.name && "border-destructive")}
              required
            />
            {formErrors.name && (
              <p className="text-xs font-semibold text-destructive">{formErrors.name}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="event-description" className="text-sm font-bold">
              Description{" "}
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="event-description"
              placeholder="Outline the agenda, audience, or purpose of the event..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Organizer */}
          <div className="space-y-1.5">
            <Label htmlFor="event-organizer" className="text-sm font-bold">
              Organizer
            </Label>
            <Input
              id="event-organizer"
              placeholder="e.g. Tech Club, Faculty Board"
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
            />
          </div>

          {/* Geographic Event Location */}
          <div className="space-y-2 rounded-lg border bg-accent/25 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold flex items-center gap-1.5">
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                Geographic Event Location{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (for Open-Meteo live weather)
                </span>
              </Label>
              {location && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation(undefined)}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
            </div>

            {location ? (
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm shadow-2xs">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary shrink-0" />
                  <div>
                    <span className="font-bold">{location.name}</span>
                    {location.country && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({location.admin1 ? `${location.admin1}, ` : ""}
                        {location.country})
                      </span>
                    )}
                    <span className="block text-[11px] text-muted-foreground tabular">
                      {location.latitude.toFixed(4)}°N, {location.longitude.toFixed(4)}°E
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation(undefined)}
                  className="h-7 text-xs"
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Search city or place (e.g. Mumbai, Bengaluru, London, New York)..."
                  value={locQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setLocQuery(q);
                    if (q.trim().length >= 2) {
                      setIsSearchingLoc(true);
                      searchLocations(q)
                        .then((res) => setLocResults(res))
                        .catch(() => setLocResults([]))
                        .finally(() => setIsSearchingLoc(false));
                    } else {
                      setLocResults([]);
                    }
                  }}
                  className="h-9 text-xs bg-card"
                />

                {isSearchingLoc && (
                  <p className="text-[11px] text-muted-foreground">Searching locations...</p>
                )}

                {locResults.length > 0 && (
                  <ul className="rounded-md border bg-card divide-y max-h-36 overflow-y-auto text-xs shadow-2xs">
                    {locResults.map((r, i) => (
                      <li key={`${r.name}-${r.latitude}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setLocation(r);
                            setLocQuery("");
                            setLocResults([]);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-accent flex justify-between items-center"
                        >
                          <span className="font-semibold">{r.name}</span>
                          <span className="text-muted-foreground">
                            {r.admin1 ? `${r.admin1}, ` : ""}
                            {r.country}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Popular City Presets */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Presets:</span>
                  {[
                    { name: "Mumbai", latitude: 19.076, longitude: 72.8777, country: "India" },
                    { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946, country: "India" },
                    {
                      name: "London",
                      latitude: 51.5074,
                      longitude: -0.1278,
                      country: "United Kingdom",
                    },
                    {
                      name: "New York",
                      latitude: 40.7128,
                      longitude: -74.006,
                      country: "United States",
                    },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setLocation(preset);
                        setLocQuery("");
                        setLocResults([]);
                      }}
                      className="rounded border bg-card px-2 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-date" className="text-sm font-bold flex items-center gap-1">
                <Calendar className="size-3.5" aria-hidden="true" /> Date{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={cn(formErrors.date && "border-destructive")}
                required
              />
              {formErrors.date && (
                <p className="text-xs font-semibold text-destructive">{formErrors.date}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="event-start-time"
                className="text-sm font-bold flex items-center gap-1"
              >
                <Clock className="size-3.5" aria-hidden="true" /> Start{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-start-time"
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className={cn(formErrors.startTime && "border-destructive")}
                required
              />
              {formErrors.startTime && (
                <p className="text-xs font-semibold text-destructive">{formErrors.startTime}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-end-time" className="text-sm font-bold flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden="true" /> End{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-end-time"
                type="time"
                value={endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className={cn(formErrors.endTime && "border-destructive")}
                required
              />
              {formErrors.endTime && (
                <p className="text-xs font-semibold text-destructive">{formErrors.endTime}</p>
              )}
            </div>
          </div>

          {/* Attendees */}
          <div className="space-y-1.5">
            <Label htmlFor="event-attendees" className="text-sm font-bold flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" /> Expected Attendees{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-attendees"
              type="number"
              min={1}
              value={attendees}
              onChange={(e) => setAttendees(Number(e.target.value))}
              className={cn(formErrors.attendees && "border-destructive")}
              required
            />
            {formErrors.attendees && (
              <p className="text-xs font-semibold text-destructive">{formErrors.attendees}</p>
            )}
          </div>

          {/* Venue Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="event-venue" className="text-sm font-bold flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" /> Venue Selection{" "}
              <span className="text-destructive">*</span>
            </Label>
            <select
              id="event-venue"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className={cn(
                "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                formErrors.venueId && "border-destructive",
              )}
              required
            >
              <option value="" disabled>
                Select a venue...
              </option>
              {state.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.indoor ? "Indoor" : "Outdoor"}, Capacity: {v.capacity}) —{" "}
                  {v.building}
                </option>
              ))}
            </select>
            {formErrors.venueId && (
              <p className="text-xs font-semibold text-destructive">{formErrors.venueId}</p>
            )}

            {/* Live Venue Assessment Helper */}
            {venueEvaluation && selectedVenue && (
              <div
                className={cn(
                  "mt-2 rounded-lg border p-3 text-xs space-y-1.5 transition-colors",
                  venueEvaluation.isFullyEligible
                    ? "bg-success-soft/60 border-success/30 text-success-ink"
                    : "bg-warning-soft/60 border-warning/40 text-foreground",
                )}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {venueEvaluation.isFullyEligible ? (
                    <>
                      <CheckCircle2 className="size-4 text-success shrink-0" />
                      <span>{selectedVenue.name} is available and meets all criteria.</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-4 text-warning-ink shrink-0" />
                      <span>Notice for {selectedVenue.name}:</span>
                    </>
                  )}
                </div>

                {!venueEvaluation.capacityOk && (
                  <p className="flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="size-3.5 shrink-0" /> Capacity insufficient:{" "}
                    {selectedVenue.capacity} seats vs {attendees} attendees.
                  </p>
                )}

                {!venueEvaluation.equipOk && (
                  <p className="flex items-center gap-1 text-warning-ink font-medium">
                    <XCircle className="size-3.5 shrink-0" /> Missing equipment:{" "}
                    {venueEvaluation.missingEquip.map((q) => EQUIPMENT_LABEL[q]).join(", ")}.
                  </p>
                )}

                {venueEvaluation.conflict && (
                  <p className="flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="size-3.5 shrink-0" /> Schedule conflict with "
                    {venueEvaluation.conflict.holder}" ({fmtTime(venueEvaluation.conflict.start)}–
                    {fmtTime(venueEvaluation.conflict.end)}).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Required Equipment Checkboxes */}
          <div className="space-y-2">
            <Label className="text-sm font-bold">Required Equipment</Label>
            <div className="grid grid-cols-3 gap-2">
              {ALL_EQUIPMENT.map((eq) => {
                const checked = requiredEquipment.includes(eq);
                return (
                  <label
                    key={eq}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 text-xs font-semibold cursor-pointer transition-colors",
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleEquipment(eq)}
                      aria-label={`Require ${EQUIPMENT_LABEL[eq]}`}
                    />
                    <span>{EQUIPMENT_LABEL[eq]}</span>
                  </label>
                );
              })}
            </div>
            {formErrors.requiredEquipment && (
              <p className="text-xs font-semibold text-destructive">
                {formErrors.requiredEquipment}
              </p>
            )}
          </div>

          {/* Disruption Simulation Section */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="simulate-risk"
                  className="text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <CloudRain className="size-4 text-warning-ink" />
                  <span>Simulate Heavy-Rain Disruption</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Triggers an active weather risk scenario to test contingency recovery and Decision
                  Studio.
                </p>
              </div>
              <Switch id="simulate-risk" checked={simulateRisk} onCheckedChange={setSimulateRisk} />
            </div>

            {simulateRisk && (
              <div className="pt-2 space-y-3 border-t text-xs">
                <div className="space-y-1">
                  <Label htmlFor="risk-detail" className="font-semibold">
                    Risk Narrative / Weather Details
                  </Label>
                  <Input
                    id="risk-detail"
                    value={riskDetail}
                    onChange={(e) => setRiskDetail(e.target.value)}
                    placeholder="Details about expected weather and impact..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="risk-prob" className="font-semibold">
                      Rain Probability (%)
                    </Label>
                    <Input
                      id="risk-prob"
                      type="number"
                      min={10}
                      max={100}
                      value={riskProbability}
                      onChange={(e) => setRiskProbability(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="risk-window" className="font-semibold">
                      Disruption Window
                    </Label>
                    <Input
                      id="risk-window"
                      value={riskWindow}
                      onChange={(e) => setRiskWindow(e.target.value)}
                      placeholder="e.g. 13:30 – 16:30"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
