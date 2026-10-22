# Planzo — Event Contingency Assistant

**When plans change, move smarter.**

Planzo is a working frontend prototype for event contingency planning. It helps an operator inspect a simulated disruption, evaluate possible alternative venues, approve or reject a recovery plan, and review the decision history.

## What works

- Operations overview, event list, individual event cockpit, and activity history.
- Deterministic venue selection based on indoor suitability, capacity, equipment, and schedule conflicts.
- Explicit **Approve** and **Reject** actions with updated event and booking records.
- Browser-local persistence and a **Reset demo** confirmation.
- Responsive navigation and accessibility labels for key actions.

The example **TechFest Workshop** is a simulated weather disruption. Risk details are **demo data**, not a live forecast. The assistant runs on deterministic rules; there is **no live AI, Alexa integration, or production backend**. This is an independent Alexa+ concept simulation, not an Amazon-affiliated product.

## Development

From the `Frontend/` directory:

```bash
npm install
npm run dev
```

The local URL is printed in the terminal. To verify the project:

```bash
npx tsc --noEmit
npm test
npm run build
npm audit
```

## Important files

- `src/data/` — event, venue, booking, and risk types and seed data.
- `src/lib/planning.ts` — venue eligibility, plan proposals, decisions, formatting.
- `src/services/demo-store.ts` — browser-local state and persistence.
- `src/components/` — application shell and decision workspace.
- `src/routes/` — operations, events, event cockpit, and activity pages.
- `public/brand/` — Planzo logo assets and app icon.
- `public/favicon.ico`, `public/favicon-32x32.png`, `public/site.webmanifest` — browser branding.

## License

See the `LICENSE` file in the parent `planzo-ai` repository.
