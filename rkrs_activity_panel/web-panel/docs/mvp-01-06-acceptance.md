# Daily activity MVP acceptance

This matrix records the standalone daily React panel at this change. HTTP interception exercises production React and `AmocrmProViewerSource` with deterministic contracts. It does not establish deployment, authenticated CRM collection, browser-session issuance in a real account, or installation of the widget ZIP.

The accepted MVP includes today and daily history back one calendar month in the account time zone. Operator and missed calls remain today-only. Week/month aggregation and Telegram are excluded. Viewer configuration, current-day events and sessions refresh 90 seconds after the previous request settles while visible. Hidden tabs pause and refresh once on return. Historical selected-day events/sessions do not poll. Current-day auxiliary data and configuration can still refresh while viewing history. Problem collection retains its server-owned seven-minute schedule, `refresh_after`, and bounded collection/error retries.

| Area | Contract and source | Automated evidence | Acceptance boundary |
| --- | --- | --- | --- |
| Dashboard | Employees, groups, timelines, server activity percentages, event KPIs, current problems and missed calls | Existing desktop/mobile route, filter, error/empty/partial/stale and rating-error checks in `e2e/run.mjs`. Formula and activity-rating tests. New live loading/cadence checks. | Real authenticated environment pending for this head. |
| Employee | Whole calendar-day events and separate server work/activity/pause history. Activity percentage from `/view/activity`, profile-v1 curve. | Live production route failed-refresh retention, retry/recovery, first-load failure, previous-day unavailable/retry. Existing profile/session integration and DST tests. | Session reads do not prove installed producer or recorded real activity. |
| Operator | Saved plan/thresholds, outgoing-call count/duration and comparison for configured window | Live count/duration on overlapping pages, previous-day unavailable/retry, failed-refresh retention/recovery, end-bound scope reload. Existing operator formula tests. | Unknown duration remains unclassified. Missing yesterday is unavailable rather than zero. |
| Missed calls | Incoming known-zero duration without subsequent accepted/outgoing call for the number | Live failed-refresh retention/recovery and first-load failure. Existing missed-call formula and null-duration tests. | Unknown duration is explicitly excluded from missed classification. |
| Timelines | Event observations and server sessions remain separate | Existing cross-midnight, DST clipping, hidden-tab resume, slow single-flight and scope cancellation browser checks. Desktop/mobile screenshots. | Empty session history does not prove producer deployment. |
| Metadata | All pages contribute uncertainty, partialness, stale state and distinct notes | `tests/viewer-source.test.ts` checks partial/lagging plus verified/current in both orders for day and employee reads, unknown plus partial and notes. Live two-page partial/overlap badges. | Unknown coverage and partialness remain independent signals. Client completion does not imply an atomic backend snapshot. |
| Event selection | First occurrence of each event ID wins before legacy enrichment. Cursor cycles fail atomically with retryable unavailable. | Public source tests cover 250 calls in three pages, duplicate IDs with one enrichment, immediate and multi-cursor cycles, normal/null pages, explicit null/zero and cancellation. | At 60 pages the selection succeeds with partial=true. At most 150 legacy call cards resolve per read, four concurrently. Unresolved calls keep null duration. |
| Loading and recovery | Translucent centered `Загрузка данных...` overlay within primary content on first load/date change. One small bottom-right nonblocking loader during actual background reads. | Delayed live route checks verify overlay, exact 90-second boundary, usable navigation, retained metrics, recovery, and historical scope. | Yesterday, optional sessions and problems do not block primary content. Management editing retains its separate loading/save flow. |
| Filters and period | Account time zone, panel employees/pipelines and chosen display window bound requests and formulas | Existing filter/formula tests and new live request-bound/date min/max checks. Operator end-only configuration change reloads both days. Historical dashboard reloads its selected day and today-only auxiliary events when the end bound changes. | One calendar month of daily selection, with today-only auxiliary blocks. |
| Personal settings | Browser-local preferences stay separate from shared settings | Existing desktop/mobile settings routes and preferences tests | Real-account acceptance pending. |
| Shared settings and permissions | Admin browser session, tab storage, expiry, revoked permission, CAS saves | Existing `e2e/management-mvp.mjs` uses production React plus actual widget UMD with intercepted HTTP. Covers admin, employee denial, expiry, saves, conflicts and revision ownership. | These tests do not prove deployed session issuance or server authorization configuration. |
| Live contracts | `/panel`, `/timeline`, `/employees/{id}`, `/activity`, `/events/{id}`, `/problems` and `/employees/{id}/sessions` | Live-source tests and intercepted production routes assert viewer bearer and reject unexpected endpoints. Production builds default to live without synthetic fallback. | Deployment/live smoke remains in rollout and real acceptance tasks. Existing deployed expired-session observations do not verify changed code. |

## Verification record

Six public source regressions fail against baseline adapter `1d81c06` in an isolated copy. They expose lost earlier-page metadata, duplicate enrichment, and accepted cursor cycles. The original development run exists only in the implementation tool transcript. A fresh isolated reproduction after the final suite returns exit 1 with six failures and 27 passes. The fixed source passes all 164 tests across 15 files.

Production React reproduction also confirms hidden background errors on employee, operator, and missed calls. Operator and historical-dashboard probes confirm that end-only scope changes previously omitted an immediate event reload. The final production HTTP checks verify both bounds after the fixes.

| Command | Result on 2026-11-02 |
| --- | --- |
| `npm test` | Pass, 164 tests in 15 files. |
| `npm run lint` | Pass. |
| `npm run typecheck` | Pass. |
| `npm run build` | Pass, also executed by the full browser command. |
| `E2E_URL=http://127.0.0.1:5188/ npm run e2e` | Pass, 204 checks with no failures. Includes 65 production live-adapter checks and existing session, problem, authorization, and desktop/mobile checks. |

The full runner uses a private fixture dev server plus ephemeral production preview servers. The widget UMD fixture follows the current **Ещё**, **Настройки** menu and SDK settings entry. It verifies that removal from employee scope hides the widget and that a denied browser-session request issues no credential. Existing bearer, expiry, CAS, and storage assertions remain enabled.

Visual QA opened desktop employee event/session timelines, scoped employee/dashboard loaders, the mobile missed-call loader, desktop operator background/error states, and mobile operator partial/stale state. Navigation remains outside the loading region. The bottom-right loader leaves actions available. Screenshots are generated under the ignored `e2e-out` directory. The private dev server and ephemeral previews are stopped after verification.

Real authenticated test-environment acceptance for this head is **pending**. No deployment or merge occurs in this change.
