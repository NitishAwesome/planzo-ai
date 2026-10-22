import { createFileRoute } from "@tanstack/react-router";
import { useDemoState } from "@/services/demo-store";
import { PageHeader } from "@/components/bits";
import { DecisionRow } from "@/components/DecisionRow";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Planzo" },
      {
        name: "description",
        content: "Chronological history of approved and rejected contingency decisions.",
      },
      { property: "og:title", content: "Activity — Planzo" },
      { property: "og:description", content: "Decision history for event contingencies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const s = useDemoState();
  const list = [...s.decisions].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeader eyebrow="Activity" title="Decision history">
        Every approval and rejection, newest first.
      </PageHeader>
      <ul className="surface divide-y px-5">
        {list.map((d) => (
          <DecisionRow key={d.id} d={d} state={s} />
        ))}
      </ul>
    </>
  );
}
