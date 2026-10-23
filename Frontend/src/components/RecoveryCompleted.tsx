import { useState } from "react";
import { Check, CheckCheck, CircleCheck, Copy, Info, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Decision, DemoState, PlanEvent } from "@/data/types";
import { buildAttendeeAnnouncement, fmtDay, fmtTime, getVenue } from "@/lib/planning";
import { Pill } from "./bits";

export function RecoveryCompleted({
  state,
  event,
  decision,
}: {
  state: DemoState;
  event: PlanEvent;
  decision: Decision;
}) {
  const [copied, setCopied] = useState(false);

  const fromVenue = getVenue(state, decision.fromVenueId);
  const toVenue = getVenue(state, decision.toVenueId);

  const fromName = fromVenue?.name ?? "Previous Venue";
  const toName = toVenue?.name ?? "New Venue";

  const announcement = buildAttendeeAnnouncement(event, fromName, toName);

  async function handleCopy() {
    let success = false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(announcement.fullText);
        success = true;
      } catch {
        success = false;
      }
    }

    if (!success && typeof document !== "undefined") {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = announcement.fullText;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textArea);
      } catch {
        success = false;
      }
    }

    setCopied(true);
    toast.success("Announcement draft copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      aria-labelledby="recovery-completed-heading"
      className="border-t bg-success-soft/30 px-5 py-5 md:px-6"
    >
      {/* Recovery Confirmation Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleCheck className="size-5 text-success" aria-hidden="true" />
          <h3 id="recovery-completed-heading" className="text-base font-extrabold text-foreground">
            Recovery completed
          </h3>
        </div>
        <Pill tone="success">Handled & verified</Pill>
      </div>

      <p className="mt-1.5 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{event.name}</span> has been successfully
        relocated to <span className="font-semibold text-foreground">{toName}</span>. The previous
        venue slot ({fromName}) was released and demo event assignment was updated.
      </p>

      {/* Relocation Summary Metadata */}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border bg-card p-3.5 text-xs sm:grid-cols-4">
        <div>
          <span className="eyebrow block">Previous venue</span>
          <span className="mt-0.5 block font-semibold text-muted-foreground line-through">
            {fromName}
          </span>
        </div>
        <div>
          <span className="eyebrow block">Current venue</span>
          <span className="mt-0.5 block font-bold text-success">
            {toName} {toVenue?.indoor ? "(Indoor)" : ""}
          </span>
        </div>
        <div>
          <span className="eyebrow block">Date & time</span>
          <span className="mt-0.5 block font-semibold">
            {fmtDay(event.start)}, {fmtTime(event.start)}–{fmtTime(event.end)}
          </span>
        </div>
        <div>
          <span className="eyebrow block">Demo state</span>
          <span className="mt-0.5 inline-flex items-center gap-1 font-bold text-success">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Assignment updated
          </span>
        </div>
      </div>

      {/* Attendee Communication Draft Card */}
      <div className="mt-5 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="draft-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" aria-hidden="true" />
            <h4 id="draft-title" className="text-sm font-bold text-foreground">
              Attendee announcement draft
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
              role="status"
            >
              Draft — not sent
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 text-xs font-semibold"
              aria-label="Copy attendee announcement draft to clipboard"
            >
              {copied ? (
                <>
                  <CheckCheck className="size-3.5 text-success" aria-hidden="true" />
                  <span className="text-success">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" aria-hidden="true" />
                  <span>Copy announcement</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Readable Preview */}
        <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3.5 text-xs sm:text-sm font-mono leading-relaxed text-foreground/90">
          <div className="border-b pb-2 font-semibold text-foreground">
            Subject: {announcement.subject}
          </div>
          <div className="whitespace-pre-wrap font-sans text-xs sm:text-sm pt-1">
            {announcement.body}
          </div>
        </div>

        {/* Safety & Non-sending Disclosure */}
        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            Simulated communication draft generated for organizer review. Planzo does not send live
            emails, SMS, or external notifications.
          </p>
        </div>
      </div>
    </section>
  );
}
