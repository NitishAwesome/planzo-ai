import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CloudRain,
  Edit2,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDemoState,
  getDemoStateSnapshot,
  cancelEventAction,
  deleteEventAction,
} from "@/services/demo-store";
import { EQUIPMENT_LABEL, type PlanEvent } from "@/data/types";
import { fmtDay, fmtTime, getEvent, getVenue } from "@/lib/planning";
import { Pill, SimLabel, StatusPill } from "@/components/bits";
import { DecisionStudio, type StudioMode } from "@/components/DecisionStudio";
import { DisruptionControlCard } from "@/components/DisruptionControlCard";
import { EventFormDialog } from "@/components/EventFormDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events/$id")({
  loader: ({ params }) => {
    const s = getDemoStateSnapshot();
    const e = s.events.find((x) => x.id === params.id);
    return { name: e?.name ?? "Event" };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Event"} — Planzo cockpit` },
      {
        name: "description",
        content: "Event details, risk evidence and the Decision Studio for contingency planning.",
      },
      { property: "og:title", content: `${loaderData?.name ?? "Event"} — Planzo` },
      {
        property: "og:description",
        content: "Review risks and approve or reject a grounded venue alternative.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cockpit,
});

function Cockpit() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [studioMode, setStudioMode] = useState<StudioMode>("standard");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const s = useDemoState();
  const e = getEvent(s, id);

  if (!e) {
    return (
      <div className="surface p-8 text-center space-y-3">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="text-sm text-muted-foreground">
          The requested event could not be found or has been deleted.
        </p>
        <Link
          to="/events"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to all events
        </Link>
      </div>
    );
  }

  const v = getVenue(s, e.venueId);
  const isCancelled = e.status === "cancelled";

  const handleCancel = () => {
    try {
      cancelEventAction(e.id);
      toast.success(`Event "${e.name}" has been cancelled. Venue schedule released.`);
    } catch {
      toast.error("Failed to cancel event.");
    }
  };

  const handleDelete = () => {
    try {
      deleteEventAction(e.id);
      toast.success(`Event "${e.name}" deleted.`);
      navigate({ to: "/events" });
    } catch {
      toast.error("Failed to delete event.");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          to="/events"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All events
        </Link>

        {/* Cockpit Actions Toolbar */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            className="h-8 gap-1 text-xs font-semibold"
          >
            <Edit2 className="size-3.5" aria-hidden="true" />
            <span>Edit Event</span>
          </Button>

          {!isCancelled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="h-8 gap-1 text-xs font-semibold text-warning-ink hover:text-warning-ink hover:bg-warning-soft/40"
            >
              <XCircle className="size-3.5" aria-hidden="true" />
              <span>Cancel Event</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDeleteOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive-soft"
            title="Delete Event"
            aria-label="Delete event"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{e.name}</h1>
          <StatusPill event={e} />
        </div>
        <button
          type="button"
          onClick={() => setStudioMode((m) => (m === "alexa" ? "standard" : "alexa"))}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all",
            studioMode === "alexa"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
          )}
          aria-label="Toggle Alexa+ Experience Simulation mode"
        >
          <Radio className="size-3.5" aria-hidden="true" />
          {studioMode === "alexa" ? "Exit Alexa+ Simulation" : "Enter Alexa+ Simulation"}
        </button>
      </div>

      {/* Prominent Cancelled Notice */}
      {isCancelled && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive-soft p-4 flex items-start gap-3">
          <ShieldAlert className="size-5 shrink-0 text-destructive mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-destructive">Event Cancelled</h2>
            <p className="text-xs text-muted-foreground">
              This event was cancelled. Its venue booking at {v?.name ?? "the venue"} has been
              released and no contingency plan is active. You can edit the event details to
              reschedule it.
            </p>
          </div>
        </div>
      )}

      <a
        href="#decision-studio"
        className="mb-4 inline-block text-sm font-semibold text-primary underline lg:hidden"
      >
        Jump to Decision Studio
      </a>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <section className="surface p-5" aria-label="Event details">
            {e.description && (
              <div className="mb-4 pb-4 border-b">
                <dt className="eyebrow">About</dt>
                <dd className="mt-1 text-sm text-foreground">{e.description}</dd>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="eyebrow">When</dt>
                <dd className="mt-1 font-bold">
                  {fmtDay(e.start)}
                  <br />
                  {fmtTime(e.start)}–{fmtTime(e.end)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Attendees</dt>
                <dd className="mt-1 text-2xl font-extrabold tabular">{e.attendees}</dd>
              </div>
              <div>
                <dt className="eyebrow">Current venue</dt>
                <dd className="mt-1 font-bold">{v?.name ?? "Unknown venue"}</dd>
                <dd className="text-xs text-muted-foreground">
                  {v?.building ?? "—"} · {v?.indoor ? "Indoor" : "Outdoor"}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Capacity</dt>
                <dd className="mt-1 font-bold tabular">{v ? `${v.capacity} seats` : "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow">Organizer</dt>
                <dd className="mt-1 font-medium">{e.organizer}</dd>
              </div>
              <div>
                <dt className="eyebrow">Booking Status</dt>
                <dd className="mt-1 font-semibold">
                  {isCancelled ? (
                    <span className="text-destructive">Booking Released</span>
                  ) : (
                    <span className="text-success">Confirmed #{e.bookingId}</span>
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="eyebrow">Event Location</dt>
                <dd className="mt-1 font-semibold flex items-center gap-1.5 text-xs sm:text-sm">
                  <span
                    className="inline-block size-2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <span>
                    {e.location
                      ? `${e.location.name}${e.location.country ? `, ${e.location.country}` : ""}`
                      : "Campus Main Grounds"}
                  </span>
                  {e.location && (
                    <span className="text-xs text-muted-foreground tabular font-normal ml-1">
                      ({e.location.latitude.toFixed(2)}°N, {e.location.longitude.toFixed(2)}°E)
                    </span>
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="eyebrow">Needed equipment</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {e.requiredEquipment.map((q) => (
                    <Pill key={q}>{EQUIPMENT_LABEL[q]}</Pill>
                  ))}
                </dd>
              </div>
            </dl>
          </section>

          {e.schedule && e.schedule.length > 0 && (
            <section className="surface p-5" aria-labelledby="sch">
              <h2 id="sch" className="text-base font-extrabold">
                Schedule
              </h2>
              <ol className="mt-3 space-y-2 text-sm">
                {e.schedule.map((x) => (
                  <li key={x.time} className="flex gap-4">
                    <span className="w-12 font-bold tabular text-muted-foreground">{x.time}</span>
                    {x.item}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!isCancelled && (
            <DisruptionControlCard
              key={`${e.id}-${s.resetKey ?? 0}-${e.start}-${e.end}-${e.venueId}-${e.location?.latitude}-${e.location?.longitude}`}
              event={e}
              venue={v}
              onFocusStudio={() =>
                document.getElementById("decision-studio")?.scrollIntoView({ behavior: "smooth" })
              }
            />
          )}
        </div>

        <DecisionStudio
          key={`${e.id}-${s.resetKey ?? 0}`}
          state={s}
          event={e}
          mode={studioMode}
          onModeChange={setStudioMode}
        />
      </div>

      {/* Edit Event Dialog */}
      <EventFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} event={e} />

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Delete Event: {e.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this event? Its venue booking will be
              released immediately. Past decisions and activity history will be retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Event</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
