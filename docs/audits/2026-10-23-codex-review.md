# Independent Planzo engineering review — 23 October 2026

Verdict: suitable for the local hackathon demonstration after the fixes in this review. No confirmed P0 issue was found; the confirmed P1 issues below are fixed and covered by regression tests. Public hosting still needs its own configuration and abuse controls. This is not a production certification.

The starting revision was `47ed0c40413a1d7e399f4ec3134874fa3971aaf1`, which matched public GitHub `main`. The working tree was initially clean. This review inspected the actual code and exercised failure cases independently of the earlier P6E completion report. It did not repeat the previous visual browser audit or add new product categories.

## Confirmed defects and fixes

Locations below refer to the reviewed, corrected source. Each item records the original failure and its resolution.

| Priority | Location | Reproduction, root cause and impact | Fix |
| --- | --- | --- | --- |
| P1 | `Frontend/src/lib/planning.ts:335` | Cancel TechFest, then edit it to reschedule. Cancellation removes the booking, but editing previously only mapped existing bookings and retained `cancelled` status. The advertised rescheduling workflow could not restore the event or protect its reservation. | Editing a cancelled event restores scheduled status and creates the missing reservation after validating conflicts. A competing booking is then rejected. |
| P1 | `Frontend/src/lib/planning.ts:106` | Generate a proposal, change event attendees or a candidate venue, then submit the old proposal ID. IDs contained only event/from/to, so changed details could retain the same authorization token. Reusing the same move after an earlier recovery was also permanently rejected. | Bind proposal IDs to the activity revision. Old approvals fail after mutations; a later recovery gets a fresh ID. Existing duplicate-approval and conflict checks remain in force. |
| P1 | `Frontend/src/services/demo-store.ts:41`, `Frontend/src/services/persisted-state.ts:108` | Save JSON such as `{"version":1}` or an event with missing venue/booking references, then refresh. The loader accepted any version-1 object and components could crash or display inconsistent reservations. | Validate the persisted schema, IDs, active event/venue/equipment relationships and booking correspondence. Invalid data falls back to the seed; valid saved user data is retained. Raw invalid storage is not deleted during reading. |
| P1 | `Frontend/src/lib/planning.ts:1157` | Return matching timestamps with null metrics, or a forecast that covers only part of the event. Missing values previously became zero and a partial window was accepted, allowing a misleading clear assessment and removal of an existing forecast risk. | Require finite, valid metrics and continuous coverage of the full event window. An incomplete forecast is unavailable; the caller retains existing risk. |
| P1 | `Frontend/src/lib/planning.ts:1157` | Return substantial total precipitation from showers with `rain=0`, or heavy precipitation in the hour preceding the event start. The evaluator preferred the narrower rain field and used buffered timestamps without respecting preceding-hour intervals. This could miss a real rain contingency or trigger one from the wrong interval. | Use total precipitation, evaluate overlapping preceding-hour intervals, remove the arbitrary buffer, and compare event-local wall-clock labels independently of the browser timezone. |
| P1 | `Frontend/src/components/DisruptionControlCard.tsx:159` | Start a forecast request and reset the demo or change the event/location before it completes. The old callback could write its forecast into a replacement event with the same ID. Weather controls also retained state between event contexts. | Abort requests on unmount, reject responses if the original event object was replaced, and remount weather controls when event, schedule, venue, location or reset context changes. |
| P2 | `Frontend/src/lib/planning.ts:335`, `Frontend/src/components/EventFormDialog.tsx:112` | Editing an event with a live forecast initialized the simulation toggle from the presence of any risk and reconstructed a simulated risk. Ordinary edits changed provenance; changing schedule/location could also preserve stale evidence. | Initialize simulation only for simulated risks, preserve live evidence for unrelated edits, and invalidate it when forecast context changes. Location changes also invalidate old forecast risk. |
| P2 | `Frontend/src/lib/planning.ts:809`, `Frontend/src/components/DisruptionControlCard.tsx:182` | A recovery driven by a real forecast generated a simulated-weather announcement, while a cached forecast was stamped with the current retrieval time. | Preserve the actual weather source in rationale and announcement text, use upstream `fetched_at`, and label UTC timestamps. Replace the broad safe-weather claim with a statement limited to the implemented rain assessment. |
| P2 | `Frontend/src/components/DecisionStudio.tsx:207` | The intent parser recognized approval guidance, but the request still went to Gemini and displayed arbitrary model text. A model could claim approval even though no booking had changed. | Handle approval guidance locally, with deterministic instructions to use the explicit approval button. The model has no booking mutation tools. |
| P2 | `Frontend/src/services/chat-api.ts:175` | Send a terminal SSE `done` event while leaving the transport open. The UI callback fired, but the request continued reading indefinitely. Reader cleanup was also missing on cancellation and errors. | Stop reading at terminal events, cancel the reader on abort/completion/error, remove listeners and release the lock. |
| P2 | `Frontend/src/lib/planning.ts:150` | Submit a calendar date such as `2026-02-30`. JavaScript normalized it to March while the original invalid date was retained in the booking. | Check the calendar date by round trip and validate time ranges and safe integer counts. |
| P2 | `Frontend/src/components/DecisionStudio.tsx:156` | Approve a recovery and then cancel the event. The historical approval plus handled risk could still display a completed recovery with an active assignment. | Exclude cancelled events from the recovery-completed display. |
| P2 | `Backend/requirements.txt:1` | The original backend environment contained advisory-affected Starlette, python-dotenv, pytest and packaging tools. npm audit does not inspect Python packages. Several advisories concern functionality not used by these JSON/SSE endpoints, so this was not evidence of an exploited application vulnerability. | Pin compatible patched FastAPI/Starlette, python-dotenv and test packages; update the project virtual environment's pip/setuptools. Re-run backend tests, dependency consistency and the advisory scan. |

