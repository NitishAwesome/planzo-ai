import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventFormDialog } from "@/components/EventFormDialog";
import { DecisionStudio } from "@/components/DecisionStudio";
import { createSeedState } from "@/data/seed";
import { createEvent, updateEvent } from "@/lib/planning";
import * as demoStore from "@/services/demo-store";

// Mock ResizeObserver for Radix Dialog
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("P6B Event Management & Dynamic Recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    demoStore.resetDemo();
  });

  describe("EventFormDialog component", () => {
    it("renders creation fields and handles live capacity warning", () => {
      const state = createSeedState();
      render(<EventFormDialog open={true} onOpenChange={() => {}} />);

      expect(screen.getByText("Create New Event")).toBeDefined();
      expect(screen.getByLabelText(/Event Name/i)).toBeDefined();
      expect(screen.getByLabelText(/Expected Attendees/i)).toBeDefined();

      // Change attendees to 150 and select hall-b (capacity 30)
      const attendeesInput = screen.getByLabelText(/Expected Attendees/i);
      fireEvent.change(attendeesInput, { target: { value: "150" } });

      const venueSelect = screen.getByLabelText(/Venue Selection/i);
      fireEvent.change(venueSelect, { target: { value: "hall-b" } });

      // Live notice displays insufficient capacity
      expect(screen.getByText(/Capacity insufficient: 30 seats vs 150 attendees/i)).toBeDefined();
    });

    it("creates an event successfully and invokes onSuccess callback", () => {
      const onSuccessMock = vi.fn();
      const onOpenChangeMock = vi.fn();

      render(
        <EventFormDialog open={true} onOpenChange={onOpenChangeMock} onSuccess={onSuccessMock} />,
      );

      const nameInput = screen.getByLabelText(/Event Name/i);
      fireEvent.change(nameInput, { target: { value: "Full Stack Workshop" } });

      const attendeesInput = screen.getByLabelText(/Expected Attendees/i);
      fireEvent.change(attendeesInput, { target: { value: "25" } });

      const venueSelect = screen.getByLabelText(/Venue Selection/i);
      fireEvent.change(venueSelect, { target: { value: "hall-b" } });

      const submitBtn = screen.getByRole("button", { name: "Create Event" });
      fireEvent.click(submitBtn);

      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      const createdEvent = onSuccessMock.mock.calls[0]![0];
      expect(createdEvent.name).toBe("Full Stack Workshop");
      expect(createdEvent.attendees).toBe(25);
      expect(createdEvent.venueId).toBe("hall-b");
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    });

    it("pre-fills form in edit mode and updates existing event", () => {
      const state = createSeedState();
      const event = state.events[0]!; // TechFest
      const onSuccessMock = vi.fn();

      render(
        <EventFormDialog
          open={true}
          onOpenChange={() => {}}
          event={event}
          onSuccess={onSuccessMock}
        />,
      );

      expect(screen.getByText("Edit Event")).toBeDefined();
      const nameInput = screen.getByLabelText(/Event Name/i) as HTMLInputElement;
      expect(nameInput.value).toBe(event.name);

      fireEvent.change(nameInput, { target: { value: "TechFest Advanced" } });
      const submitBtn = screen.getByRole("button", { name: "Save Changes" });
      fireEvent.click(submitBtn);

      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(onSuccessMock.mock.calls[0]![0].name).toBe("TechFest Advanced");
    });
  });

  describe("Dynamic Decision Studio for custom events", () => {
    it("renders 'No eligible alternative venues' card when no indoor room qualifies", async () => {
      // Offline fallback fetch mock
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

      const baseState = createSeedState();
      // Create custom outdoor event with 100 attendees requiring projector
      const { state, event } = createEvent(baseState, {
        name: "Campus Hackathon Mainstage",
        date: "2026-10-25",
        startTime: "10:00",
        endTime: "13:00",
        attendees: 100, // No indoor venue with projector fits 100 attendees (hall-a is 80)
        venueId: "courtyard",
        requiredEquipment: ["projector"],
        simulateRisk: true,
      });

      render(<DecisionStudio state={state} event={event} />);

      // Click "Find an alternative"
      const findBtn = screen.getByRole("button", { name: "Find an alternative" });
      fireEvent.click(findBtn);

      await waitFor(() => {
        expect(screen.getByText(/No eligible alternative venues/i)).toBeDefined();
      });

      // Breakdown explains why Seminar Hall A was excluded
      expect(screen.getAllByText(/Seminar Hall A/i).length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText(/Too small: 80 seats for 100 attendees/i).length,
      ).toBeGreaterThanOrEqual(1);
      // Approve button must NOT be present
      expect(screen.queryByRole("button", { name: /^Approve/i })).toBeNull();
    });

    it("evaluates custom event with eligible alternative and presents approval card", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

      const baseState = createSeedState();
      // Custom event with 20 attendees in outdoor courtyard, requiring projector & microphones
      const { state, event } = createEvent(baseState, {
        name: "Startup Pitch Deck Session",
        date: "2026-10-25",
        startTime: "14:00",
        endTime: "16:00",
        attendees: 20,
        venueId: "courtyard",
        requiredEquipment: ["projector", "microphones"],
        simulateRisk: true,
      });

      render(<DecisionStudio state={state} event={event} />);

      const findBtn = screen.getByRole("button", { name: "Find an alternative" });
      fireEvent.click(findBtn);

      await waitFor(() => {
        // Seminar Hall B (capacity 30) is the smallest eligible room fitting 20 attendees
        expect(screen.getByText(/Proposed change/i)).toBeDefined();
        expect(screen.getByText(/Why Seminar Hall B/i)).toBeDefined();
      });

      expect(screen.getByRole("button", { name: /Approve/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Reject/i })).toBeDefined();
    });
  });
});
