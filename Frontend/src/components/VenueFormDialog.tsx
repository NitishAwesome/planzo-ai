import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, ShieldAlert } from "lucide-react";
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
  type Venue,
  type VenueFormData,
  type VenueValidationErrors,
} from "@/data/types";
import { validateVenueInput } from "@/lib/planning";
import { createVenueAction, updateVenueAction, useDemoState } from "@/services/demo-store";

const ALL_EQUIPMENT: Equipment[] = ["projector", "microphones", "seating"];

interface VenueFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue?: Venue | null;
  onSuccess?: (venue: Venue) => void;
}

export function VenueFormDialog({ open, onOpenChange, venue, onSuccess }: VenueFormDialogProps) {
  const state = useDemoState();
  const isEdit = !!venue;

  const [name, setName] = useState("");
  const [building, setBuilding] = useState("");
  const [capacity, setCapacity] = useState<number>(100);
  const [indoor, setIndoor] = useState<boolean>(true);
  const [equipment, setEquipment] = useState<Equipment[]>(["projector", "microphones", "seating"]);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<VenueValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setErrors({});
      return;
    }

    if (venue) {
      setName(venue.name);
      setBuilding(venue.building);
      setCapacity(venue.capacity);
      setIndoor(venue.indoor);
      setEquipment([...venue.equipment]);
      setNotes(venue.notes ?? "");
    } else {
      setName("");
      setBuilding("Main Campus");
      setCapacity(80);
      setIndoor(true);
      setEquipment(["projector", "microphones", "seating"]);
      setNotes("");
    }
    setErrors({});
  }, [open, venue]);

  const toggleEquipment = (eq: Equipment) => {
    setEquipment((prev) => (prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData: VenueFormData = {
      name: name.trim(),
      building: building.trim() || "Main Campus",
      capacity: Number(capacity) || 0,
      indoor,
      equipment,
      notes: notes.trim() || undefined,
    };

    const validation = validateVenueInput(state, formData, venue?.id);
    if (!validation.valid) {
      setErrors(validation.errors);
      setIsSubmitting(false);
      const firstError = Object.values(validation.errors)[0];
      if (firstError) {
        toast.error(firstError);
      }
      return;
    }

    try {
      let savedVenue: Venue;
      if (isEdit && venue) {
        savedVenue = updateVenueAction(venue.id, formData);
        toast.success(`Updated venue "${savedVenue.name}"`);
      } else {
        savedVenue = createVenueAction(formData);
        toast.success(`Added new venue "${savedVenue.name}"`);
      }
      onOpenChange(false);
      onSuccess?.(savedVenue);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "Failed to save venue";
      toast.error(msg);
      setErrors((prev) => ({ ...prev, name: msg }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <DialogTitle>{isEdit ? "Edit Venue" : "Add New Venue"}</DialogTitle>
            </div>
            <DialogDescription>
              {isEdit
                ? "Update capacity, equipment, and settings for this venue. Changes immediately impact deterministic relocation evaluation."
                : "Create a new venue for campus events. Venues immediately appear in contingency planning and availability checking."}
            </DialogDescription>
          </DialogHeader>

          {/* General info */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="venue-name" className="text-sm font-semibold">
                Venue Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="venue-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g., Innovation Hall, Quad Pavilion"
                aria-invalid={!!errors.name}
                required
              />
              {errors.name && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="venue-building" className="text-sm font-semibold">
                  Building or Location
                </Label>
                <Input
                  id="venue-building"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  placeholder="e.g., Science Block B, North Campus"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="venue-capacity" className="text-sm font-semibold">
                  Capacity <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="venue-capacity"
                  type="number"
                  min="1"
                  max="10000"
                  value={capacity}
                  onChange={(e) => {
                    setCapacity(Number(e.target.value));
                    if (errors.capacity) setErrors((prev) => ({ ...prev, capacity: undefined }));
                  }}
                  aria-invalid={!!errors.capacity}
                  required
                />
                {errors.capacity && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {errors.capacity}
                  </p>
                )}
              </div>
            </div>

            {/* Indoor / Outdoor setting */}
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="venue-indoor" className="text-sm font-semibold cursor-pointer">
                    {indoor ? "Indoor Venue" : "Outdoor Venue"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {indoor
                      ? "Sheltered environment eligible as an alternative during rain disruptions."
                      : "Open-air environment susceptible to precipitation and weather exposure."}
                  </p>
                </div>
                <Switch id="venue-indoor" checked={indoor} onCheckedChange={setIndoor} />
              </div>
            </div>

            {/* Equipment selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Available Equipment</Label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {ALL_EQUIPMENT.map((eq) => {
                  const checked = equipment.includes(eq);
                  return (
                    <label
                      key={eq}
                      htmlFor={`eq-${eq}`}
                      className="flex cursor-pointer items-center space-x-2 rounded-md border p-2.5 text-sm transition hover:bg-accent/40"
                    >
                      <Checkbox
                        id={`eq-${eq}`}
                        checked={checked}
                        onCheckedChange={() => toggleEquipment(eq)}
                      />
                      <span>{EQUIPMENT_LABEL[eq]}</span>
                    </label>
                  );
                })}
              </div>
              {errors.equipment && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <ShieldAlert className="h-3 w-3 shrink-0" />
                  {errors.equipment}
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="venue-notes" className="text-sm font-semibold">
                Notes & Operational Details (Optional)
              </Label>
              <Textarea
                id="venue-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Accessibility features, staging restrictions, loading dock access, etc."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                "Saving..."
              ) : isEdit ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Save Changes
                </>
              ) : (
                <>
                  <Building2 className="mr-1.5 h-4 w-4" /> Add Venue
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
