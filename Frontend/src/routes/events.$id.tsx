import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CloudRain, Radio, ShieldCheck } from "lucide-react";
import { useDemoState } from "@/services/demo-store";
import { createSeedState } from "@/data/seed";
import { EQUIPMENT_LABEL } from "@/data/types";
import { fmtDay, fmtTime, getEvent, getVenue } from "@/lib/planning";
import { Pill, SimLabel, StatusPill } from "@/components/bits";
import { DecisionStudio, type StudioMode } from "@/components/DecisionStudio";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events/$id")({
  loader: ({ params }) => {
    const e = createSeedState().events.find((x) => x.id === params.id);
    if (!e) throw notFound();
    return { name: e.name };
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
  const [studioMode, setStudioMode] = useState<StudioMode>("standard");
  const s = useDemoState();
  const e = getEvent(s, id)!;
  const v = getVenue(s, e.venueId)!;
  return (
    <>
      <Link
        to="/events"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All events
      </Link>
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
      <a
        href="#decision-studio"
        className="mb-4 inline-block text-sm font-semibold text-primary underline lg:hidden"
      >
        Jump to Decision Studio
      </a>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <section className="surface p-5" aria-label="Event details">
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
                <dd className="mt-1 font-bold">{v.name}</dd>
                <dd className="text-xs text-muted-foreground">
                  {v.building} · {v.indoor ? "Indoor" : "Outdoor"}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Capacity</dt>
                <dd className="mt-1 font-bold tabular">{v.capacity} seats</dd>
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
          <section className="surface p-5" aria-labelledby="risk">
            <div className="flex items-center justify-between gap-2">
              <h2 id="risk" className="text-base font-extrabold">
                Risk & evidence
              </h2>
              {e.risk && <SimLabel />}
            </div>
            {e.risk ? (
              <div className="mt-3 flex gap-3 text-sm">
                <CloudRain
                  className={
                    e.risk.status === "active"
                      ? "size-5 shrink-0 text-warning-ink"
                      : "size-5 shrink-0 text-success"
                  }
                  aria-hidden="true"
                />
                <div>
                  <p className="font-bold">
                    {e.risk.title} · {e.risk.probability}% · {e.risk.window}
                  </p>
                  <p className="mt-1 text-muted-foreground">{e.risk.detail}</p>
                  {e.risk.status === "handled" && (
                    <p className="mt-2 font-semibold text-success">
                      Handled — event moved to an indoor venue.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-5 text-success" aria-hidden="true" />
                No disruption recorded for this event. No contingency is needed.
              </p>
            )}
          </section>
        </div>
        <DecisionStudio state={s} event={e} mode={studioMode} onModeChange={setStudioMode} />
      </div>
    </>
  );
}
