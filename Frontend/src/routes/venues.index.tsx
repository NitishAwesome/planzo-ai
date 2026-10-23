import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Info,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDemoState, deleteVenueAction } from "@/services/demo-store";
import { checkBookingConflict, fmtDay, fmtTime, getEvent, getVenueBookings } from "@/lib/planning";
import { PageHeader, Pill } from "@/components/bits";
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
import { VenueFormDialog } from "@/components/VenueFormDialog";
import { EQUIPMENT_LABEL, type Venue } from "@/data/types";
import { DEMO_TODAY } from "@/data/seed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/venues/")({
  head: () => ({
    meta: [
      { title: "Venues — Planzo" },
      {
        name: "description",
        content:
          "Campus venue management, capacity, equipment profiles, and live booking schedules.",
      },
      { property: "og:title", content: "Venues — Planzo" },
      { property: "og:description", content: "Browse, create, and manage campus venues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Venues,
});

function Venues() {
  const s = useDemoState();

  const [filter, setFilter] = useState<"all" | "indoor" | "outdoor">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Availability checker window
  const defaultDate = DEMO_TODAY.split("T")[0] ?? "2026-10-22";
  const [checkDate, setCheckDate] = useState(defaultDate);
  const [checkStartTime, setCheckStartTime] = useState("14:00");
  const [checkEndTime, setCheckEndTime] = useState("16:00");

  // Venue dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);

  // Delete dialog state
  const [deletingVenue, setDeletingVenue] = useState<Venue | null>(null);

  // Search & filter
  const filteredVenues = useMemo(() => {
    return s.venues.filter((v) => {
      if (filter === "indoor" && !v.indoor) return false;
      if (filter === "outdoor" && v.indoor) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        v.name.toLowerCase().includes(q) ||
        v.building.toLowerCase().includes(q) ||
        (v.notes && v.notes.toLowerCase().includes(q)) ||
        v.equipment.some((eq) => EQUIPMENT_LABEL[eq]?.toLowerCase().includes(q))
      );
    });
  }, [s.venues, filter, searchQuery]);

  const handleDeleteConfirm = () => {
    if (!deletingVenue) return;
    try {
      deleteVenueAction(deletingVenue.id);
      toast.success(`Venue "${deletingVenue.name}" was successfully removed.`);
      setDeletingVenue(null);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Failed to delete venue.");
    }
  };

  const checkSlotAvailable = (venueId: string) => {
    if (!checkDate || !checkStartTime || !checkEndTime) return { available: true };
    if (checkStartTime >= checkEndTime) return { available: false, reason: "Invalid time window" };
    const startIso = `${checkDate}T${checkStartTime}:00`;
    const endIso = `${checkDate}T${checkEndTime}:00`;
    const conflict = checkBookingConflict(s, venueId, startIso, endIso);
    return {
      available: conflict === null,
      conflictingHolder: conflict?.holder,
      conflictingEventId: conflict?.eventId,
    };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader eyebrow="FACILITIES DIRECTORY" title="Campus Venues & Spaces">
          Manage venue capacities, equipment configurations, and scheduling availability. Newly
          created spaces immediately integrate into the deterministic contingency planner.
        </PageHeader>

        <Button
          onClick={() => {
            setEditingVenue(null);
            setIsFormOpen(true);
          }}
          className="shrink-0 self-start shadow-sm"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add Venue
        </Button>
      </div>

      {/* Campus Facility KPI Summary Strip */}
      <div className="mt-6 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Campus Venues</span>
          <p className="mt-1 text-2xl font-extrabold tabular">{s.venues.length}</p>
        </div>
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Indoor Spaces</span>
          <p className="mt-1 text-2xl font-extrabold tabular text-primary">
            {s.venues.filter((v) => v.indoor).length}
          </p>
        </div>
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Outdoor Spaces</span>
          <p className="mt-1 text-2xl font-extrabold tabular">
            {s.venues.filter((v) => !v.indoor).length}
          </p>
        </div>
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">
            Total Seating Capacity
          </span>
          <p className="mt-1 text-2xl font-extrabold tabular text-success">
            {s.venues.reduce((acc, v) => acc + v.capacity, 0)}
          </p>
        </div>
      </div>

      {/* Date & Time Window Availability Checker */}
      <div className="mb-8 rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm sm:text-base">Interactive Availability Checker</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Check real-time availability across all campus spaces for a given slot
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="check-date"
              className="block text-xs font-semibold text-muted-foreground mb-1"
            >
              Date
            </label>
            <Input
              id="check-date"
              type="date"
              value={checkDate}
              onChange={(e) => setCheckDate(e.target.value)}
              className="text-xs sm:text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="check-start"
              className="block text-xs font-semibold text-muted-foreground mb-1"
            >
              Start Time
            </label>
            <Input
              id="check-start"
              type="time"
              value={checkStartTime}
              onChange={(e) => setCheckStartTime(e.target.value)}
              className="text-xs sm:text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="check-end"
              className="block text-xs font-semibold text-muted-foreground mb-1"
            >
              End Time
            </label>
            <Input
              id="check-end"
              type="time"
              value={checkEndTime}
              onChange={(e) => setCheckEndTime(e.target.value)}
              className="text-xs sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Controls: Search and Setting Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition",
              filter === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            All Spaces ({s.venues.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("indoor")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition",
              filter === "indoor"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Indoor ({s.venues.filter((v) => v.indoor).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("outdoor")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition",
              filter === "outdoor"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Outdoor ({s.venues.filter((v) => !v.indoor).length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search venue or equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
      </div>

      {/* Venues Grid */}
      {filteredVenues.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-4 text-base font-bold">No Venues Found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchQuery
              ? `No venues match "${searchQuery}".`
              : "No venues registered in this category."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setFilter("all");
              setSearchQuery("");
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredVenues.map((venue) => {
            const bookings = getVenueBookings(s, venue.id);
            const slotCheck = checkSlotAvailable(venue.id);
            const hasActiveBookings = bookings.length > 0;
            const isAssignedToActiveEvent = s.events.some(
              (e) => e.venueId === venue.id && e.status !== "cancelled",
            );
            const canDelete = !hasActiveBookings && !isAssignedToActiveEvent;

            return (
              <div
                key={venue.id}
                className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-xs transition hover:shadow-sm"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold tracking-tight">{venue.name}</h2>
                        <Pill tone={venue.indoor ? "success" : "warning"}>
                          {venue.indoor ? "Indoor" : "Outdoor"}
                        </Pill>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {venue.building || "Main Campus"}
                      </p>
                    </div>

                    {/* Slot Availability Badge */}
                    {slotCheck.available ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-1 text-xs font-semibold text-success">
                        <CheckCircle2 className="h-3 w-3" /> Slot Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive-soft px-2 py-1 text-xs font-semibold text-destructive">
                        <XCircle className="h-3 w-3" /> Slot Booked
                      </span>
                    )}
                  </div>

                  {/* Metrics & Equipment */}
                  <div className="mt-4 grid grid-cols-2 gap-2 border-y py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>
                        Capacity:{" "}
                        <strong className="font-bold text-foreground">{venue.capacity}</strong>{" "}
                        seats
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>
                        Active Bookings:{" "}
                        <strong className="font-bold text-foreground">{bookings.length}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Equipment pills */}
                  <div className="mt-3">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Available Equipment:
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {venue.equipment.length > 0 ? (
                        venue.equipment.map((eq) => (
                          <span
                            key={eq}
                            className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                          >
                            {EQUIPMENT_LABEL[eq]}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          No special equipment installed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Notes if available */}
                  {venue.notes && (
                    <div className="mt-3 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Note: </span>
                      {venue.notes}
                    </div>
                  )}

                  {/* Current / Upcoming Bookings list */}
                  <div className="mt-4">
                    <span className="text-xs font-bold tracking-tight text-foreground">
                      Schedule & Reservations:
                    </span>
                    {bookings.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground italic">
                        No confirmed reservations. This venue has full availability.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {bookings.map((bk) => {
                          const ev = bk.eventId ? getEvent(s, bk.eventId) : null;
                          return (
                            <li
                              key={bk.id}
                              className="flex items-center justify-between rounded border bg-background px-2.5 py-1.5 text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-semibold truncate block">{bk.holder}</span>
                                <span className="text-muted-foreground">
                                  {fmtDay(bk.start)} · {fmtTime(bk.start)} – {fmtTime(bk.end)}
                                </span>
                              </div>
                              <span className="shrink-0 text-[10px] uppercase font-bold text-muted-foreground">
                                {ev?.status === "cancelled" ? "Cancelled" : "Confirmed"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-5 flex items-center justify-between border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingVenue(venue);
                      setIsFormOpen(true);
                    }}
                    className="text-xs"
                  >
                    <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Edit Venue
                  </Button>

                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingVenue(venue)}
                      className="text-xs text-destructive hover:bg-destructive-soft hover:text-destructive"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  ) : (
                    <span
                      title="Venues with active bookings or assigned scheduled events cannot be removed"
                      className="flex items-center gap-1 text-[11px] text-muted-foreground"
                    >
                      <ShieldAlert className="h-3 w-3 shrink-0" />
                      Active reservations
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Add Venue Dialog */}
      <VenueFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingVenue(null);
        }}
        venue={editingVenue}
      />

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={!!deletingVenue}
        onOpenChange={(open) => {
          if (!open) setDeletingVenue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Remove Venue "{deletingVenue?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this venue from Planzo? This space will no longer be
              available for event scheduling or contingency recommendations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm Removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
