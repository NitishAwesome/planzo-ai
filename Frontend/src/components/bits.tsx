import type { ReactNode } from "react";
import type { PlanEvent } from "@/data/types";
import { cn } from "@/lib/utils";
import { fmtShortDate } from "@/lib/planning";

type Tone = "warning" | "success" | "neutral" | "primary" | "destructive";
const TONE: Record<Tone, string> = {
  warning: "bg-warning-soft text-warning-ink",
  success: "bg-success-soft text-success",
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  destructive: "bg-destructive-soft text-destructive",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export type EventStatus = "at-risk" | "handled" | "on-track" | "cancelled";
export function eventStatus(e: PlanEvent): EventStatus {
  if (e.status === "cancelled") return "cancelled";
  if (e.risk?.status === "active") return "at-risk";
  if (e.risk?.status === "handled") return "handled";
  return "on-track";
}
export const STATUS_LABEL: Record<EventStatus, string> = {
  "at-risk": "At risk",
  handled: "Risk handled",
  "on-track": "On track",
  cancelled: "Cancelled",
};

export function StatusPill({ event }: { event: PlanEvent }) {
  const s = eventStatus(event);
  const tone: Tone = s === "at-risk" ? "warning" : s === "cancelled" ? "destructive" : "success";
  return (
    <Pill tone={tone}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          s === "at-risk" ? "bg-warning" : s === "cancelled" ? "bg-destructive" : "bg-success",
        )}
        aria-hidden="true"
      />
      {STATUS_LABEL[s]}
    </Pill>
  );
}

export function SimLabel() {
  return <Pill tone="neutral">Simulated scenario</Pill>;
}

export function DateBlock({ start }: { start: string }) {
  const { month, day } = fmtShortDate(start);
  return (
    <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border bg-background">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {month}
      </span>
      <span className="text-lg font-extrabold leading-none tabular">{day}</span>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-[2.5rem] md:leading-[1.1]">
        {title}
      </h1>
      {children && <div className="mt-3 max-w-2xl text-base text-muted-foreground">{children}</div>}
    </header>
  );
}
