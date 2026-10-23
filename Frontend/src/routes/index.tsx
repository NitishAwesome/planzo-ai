import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  CloudRain,
  ExternalLink,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoState } from "@/services/demo-store";
import { fmtDay, fmtShortDate, fmtTime, getVenue, overviewMetrics } from "@/lib/planning";
import { DEMO_TODAY } from "@/data/seed";
import { DateBlock, PageHeader, Pill, SimLabel, StatusPill } from "@/components/bits";
import { DecisionRow } from "@/components/DecisionRow";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Command Center — Planzo" },
      {
        name: "description",
        content:
          "Planzo operations command center: active disruptions, campus facility utilization, and contingency decisions.",
      },
      { property: "og:title", content: "Operations Command Center — Planzo" },
      {
        property: "og:description",
        content: "When plans change, move smarter. Event operations and contingency cockpit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

const WORDS = ["No events need", "One event needs", "Two events need", "Three events need"];

function Overview() {
  const s = useDemoState();
  const { upcoming, atRisk, focus, suitable } = overviewMetrics(s);
  const fv = focus ? getVenue(s, focus.venueId) : null;
  const recent = [...s.decisions].reverse().slice(0, 4);
  const lastUpcoming = upcoming.at(-1);
  const upcomingRangeLabel = lastUpcoming
    ? `Through ${fmtShortDate(lastUpcoming.start).month} ${fmtShortDate(lastUpcoming.start).day}`
    : "None scheduled";

  // Facility summary
  const totalVenues = s.venues.length;
  const indoorVenues = s.venues.filter((v) => v.indoor).length;
  const outdoorVenues = totalVenues - indoorVenues;
  const totalCapacity = s.venues.reduce((acc, v) => acc + v.capacity, 0);

  return (
    <div className="space-y-6">
      {/* Top Header with Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          eyebrow={`OPERATIONS COMMAND · ${fmtDay(DEMO_TODAY)}`}
          title={`${WORDS[atRisk.length] ?? `${atRisk.length} events need`} a decision`}
        >
          {focus
            ? `${focus.name} is exposed to a ${focus.risk ? `${focus.risk.source === "Forecast from Open-Meteo" ? "live weather" : "simulated"} ${focus.risk.title.toLowerCase()}` : "disruption"} scenario. ${suitable > 0 ? "A suitable indoor alternative is available." : "No indoor room qualifies with current constraints."}`
            : "Every upcoming event is on track. Decisions you made are permanently recorded in the activity log."}
        </PageHeader>

        <div className="flex flex-wrap items-center gap-2 self-start sm:mt-8">
          <Button asChild size="sm" className="font-bold gap-1.5 shadow-xs">
            <Link to="/events">
              <CalendarPlus className="size-4" aria-hidden="true" />
              <span>Create Event</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="font-semibold gap-1.5">
            <Link to="/venues">
              <Building2 className="size-4" aria-hidden="true" />
              <span>Add Venue</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards (4 columns) */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="surface p-4 sm:p-5">
          <dt className="text-xs sm:text-sm font-semibold text-muted-foreground">
            Upcoming events
          </dt>
          <dd className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight tabular">
            {upcoming.length}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground truncate">{upcomingRangeLabel}</dd>
        </div>

        <div className="surface p-4 sm:p-5 border-l-2 border-warning">
          <dt className="text-xs sm:text-sm font-semibold text-muted-foreground">At-risk events</dt>
          <dd
            className={cn(
              "mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight tabular",
              atRisk.length > 0 ? "text-warning-ink" : "text-foreground",
            )}
          >
            {atRisk.length}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {atRisk.length ? "Contingency required" : "All clear"}
          </dd>
        </div>

        <div className="surface p-4 sm:p-5">
          <dt className="text-xs sm:text-sm font-semibold text-muted-foreground">
            Suitable backups
          </dt>
          <dd className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight tabular text-success">
            {suitable}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground truncate">
            {focus ? (suitable > 0 ? `For ${focus.name}` : "None qualify") : "No active threat"}
          </dd>
        </div>

        <div className="surface p-4 sm:p-5">
          <dt className="text-xs sm:text-sm font-semibold text-muted-foreground">Campus spaces</dt>
          <dd className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight tabular">
            {totalVenues}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground truncate">
            {indoorVenues} indoor · {totalCapacity} seats
          </dd>
        </div>
      </dl>

      {/* Primary Priority Disruption or All-Clear Section */}
      {atRisk.length === 0 ? (
        <section className="surface border-l-4 border-success p-6 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-success-soft p-2.5 text-success shrink-0">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold tracking-tight">
                All scheduled campus events are on track
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                No active weather disruptions or room conflicts threaten upcoming schedules. When an
                unexpected threat arises or a simulation drill is triggered, Planzo automatically
                evaluates physical venue constraints and displays grounded relocation proposals
                here.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
            <Button asChild size="sm" variant="outline">
              <Link to="/events">View schedule</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/venues">Check venues</Link>
            </Button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {/* Main Focus Incident */}
          {focus && focus.risk && fv && (
            <section
              aria-labelledby="priority-incident"
              className="surface grid overflow-hidden rounded-xl border border-warning/40 shadow-xs md:grid-cols-[1fr_auto]"
            >
              <div className="border-l-4 border-warning p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill event={focus} />
                  {focus.risk.source === "Forecast from Open-Meteo" ? (
                    <Pill tone="primary">Forecast from Open-Meteo</Pill>
                  ) : (
                    <SimLabel />
                  )}
                  {focus.location && (
                    <span className="text-xs text-muted-foreground">· {focus.location.name}</span>
                  )}
                </div>

                <h2 id="priority-incident" className="mt-3 text-2xl font-extrabold tracking-tight">
                  {focus.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fmtDay(focus.start)} · {fmtTime(focus.start)}–{fmtTime(focus.end)} · {fv.name} (
                  {fv.indoor ? "Indoor" : "Outdoor"}) · {focus.attendees} attendees
                </p>

                <div className="mt-4 flex items-start gap-2.5 text-sm rounded-lg bg-warning-soft/30 p-3.5 border border-warning/20">
                  <CloudRain
                    className="size-5 shrink-0 text-warning-ink mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <span className="font-semibold text-warning-ink">
                      {focus.risk.title} ({focus.risk.probability}%, {focus.risk.window})
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">{focus.risk.detail}</p>
                    {focus.risk.forecastMetadata && (
                      <span className="block mt-1.5 text-[11px] text-muted-foreground tabular">
                        Last forecast checked: {fmtTime(focus.risk.forecastMetadata.fetchedAt)} ·
                        Open-Meteo
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end border-t p-6 md:border-l md:border-t-0 md:bg-accent/10">
                <Button asChild size="lg" className="w-full sm:w-auto shadow-sm">
                  <Link to="/events/$id" params={{ id: focus.id }}>
                    Review contingency <ArrowRight className="size-4 ml-1.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </section>
          )}

          {/* Secondary At-Risk Events (if multiple) */}
          {atRisk.length > 1 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-warning-ink" />
                Additional Events Requiring Contingency Review ({atRisk.length - 1})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {atRisk.slice(1).map((ev) => {
                  const v = getVenue(s, ev.venueId);
                  return (
                    <div
                      key={ev.id}
                      className="surface border-l-4 border-warning p-4 rounded-xl border flex flex-col justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-base">{ev.name}</p>
                          <StatusPill event={ev} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {fmtDay(ev.start)} · {fmtTime(ev.start)}–{fmtTime(ev.end)} ·{" "}
                          {v?.name ?? "Venue"} · {ev.attendees} people
                        </p>
                        {ev.risk && (
                          <div className="mt-2 text-xs text-warning-ink font-medium flex items-center gap-1.5">
                            <CloudRain className="size-3.5 shrink-0" />
                            <span>
                              {ev.risk.title} ({ev.risk.probability}%)
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ·{" "}
                              {ev.risk.source === "Forecast from Open-Meteo"
                                ? "Open-Meteo"
                                : "Simulated"}
                            </span>
                          </div>
                        )}
                      </div>
                      <Button asChild size="sm" variant="outline" className="self-start">
                        <Link to="/events/$id" params={{ id: ev.id }}>
                          Review contingency <ArrowRight className="size-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two Column Layout: Upcoming Events & Recent Decisions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="up-events" className="surface p-5 rounded-xl border">
          <div className="flex items-center justify-between">
            <h2 id="up-events" className="text-lg font-extrabold">
              Upcoming events
            </h2>
            <Link to="/events" className="text-xs font-semibold text-primary hover:underline">
              View all ({s.events.length})
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No upcoming events scheduled.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/events/$id"
                    params={{ id: e.id }}
                    className="flex items-center gap-3 rounded-lg py-3 hover:bg-accent px-1.5 transition-colors"
                  >
                    <DateBlock start={e.start} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-sm">{e.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fmtTime(e.start)} · {getVenue(s, e.venueId)?.name} · {e.attendees} people
                      </p>
                    </div>
                    <StatusPill event={e} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent-decisions" className="surface p-5 rounded-xl border">
          <div className="flex items-center justify-between">
            <h2 id="recent-decisions" className="text-lg font-extrabold">
              Recent decisions
            </h2>
            <Link to="/activity" className="text-xs font-semibold text-primary hover:underline">
              View full audit ({s.decisions.length})
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No recent decisions recorded.</p>
          ) : (
            <ul className="mt-1 divide-y">
              {recent.map((d) => (
                <DecisionRow key={d.id} d={d} state={s} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
