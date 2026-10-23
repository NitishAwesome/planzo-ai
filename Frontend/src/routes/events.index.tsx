import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Clock,
  Edit2,
  ExternalLink,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDemoState, cancelEventAction, deleteEventAction } from "@/services/demo-store";
import { fmtDay, fmtTime, getVenue } from "@/lib/planning";
import {
  DateBlock,
  eventStatus,
  PageHeader,
  Pill,
  StatusPill,
  STATUS_LABEL,
  type EventStatus,
} from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EventFormDialog } from "@/components/EventFormDialog";
import { EQUIPMENT_LABEL, type PlanEvent } from "@/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "Events — Planzo" },
      {
        name: "description",
        content: "All scheduled events with venue, attendees and disruption status.",
      },
      { property: "og:title", content: "Events — Planzo" },
      { property: "og:description", content: "Browse and filter events by status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Events,
});

function Events() {
  const navigate = useNavigate();
  const s = useDemoState();

  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Event modal dialogs
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PlanEvent | null>(null);

  // Delete confirmation
  const [deletingEvent, setDeletingEvent] = useState<PlanEvent | null>(null);

  // Filter and search
  const filteredList = useMemo(() => {
    return s.events.filter((e) => {
      const matchesFilter = filter === "all" || eventStatus(e) === filter;
      if (!matchesFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const venue = getVenue(s, e.venueId);
      return (
        e.name.toLowerCase().includes(q) ||
        e.organizer.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (venue && venue.name.toLowerCase().includes(q))
      );
    });
  }, [s, filter, searchQuery]);

  const filterOptions: ("all" | EventStatus)[] = [
    "all",
    "at-risk",
    "handled",
    "on-track",
    "cancelled",
  ];

  const handleCreateOpen = () => {
    setEditingEvent(null);
    setIsFormOpen(true);
  };

  const handleEditOpen = (e: PlanEvent, ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    setEditingEvent(e);
    setIsFormOpen(true);
  };

  const handleCancelEvent = (e: PlanEvent, ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      cancelEventAction(e.id);
      toast.success(`Event "${e.name}" has been cancelled. Venue booking released.`);
    } catch {
      toast.error(`Failed to cancel event "${e.name}".`);
    }
  };

  const handleDeleteConfirm = () => {
    if (!deletingEvent) return;
    try {
      deleteEventAction(deletingEvent.id);
      toast.success(`Event "${deletingEvent.name}" deleted.`);
      setDeletingEvent(null);
    } catch {
      toast.error(`Failed to delete event.`);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader eyebrow="Events" title="All events">
          Browse scheduled events, manage bookings, or schedule new events.
        </PageHeader>
        <Button
          onClick={handleCreateOpen}
          className="self-start sm:self-auto gap-1.5 shadow-sm font-bold sm:mt-8"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>Create Event</span>
        </Button>
      </div>

      {/* Search and Filters Bar */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search events by name, organizer, venue, or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-10 w-full bg-card"
            aria-label="Search events"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search input"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div role="group" aria-label="Filter events by status" className="flex flex-wrap gap-2">
          {filterOptions.map((o) => {
            const count = s.events.filter((e) => o === "all" || eventStatus(e) === o).length;
            const isSelected = filter === o;
            return (
              <button
                key={o}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setFilter(o)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-semibold transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {o === "all" ? "All" : STATUS_LABEL[o]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Events List / Cards */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="surface p-8 text-center space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {searchQuery ? <Search className="size-6" /> : <CalendarPlus className="size-6" />}
            </div>
            <div>
              <p className="font-bold text-base">
                {searchQuery
                  ? `No events match "${searchQuery}"`
                  : s.events.length === 0
                    ? "No events scheduled yet"
                    : "No events with this status"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? "Try searching for a different keyword or reset the filter to view all events."
                  : s.events.length === 0
                    ? "Get started by scheduling your first event with automated venue validation."
                    : "There are currently no events matching the selected status filter."}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-2">
              {searchQuery ? (
                <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              ) : s.events.length === 0 ? (
                <Button size="sm" onClick={handleCreateOpen}>
                  <Plus className="size-4 mr-1" /> Create Event
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                  Show all events
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ul className="surface divide-y rounded-xl overflow-hidden">
            {filteredList.map((e) => {
              const venue = getVenue(s, e.venueId);
              const isCancelled = e.status === "cancelled";

              return (
                <li
                  key={e.id}
                  className={cn(
                    "transition-colors hover:bg-accent/40",
                    isCancelled && "opacity-80 bg-muted/20",
                  )}
                >
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
                    {/* Left: Date & Info */}
                    <Link
                      to="/events/$id"
                      params={{ id: e.id }}
                      className="flex items-start gap-4 min-w-0 flex-1 group"
                    >
                      <DateBlock start={e.start} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-base group-hover:text-primary transition-colors">
                            {e.name}
                          </p>
                          <StatusPill event={e} />
                          {e.risk && (
                            <Pill
                              tone={
                                e.risk.source === "Forecast from Open-Meteo" ? "primary" : "neutral"
                              }
                            >
                              {e.risk.source === "Forecast from Open-Meteo"
                                ? "Open-Meteo"
                                : "Simulated"}
                            </Pill>
                          )}
                        </div>

                        {e.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {e.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Clock className="size-3.5" />
                            {fmtTime(e.start)}–{fmtTime(e.end)}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            {venue?.name ?? "Unknown Venue"} ({venue?.indoor ? "Indoor" : "Outdoor"}
                            )
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Users className="size-3.5" />
                            {e.attendees} attendees
                          </span>
                          <span>·</span>
                          <span>Org: {e.organizer}</span>
                        </div>

                        {/* Equipment badges */}
                        {e.requiredEquipment.length > 0 && (
                          <div className="pt-1 flex flex-wrap gap-1.5">
                            {e.requiredEquipment.map((eq) => (
                              <span
                                key={eq}
                                className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                {EQUIPMENT_LABEL[eq]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-semibold"
                        title="Open Event Cockpit"
                      >
                        <Link to="/events/$id" params={{ id: e.id }}>
                          <span>Cockpit</span>
                          <ExternalLink className="size-3.5 ml-1" />
                        </Link>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-medium"
                        onClick={(ev) => handleEditOpen(e, ev)}
                        title="Edit event details"
                      >
                        <Edit2 className="size-3.5 mr-1" />
                        <span>Edit</span>
                      </Button>

                      {!isCancelled && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-warning-ink hover:text-warning-ink hover:bg-warning-soft/40"
                          onClick={(ev) => handleCancelEvent(e, ev)}
                          title="Cancel event and release venue booking"
                        >
                          <XCircle className="size-3.5 mr-1" />
                          <span>Cancel</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive-soft"
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setDeletingEvent(e);
                        }}
                        title="Delete event permanently"
                        aria-label={`Delete event ${e.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <EventFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        event={editingEvent}
        onSuccess={(ev) => {
          if (!editingEvent) {
            navigate({ to: "/events/$id", params: { id: ev.id } });
          }
        }}
      />

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deletingEvent} onOpenChange={(open) => !open && setDeletingEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Delete Event: {deletingEvent?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event? This will permanently remove the event,
              free its venue booking schedule, and preserve historic activity logs. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Event</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
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
