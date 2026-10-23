import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VenueFormDialog } from "@/components/VenueFormDialog";
import { resetDemo } from "@/services/demo-store";
import type { Venue } from "@/data/types";

// Mock ResizeObserver for Radix Dialog
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("VenueFormDialog UI Component", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemo();
  });

  it("renders creation fields correctly with defaults", () => {
    render(<VenueFormDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText("Add New Venue")).toBeDefined();
    expect(screen.getByLabelText(/Venue Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Building or Location/i)).toBeDefined();
    expect(screen.getByLabelText(/Capacity/i)).toBeDefined();
    expect(screen.getByText(/Indoor Venue/i)).toBeDefined();
    expect(screen.getByText("Projector")).toBeDefined();
    expect(screen.getByText("Microphones")).toBeDefined();
    expect(screen.getByText("Seating")).toBeDefined();
  });

  it("creates a new venue and invokes onSuccess callback", async () => {
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    render(<VenueFormDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />);

    const nameInput = screen.getByLabelText(/Venue Name/i);
    fireEvent.change(nameInput, { target: { value: "Auditorium Prime" } });

    const capacityInput = screen.getByLabelText(/Capacity/i);
    fireEvent.change(capacityInput, { target: { value: "250" } });

    const submitBtn = screen.getByRole("button", { name: /Add Venue/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      const createdVenue = onSuccess.mock.calls[0]?.[0] as Venue;
      expect(createdVenue.name).toBe("Auditorium Prime");
      expect(createdVenue.capacity).toBe(250);
      expect(createdVenue.indoor).toBe(true);
    });
  });

  it("pre-fills form in edit mode and updates venue", async () => {
    const onSuccess = vi.fn();

    const existingVenue: Venue = {
      id: "hall-a",
      name: "Seminar Hall A",
      building: "Innovation Block, L1",
      indoor: true,
      capacity: 80,
      equipment: ["projector", "microphones", "seating"],
      notes: "Main seminar hall",
    };

    render(
      <VenueFormDialog
        open={true}
        onOpenChange={vi.fn()}
        venue={existingVenue}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText("Edit Venue")).toBeDefined();
    const nameInput = screen.getByLabelText(/Venue Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Seminar Hall A");

    const capacityInput = screen.getByLabelText(/Capacity/i) as HTMLInputElement;
    expect(capacityInput.value).toBe("80");
    fireEvent.change(capacityInput, { target: { value: "95" } });

    const submitBtn = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      const updated = onSuccess.mock.calls[0]?.[0] as Venue;
      expect(updated.capacity).toBe(95);
    });
  });
});