Open-Meteo documents precipitation probability and totals as values for the preceding hour, and distinguishes rain from total precipitation including showers/snow. Partial-hour events conservatively use the full hourly intervals that overlap the event; this is an estimate, not minute-resolution weather. See [the provider documentation](https://open-meteo.com/en/docs).

Representative dependency advisories reviewed: [Starlette Windows StaticFiles SSRF](https://github.com/Kludex/starlette/security/advisories/GHSA-wqp7-x3pw-xc5r), [Starlette Range-header denial of service](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8), and [python-dotenv set_key symlink handling](https://github.com/theskumar/python-dotenv/security/advisories/GHSA-mf9w-mj56-hr94). These affected APIs are not used by Planzo's current routes. Versions were still updated to remove the known dependency exposure.

## Verification

| Check | Result |
| --- | --- |
| Initial frontend tests | 106 passed across 8 files |
| Initial adversarial tests, before implementation fixes | 15 failures reproduced; 1 valid-persistence control passed |
| Final frontend tests | 130 passed across 12 files |
| Backend tests after dependency updates | 21 passed |
| TypeScript `tsc --noEmit` | Passed |
| ESLint | 0 errors; 8 existing Fast Refresh export warnings |
| Production build | Passed, including client, SSR and Cloudflare-module output |
| npm audit | 0 known vulnerabilities reported |
| Python OSV scan | 41 installed distributions checked; no advisory matches after updates |
| `pip check` | No broken requirements |
| Live backend health | HTTP 200; Gemini configured |
| Live Open-Meteo geocoding | HTTP 200 for Mumbai |
| Live Open-Meteo forecast | HTTP 200; 384 hourly points |
| Live Gemini streaming | HTTP 200 using configured `gemini-3.5-flash-lite`; 488 response characters streamed |
| Tracked-file secret-pattern scan | No matches for the checked Gemini/GitHub/private-key patterns |

The Python test client emits a deprecation warning about its current httpx adapter. It does not fail tests or affect the application weather client. Build tooling emits existing configuration notices; no build errors occurred.

New regression tests cover cancellation/rescheduling and conflict protection, competing recoveries, stale event/venue approvals, repeated recovery, malformed persistence, incomplete forecasts, precipitation interval semantics, showers, provenance, location invalidation, reset during forecast retrieval, conversational authorization, SSE completion without EOF and invalid dates. Earlier weather tests used sparse hourly fixtures while asserting a complete forecast; those fixtures now cover the actual full event window.

## Security and operational boundaries

- The Gemini key is loaded on the Python server, not packaged into frontend code. Event text and model replies are rendered as React text. The shared chart component's HTML insertion constructs developer-supplied CSS; no event/model input flows into it in this application. Fixed Open-Meteo upstream hosts avoid user-controlled request destinations.
- AI explanations remain advisory. The deterministic planner rechecks venue eligibility and reservations at approval time. Passing tests and system prompts do not prove Gemini can never produce a contradictory sentence; operations do not depend on model-generated claims.
- Browser-local state remains a prototype limitation. It is not an authenticated shared database, and separate tabs/devices are not transactionally synchronized. Use one active operations tab for the demonstration. Reset Demo and browser storage clearing remove the local activity history.
- Before public hosting, configure a public HTTPS `VITE_API_BASE_URL` and explicit backend `ALLOWED_ORIGINS`. The current fallback points to `127.0.0.1`. Add appropriate rate/concurrency controls and request/context limits for the billable Gemini endpoint. CORS alone does not authenticate callers. The backend's weather caches also need bounded eviction for sustained public traffic. These are hosting requirements, not claims of a remotely exploitable local-only deployment.
- Event timestamps are local wall-clock labels. Weather comparisons no longer depend on the browser timezone; full timezone-aware scheduling, including ambiguous destination DST transitions, remains outside the prototype's model.

## Not independently verified

No public deployment was created or tested. No complete visual/responsive browser walkthrough was repeated, no video was recorded, and no Devpost form was submitted. The original P6E screenshots/recording claims were not treated as proof of this review's results. The secret check covered current tracked files and code paths, not every historical Git object or every possible credential format. The advisory scan is a dated database check, not a guarantee against unknown vulnerabilities.

The previous submission status document is a historical snapshot. Its original test totals and absolute readiness claims should not replace this report's verified scope and limitations.
