# Planzo Frontend

Frontend application for Planzo — Event Contingency Assistant.

## Architecture & Tech Stack

- **Framework:** React 19 + TanStack Start (SSR) + Vite
- **Routing:** TanStack Router (file-based routing in `src/routes/`)
- **Styling:** Tailwind CSS v4
- **State Management:** TanStack Query + local storage demo store (`src/services/demo-store.ts`)
- **Server / Deployment:** Nitro (`cloudflare-module` preset) with custom server entry in `src/server.ts`
- **Testing:** Vitest + React Testing Library

## Verification Commands

- Type check: `npx tsc --noEmit`
- Tests: `npm test`
- Build: `npm run build`
- Audit: `npm audit`
