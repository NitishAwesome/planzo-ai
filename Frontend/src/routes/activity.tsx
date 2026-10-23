import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  History,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useDemoState } from "@/services/demo-store";
import { PageHeader, Pill } from "@/components/bits";
import { DecisionRow } from "@/components/DecisionRow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity & Decisions — Planzo" },
      {
        name: "description",
        content:
          "Audit trail of contingency approvals, rejections, venue updates, and operational decisions.",
      },
      { property: "og:title", content: "Activity & Decisions — Planzo" },
      {
        property: "og:description",
        content: "Transparent operational decision history for campus event contingencies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

type ActivityCategory = "all" | "recoveries" | "events" | "venues" | "risks";

export function ActivityPage() {
  const s = useDemoState();
  const [filter, setFilter] = useState<ActivityCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const rawList = useMemo(() => {
    return [...(s?.decisions ?? [])].sort((a, b) => (b?.at ?? "").localeCompare(a?.at ?? ""));
  }, [s?.decisions]);

  const filteredList = useMemo(() => {
    return rawList.filter((d) => {
      if (!d) return false;
      const outcome = (d.outcome ?? "").toLowerCase();

      // Category filter
      if (filter === "recoveries") {
        if (outcome !== "approved" && outcome !== "rejected") return false;
      } else if (filter === "events") {
        if (!["created", "updated", "cancelled"].includes(outcome)) return false;
      } else if (filter === "venues") {
        if (!outcome.startsWith("venue_")) return false;
      } else if (filter === "risks") {
        if (!outcome.startsWith("risk_")) return false;
      }

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const eventName = (d.eventName ?? "").toLowerCase();
      const explanation = (d.explanation ?? "").toLowerCase();

      return eventName.includes(q) || explanation.includes(q) || outcome.includes(q);
    });
  }, [rawList, filter, searchQuery]);

  const countRecoveries = rawList.filter((d) => {
    const o = d?.outcome ?? "";
    return o === "approved" || o === "rejected";
  }).length;
  const countEvents = rawList.filter((d) => {
    const o = d?.outcome ?? "";
    return ["created", "updated", "cancelled"].includes(o);
  }).length;
  const countVenues = rawList.filter((d) => (d?.outcome ?? "").startsWith("venue_")).length;
  const countRisks = rawList.filter((d) => (d?.outcome ?? "").startsWith("risk_")).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <PageHeader eyebrow="OPERATIONAL AUDIT" title="Decision History & Activity">
        Chronological record of contingency approvals, rejections, room changes, and facility
        modifications. Entries maintain complete operational transparency.
      </PageHeader>

      {/* Summary KPI Strip */}
      <div className="mt-6 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Total Logged Actions</span>
          <p className="mt-1 text-2xl font-extrabold tabular">{rawList.length}</p>
        </div>
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Recoveries Decided</span>
          <p className="mt-1 text-2xl font-extrabold tabular text-success">{countRecoveries}</p>
        </div>
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Event Lifecycle</span>
          <p className="mt-1 text-2xl font-extrabold tabular text-primary">{countEvents}</p>
        </div>
        <div className="surface p-4">
          <span className="text-xs font-semibold text-muted-foreground">Venue Actions</span>
          <p className="mt-1 text-2xl font-extrabold tabular">{countVenues}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search activity by event name, explanation, or outcome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-10 w-full bg-card"
            aria-label="Search activity"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div role="group" aria-label="Filter activity by category" className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "All Activity", count: rawList.length },
            { id: "recoveries", label: "Recoveries", count: countRecoveries },
            { id: "events", label: "Events", count: countEvents },
            { id: "venues", label: "Venues", count: countVenues },
            { id: "risks", label: "Risks", count: countRisks },
          ].map((cat) => {
            const isSelected = filter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setFilter(cat.id as ActivityCategory)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-semibold transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {cat.label} ({cat.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity List or Empty State */}
      {filteredList.length === 0 ? (
        <div className="surface p-12 text-center space-y-3 rounded-xl border">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <History className="size-6" />
          </div>
          <h2 className="text-base font-bold">
            {searchQuery
              ? `No activity matches "${searchQuery}"`
              : "No activity records in this category"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {searchQuery
              ? "Try adjusting your search query or clear the filter to view all operational decisions."
              : "When contingency plans are authorized or facilities are updated, detailed audit entries appear here."}
          </p>
          <div className="pt-2 flex justify-center gap-2">
            {searchQuery ? (
              <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                View all activity
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="surface rounded-xl border overflow-hidden">
          <ul className="divide-y px-5">
            {filteredList.map((d) => (
              <DecisionRow key={d.id} d={d} state={s} />
            ))}
          </ul>
        </div>
      )}

      {/* Explanatory Footer Note */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Operational decisions and audit entries persist in browser session state (
        <code className="text-[11px]">localStorage</code>). To restore the seeded scenario baseline,
        use the <strong>Reset demo</strong> control in the navigation.
      </p>
    </div>
  );
}
