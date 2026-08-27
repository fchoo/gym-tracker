---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 71
total_count: 71
last_updated: 2026-08-26T13:21:13.963Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | src/domains/metrics/aggregates.ts |  | Presentation rounding preserves valid maximum safe integers without multiply-divide precision loss | fixed |  | 2026-08-17T13:48:41.042Z | 2026-08-17T13:49:27.947Z |
| 2 | 02 | deviation | src/domains/metrics/contracts.ts |  | Interval targets reject unsupported comparator IDs before persistence consumers | fixed |  | 2026-08-17T13:48:41.115Z | 2026-08-17T13:49:28.019Z |
| 3 | 02 | deviation | src/domains/metrics/aggregates.ts |  | Fixed-distance and fixed-time aggregates reject mixed planned protocols | fixed |  | 2026-08-17T13:48:41.198Z | 2026-08-17T13:49:28.089Z |
| 4 | 02 | deviation | src/domains/scheduling/timeZone.ts |  | Stored-timezone conversion rejects ECMAScript-invalid instant magnitudes before Date construction | fixed |  | 2026-08-17T14:18:35.158Z | 2026-08-17T14:18:59.935Z |
| 5 | 02 | deviation | src/domains/scheduling/localDate.test.ts |  | Strict Jest table and typed-conflict assertions compile and verify the intended behavior | fixed |  | 2026-08-17T14:18:35.228Z | 2026-08-17T14:19:00.009Z |
| 6 | 02 | deviation | src/domains/scheduling/scheduleState.ts |  | Malformed rotation state fails closed before any Train anyway event can carry it forward | fixed |  | 2026-08-17T14:18:35.301Z | 2026-08-17T14:19:00.083Z |
| 7 | 02 | deviation | scripts/run-coverage-gate.mjs |  | Calendar and schedule modules are permanently enforced at complete all-metrics coverage | fixed |  | 2026-08-17T14:18:35.377Z | 2026-08-17T14:19:00.157Z |
| 8 | 02 | deviation | src/platform/sqlite/repositories/contentRepository.ts |  | Accepted catalog contains zero aliases, so runtime import preserves zero alias rows and provides alias-capable schema without inventing approved catalog facts | fixed |  | 2026-08-17T15:58:00.905Z | 2026-08-17T15:58:05.359Z |
| 9 | 02 | deviation | src/domains/metrics/index.ts |  | Content parser consumes metric contracts through the required public domain barrel instead of cross-domain internal imports | fixed |  | 2026-08-17T15:58:05.431Z | 2026-08-17T15:58:05.533Z |
| 10 | 02 | deviation | src/platform/sqlite/migrations/0004_content_library.ts |  | Normalized search-term uniqueness is per exercise so later explicitly confirmed custom duplicates remain representable | fixed |  | 2026-08-17T15:58:05.605Z | 2026-08-17T15:58:05.708Z |
| 11 | 02 | deviation |  |  | Replaced external-content passthrough parity with true FTS shadow-index parity. | fixed |  | 2026-08-18T03:17:46.148Z | 2026-08-18T03:18:44.148Z |
| 12 | 02 | deviation |  |  | Made independent native evidence verification suite-aware for phase2-fts. | fixed |  | 2026-08-18T03:17:46.229Z | 2026-08-18T03:18:44.226Z |
| 13 | 02 | deviation |  |  | Disabled Expo automatic unused-statement close cleanup for FTS contract databases to avoid double-finalize. | fixed |  | 2026-08-18T03:17:46.306Z | 2026-08-18T03:18:44.305Z |
| 14 | 02 | deviation |  |  | Added migration 0005 and the search-index repository to the explicit 100 percent integrity coverage gate. | fixed |  | 2026-08-18T03:17:46.387Z | 2026-08-18T03:18:44.382Z |
| 15 | 02 | deviation | src/platform/sqlite/repositories/metricRepository.ts |  | Bound metric profile migration idempotency to canonical request bytes and superseded queued recommendation work atomically | fixed |  | 2026-08-18T04:28:55.315Z | 2026-08-18T04:29:31.253Z |
| 16 | 02 | deviation | scripts/run-coverage-gate.mjs |  | Added migration 0006, the D-34 command, and metric repository to the explicit 100 percent integrity coverage gate | fixed |  | 2026-08-18T04:28:55.386Z | 2026-08-18T04:29:31.322Z |
| 17 | 02 | deviation | tests/migrations/fixtures/v6-metric-profiles.sql |  | Generated retained v6 dump required portable FTS reconstruction instead of writable_schema internals | fixed |  | 2026-08-18T05:24:36.005Z | 2026-08-18T05:25:07.738Z |
| 18 | 02 | deviation | src/platform/sqlite/migrations/0008_schedule_activation.ts |  | Activation receipts needed an explicit initial choice and reusable preserved schedule references | fixed |  | 2026-08-18T05:24:36.091Z | 2026-08-18T05:25:07.828Z |
| 19 | 02 | deviation | src/platform/sqlite/migrations/0008_schedule_activation.ts |  | Complete accepted occurrence attribution required immutable day and occurrence source maps plus owned metric-override tables | fixed |  | 2026-08-18T05:24:36.178Z | 2026-08-18T05:25:07.932Z |
| 20 | 02 | deviation | src/platform/sqlite/migrations/0008_schedule_activation.ts |  | Retained legacy schedule facts and orphan active plans required explicit migration and first-activation handling | fixed |  | 2026-08-18T05:24:36.262Z | 2026-08-18T05:25:08.028Z |
| 21 | 02 | deviation | scripts/run-coverage-gate.mjs |  | New activation integrity modules required permanent 100 percent all-metrics coverage enforcement | fixed |  | 2026-08-18T05:24:36.338Z | 2026-08-18T05:25:08.120Z |
| 22 | 02 | deviation | src/domains/plans/activateStarterPlan.ts |  | Accepted activation preserved Phase 1 callers through public domain barrels and legacy-compatible overload ordering | fixed |  | 2026-08-18T05:25:49.828Z | 2026-08-18T05:25:55.051Z |
| 23 | 02 | deviation | src/domains/library/search.ts |  | Search validates raw query length before normalization expansion and rejects malformed runtime filter containers | fixed |  | 2026-08-18T05:58:29.657Z | 2026-08-18T05:59:01.156Z |
| 24 | 02 | deviation | scripts/run-coverage-gate.mjs |  | Search domain and repository modules are permanently enforced at 100 percent statements branches functions and lines | fixed |  | 2026-08-18T05:58:29.734Z | 2026-08-18T05:59:01.230Z |
| 25 | 02 | deviation | src/platform/sqlite/repositories/librarySearchRepository.ts |  | Prepared candidate parameters follow SQLite lexical placeholder order across filter candidate rank cursor and limit bindings | fixed |  | 2026-08-18T05:59:01.303Z | 2026-08-18T05:59:01.406Z |
| 26 | 02 | deviation | src/platform/sqlite/repositories/customExerciseRepository.ts |  | Custom create retries reconstruct exact committed SQLite facts after repository recreation | fixed |  | 2026-08-18T07:02:03.767Z | 2026-08-18T07:02:08.606Z |
| 27 | 02 | deviation | src/domains/library/customExerciseCommands.ts |  | Favorite preference lifecycle shares revision-safe owner-state transactions with hide and archive | fixed |  | 2026-08-18T07:02:08.683Z | 2026-08-18T07:02:08.802Z |
| 28 | 02 | deviation | scripts/run-coverage-gate.mjs |  | Custom exercise command and repository modules are permanently enforced at 100 percent all-metrics coverage | fixed |  | 2026-08-18T07:02:08.884Z | 2026-08-18T07:02:08.992Z |
| 29 | 02 | deviation | src/platform/sqlite/migrations/0009_owned_plans.ts |  | Owned-plan no-permanent-delete enforcement covers plans days occurrences warm-ups targets policies and structural impact refusal | fixed |  | 2026-08-18T07:57:56.921Z | 2026-08-18T07:58:02.224Z |
| 30 | 02 | deviation | src/bootstrap/workoutAppRuntime.tsx |  | Final runtime migration manifest uses validated Expo SQLite recovery backup before destructive migration 0006 | fixed |  | 2026-08-18T07:58:02.302Z | 2026-08-18T07:58:02.409Z |
| 31 | 02 | deviation | src/platform/sqlite/repositories/ownedPlanRepository.ts |  | Stable aggregate reorders use collision-safe temporary ordinals inside one exclusive transaction | fixed |  | 2026-08-18T07:58:02.484Z | 2026-08-18T07:58:02.594Z |
| 32 | 02 | deviation | scripts/run-coverage-gate.mjs |  | Owned-plan command migration and repository modules are permanently enforced at 100 percent all-metrics coverage | fixed |  | 2026-08-18T07:58:02.670Z | 2026-08-18T07:58:02.776Z |
| 33 | 02 | deviation | src/platform/sqlite/repositories/plansWorkoutRepository.ts |  | Nine-profile session adapters preserve retained Phase 1 schema and legacy recommendation/outcome JSON compatibility while v9 uses complete metric identity | fixed |  | 2026-08-18T08:59:28.380Z | 2026-08-18T08:59:34.124Z |
| 34 | 02 | deviation | src/domains/workout/setCommands.test.ts |  | Completed unscored fixed-time and interval semantic boundaries restore setCommands integrity-critical coverage to 100 percent all metrics | fixed |  | 2026-08-18T08:59:34.200Z | 2026-08-18T08:59:34.339Z |
| 35 | 02 | deviation | src/ui/layout/AdaptiveScreen.tsx |  | AdaptiveScreen now exposes controlled scroll restoration required by Library process-local state | fixed |  | 2026-08-18T12:16:19.939Z | 2026-08-18T12:16:24.511Z |
| 36 | 02 | deviation | src/bootstrap/workoutAppRuntime.tsx |  | Library starter summaries cross the owner-accepted hash boundary before presentation | fixed |  | 2026-08-18T12:16:24.583Z | 2026-08-18T12:16:24.683Z |
| 37 | 02 | deviation | src/ui/screens/LibraryScreen.tsx |  | Favorites use a dedicated authoritative filter query instead of the first All Exercises page | fixed |  | 2026-08-18T12:16:24.755Z | 2026-08-18T12:16:24.857Z |
| 38 | 02 | deviation | src/bootstrap/workoutAppRuntime.tsx |  | Content update failure preserves trusted launch and the previous committed Library | fixed |  | 2026-08-18T12:16:24.928Z | 2026-08-18T12:16:25.029Z |
| 39 | 02 | deviation | src/domains/plans/activateStarterPlan.ts |  | D-54 required a distinct inactive accepted-copy command so comparison never mutates the active plan, schedule, or workout | fixed |  | 2026-08-18T13:36:19.225Z | 2026-08-18T13:36:51.112Z |
| 40 | 02 | deviation | src/bootstrap/starterPlanRuntime.tsx |  | Retained Phase 1 Full Body Foundation copies require a read-only revision-one compatibility graph for accepted revision-two diff | fixed |  | 2026-08-18T13:36:22.233Z | 2026-08-18T13:36:51.190Z |
| 41 | 02 | deviation |  |  | Added authoritative owned-plan readback on the trusted kernel | fixed |  | 2026-08-18T14:25:58.350Z | 2026-08-18T14:28:02.701Z |
| 42 | 02 | deviation |  |  | Prevented local draft validity from enabling Schedule or Activate before Save plan | fixed |  | 2026-08-18T14:25:58.421Z | 2026-08-18T14:28:02.774Z |
| 43 | 02 | deviation |  |  | Added authoritative in-progress workout presence to editor snapshots | fixed |  | 2026-08-18T14:25:58.494Z | 2026-08-18T14:28:02.843Z |
| 44 | 02 | deviation |  |  | Closed non-pointer dirty-leave drag reduced-motion and lifecycle focus paths | fixed |  | 2026-08-18T14:25:58.566Z | 2026-08-18T14:28:02.913Z |
| 45 | 02 | deviation |  |  | Restored global function coverage with focused runtime adapter proof | fixed |  | 2026-08-18T14:25:58.636Z | 2026-08-18T14:28:02.981Z |
| 46 | 02 | deviation | src/platform/sqlite/repositories/metricRepository.ts |  | Metric profile migration now validates and updates retained and final owned plan target and policy graphs atomically | fixed |  | 2026-08-18T15:42:21.542Z | 2026-08-18T15:42:25.930Z |
| 47 | 02 | deviation | src/bootstrap/workoutAppRuntime.tsx |  | Trusted custom exercise runtime provides bounded detail migration reads and revisioned commands while routes and screens remain thin | fixed |  | 2026-08-18T15:42:26.010Z | 2026-08-18T15:42:26.122Z |
| 48 | 02 | deviation | src/bootstrap/customExerciseRuntime.test.tsx |  | Focused runtime adapter and real SQLite readback tests restore global coverage while metricRepository remains 100 percent all metrics | fixed |  | 2026-08-18T15:42:26.199Z | 2026-08-18T15:42:26.310Z |
| 49 | 02 | deviation | src/platform/sqlite/repositories/planImpactRepository.ts |  | D-32 removal retains source rows outside the current ordinal window and appends prospective schedule facts | fixed |  | 2026-08-18T17:05:35.629Z | 2026-08-18T17:05:41.344Z |
| 50 | 02 | deviation | src/platform/sqlite/repositories/planImpactRepository.ts |  | Plan-impact retries reconstruct exact committed SQLite state without a second receipt table | fixed |  | 2026-08-18T17:05:41.431Z | 2026-08-18T17:05:41.547Z |
| 51 | 02 | deviation | src/domains/plans/index.ts |  | Plan-impact domain and UI consume cross-domain behavior only through public barrels | fixed |  | 2026-08-18T17:05:41.628Z | 2026-08-18T17:05:41.742Z |
| 52 | 02 | deviation | scripts/run-coverage-gate.mjs |  | Plan-impact command and repository modules are permanently enforced at 100 percent all-metrics coverage | fixed |  | 2026-08-18T17:05:41.823Z | 2026-08-18T17:05:41.933Z |
| 53 | 02 | deviation | src/bootstrap/workoutAppRuntime.tsx |  | Trusted runtime and owned editor expose only bounded D-32 D-52 D-53 capabilities through thin routes | fixed |  | 2026-08-18T17:05:42.017Z | 2026-08-18T17:05:42.131Z |
| 54 | 02 | unmet-truth | scripts/run-coverage-gate.mjs |  | Merged coverage passes all 1,449 tests but global function coverage is 89.92 percent against the 90 percent threshold after three focused Plan 02-19 attempts; Plan 02-21 owns final Phase 2 coverage enumeration | fixed |  | 2026-08-18T18:22:12.323Z | 2026-08-18T19:45:33.147Z |
| 55 | 02 | deviation | jest.config.js |  | Component route tests required app-root discovery and escaped Expo Router parenthesized paths. | fixed |  | 2026-08-22T07:19:24.555Z | 2026-08-22T07:20:22.835Z |
| 56 | 02 | deviation | src/ui/components/CalendarField.tsx |  | Bound calendar month navigation to LocalDate years 0001 through 9999. | fixed |  | 2026-08-22T07:42:49.261Z | 2026-08-22T07:43:04.397Z |
| 57 | 02 | deviation | src/ui/__tests__/PlanImpactReplacement.test.tsx |  | Added calendar proof to the owning prospective day-removal impact suite. | fixed |  | 2026-08-22T07:42:49.335Z | 2026-08-22T07:43:04.484Z |
| 58 | 02 | deviation | tests/integration/complete-set.test.ts |  | Full-schema test fixture required identity-column updates after replacing migration-0001-only setup. | fixed |  | 2026-08-22T08:46:54.873Z | 2026-08-22T08:47:49.892Z |
| 59 | 02 | deviation | src/platform/preferences/restAlertPreferenceStore.ts |  | Lazy Expo SQLite KV access preserves the fail-soft default-on preference contract in Node lifecycle verification. | fixed |  | 2026-08-22T09:07:17.462Z | 2026-08-22T09:07:52.870Z |
| 60 | 02 | deviation | src/bootstrap/phase1NotificationTestControls.ts |  | Development stale-alert control now selects the immutable v2 default channel instead of legacy v1. | fixed |  | 2026-08-22T09:07:17.536Z | 2026-08-22T09:07:52.946Z |
| 61 | 02 | deviation | src/ui/components/SemanticNumberField.tsx |  | Preserved caller-supplied active numeric focus styling in the shared semantic field. | fixed |  | 2026-08-22T09:32:53.868Z | 2026-08-22T09:33:32.398Z |
| 62 | 02 | deviation | src/ui/components/SetRow.tsx |  | Persisted confirmed active duration values directly instead of stale React draft state. | fixed |  | 2026-08-22T09:32:53.954Z | 2026-08-22T09:33:32.469Z |
| 63 | 02 | deviation | src/ui/components/index.ts |  | Added card-safe shared component modes as a resolved Rule 2 accessibility correction. | fixed |  | 2026-08-22T10:05:26.208Z | 2026-08-22T10:06:30.531Z |
| 64 | 02 | deviation | src/ui/screens/ActiveWorkoutScreen.tsx |  | Preserved completed rows after the final active set so active-session correction remains available. | fixed |  | 2026-08-22T10:52:29.777Z | 2026-08-22T10:53:06.725Z |
| 65 | 02 | deviation | src/ui/screens/ActiveWorkoutScreen.tsx |  | Added synchronous duplicate-submit guards and committed-row reveal/focus for active-workout mutations. | fixed |  | 2026-08-22T10:52:29.849Z | 2026-08-22T10:53:06.798Z |
| 66 | 02 | deviation | src/ui/screens/ActiveWorkoutScreen.tsx |  | Added synchronous rest-command in-flight guard so rapid repeated Skip activation invokes the authoritative command once. | fixed |  | 2026-08-22T11:10:17.444Z | 2026-08-22T11:10:56.187Z |
| 67 | 05 | unrun-verify | scripts/run-coverage-gate.mjs |  | Whole-repository coverage gate was intentionally deferred to orchestration after Plan 05-05 focused verification | fixed |  | 2026-08-26T08:52:48.942Z | 2026-08-26T11:09:50.347Z |
| 68 | 05 | deviation | scripts/run-phase5-maestro.mjs |  | Added real consolidated production candidate flows and producers in place of deferred Phase 3 and 4 validators | fixed |  | 2026-08-26T13:20:54.098Z | 2026-08-26T13:21:13.616Z |
| 69 | 05 | deviation | scripts/create-release-candidate-manifest.mjs |  | Made the immediate canonical manifest and explicit SHA propagation authoritative after the single build | fixed |  | 2026-08-26T13:20:54.198Z | 2026-08-26T13:21:13.728Z |
| 70 | 05 | deviation | scripts/generate-phase5-attended-checklist.mjs |  | Replaced digest-only attended trust with exact rows and immutable attachment byte verification | fixed |  | 2026-08-26T13:20:54.291Z | 2026-08-26T13:21:13.860Z |
| 71 | 05 | deviation | .github/workflows/release-promotion.yml |  | Hardened cross-run promotion with successful-run provenance reuse rejection and public hash verification | fixed |  | 2026-08-26T13:20:54.390Z | 2026-08-26T13:21:13.963Z |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/metrics/aggregates.ts",
    "line": null,
    "description": "Presentation rounding preserves valid maximum safe integers without multiply-divide precision loss",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T13:48:41.042Z",
    "resolved_at": "2026-08-17T13:49:27.947Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/metrics/contracts.ts",
    "line": null,
    "description": "Interval targets reject unsupported comparator IDs before persistence consumers",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T13:48:41.115Z",
    "resolved_at": "2026-08-17T13:49:28.019Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/metrics/aggregates.ts",
    "line": null,
    "description": "Fixed-distance and fixed-time aggregates reject mixed planned protocols",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T13:48:41.198Z",
    "resolved_at": "2026-08-17T13:49:28.089Z"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/scheduling/timeZone.ts",
    "line": null,
    "description": "Stored-timezone conversion rejects ECMAScript-invalid instant magnitudes before Date construction",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T14:18:35.158Z",
    "resolved_at": "2026-08-17T14:18:59.935Z"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/scheduling/localDate.test.ts",
    "line": null,
    "description": "Strict Jest table and typed-conflict assertions compile and verify the intended behavior",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T14:18:35.228Z",
    "resolved_at": "2026-08-17T14:19:00.009Z"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/scheduling/scheduleState.ts",
    "line": null,
    "description": "Malformed rotation state fails closed before any Train anyway event can carry it forward",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T14:18:35.301Z",
    "resolved_at": "2026-08-17T14:19:00.083Z"
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Calendar and schedule modules are permanently enforced at complete all-metrics coverage",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T14:18:35.377Z",
    "resolved_at": "2026-08-17T14:19:00.157Z"
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/contentRepository.ts",
    "line": null,
    "description": "Accepted catalog contains zero aliases, so runtime import preserves zero alias rows and provides alias-capable schema without inventing approved catalog facts",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T15:58:00.905Z",
    "resolved_at": "2026-08-17T15:58:05.359Z"
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/metrics/index.ts",
    "line": null,
    "description": "Content parser consumes metric contracts through the required public domain barrel instead of cross-domain internal imports",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T15:58:05.431Z",
    "resolved_at": "2026-08-17T15:58:05.533Z"
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/migrations/0004_content_library.ts",
    "line": null,
    "description": "Normalized search-term uniqueness is per exercise so later explicitly confirmed custom duplicates remain representable",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T15:58:05.605Z",
    "resolved_at": "2026-08-17T15:58:05.708Z"
  },
  {
    "id": 11,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Replaced external-content passthrough parity with true FTS shadow-index parity.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T03:17:46.148Z",
    "resolved_at": "2026-08-18T03:18:44.148Z"
  },
  {
    "id": 12,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Made independent native evidence verification suite-aware for phase2-fts.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T03:17:46.229Z",
    "resolved_at": "2026-08-18T03:18:44.226Z"
  },
  {
    "id": 13,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Disabled Expo automatic unused-statement close cleanup for FTS contract databases to avoid double-finalize.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T03:17:46.306Z",
    "resolved_at": "2026-08-18T03:18:44.305Z"
  },
  {
    "id": 14,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Added migration 0005 and the search-index repository to the explicit 100 percent integrity coverage gate.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T03:17:46.387Z",
    "resolved_at": "2026-08-18T03:18:44.382Z"
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/metricRepository.ts",
    "line": null,
    "description": "Bound metric profile migration idempotency to canonical request bytes and superseded queued recommendation work atomically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T04:28:55.315Z",
    "resolved_at": "2026-08-18T04:29:31.253Z"
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Added migration 0006, the D-34 command, and metric repository to the explicit 100 percent integrity coverage gate",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T04:28:55.386Z",
    "resolved_at": "2026-08-18T04:29:31.322Z"
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "02",
    "file": "tests/migrations/fixtures/v6-metric-profiles.sql",
    "line": null,
    "description": "Generated retained v6 dump required portable FTS reconstruction instead of writable_schema internals",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:24:36.005Z",
    "resolved_at": "2026-08-18T05:25:07.738Z"
  },
  {
    "id": 18,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/migrations/0008_schedule_activation.ts",
    "line": null,
    "description": "Activation receipts needed an explicit initial choice and reusable preserved schedule references",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:24:36.091Z",
    "resolved_at": "2026-08-18T05:25:07.828Z"
  },
  {
    "id": 19,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/migrations/0008_schedule_activation.ts",
    "line": null,
    "description": "Complete accepted occurrence attribution required immutable day and occurrence source maps plus owned metric-override tables",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:24:36.178Z",
    "resolved_at": "2026-08-18T05:25:07.932Z"
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/migrations/0008_schedule_activation.ts",
    "line": null,
    "description": "Retained legacy schedule facts and orphan active plans required explicit migration and first-activation handling",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:24:36.262Z",
    "resolved_at": "2026-08-18T05:25:08.028Z"
  },
  {
    "id": 21,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "New activation integrity modules required permanent 100 percent all-metrics coverage enforcement",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:24:36.338Z",
    "resolved_at": "2026-08-18T05:25:08.120Z"
  },
  {
    "id": 22,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/plans/activateStarterPlan.ts",
    "line": null,
    "description": "Accepted activation preserved Phase 1 callers through public domain barrels and legacy-compatible overload ordering",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:25:49.828Z",
    "resolved_at": "2026-08-18T05:25:55.051Z"
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/library/search.ts",
    "line": null,
    "description": "Search validates raw query length before normalization expansion and rejects malformed runtime filter containers",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:58:29.657Z",
    "resolved_at": "2026-08-18T05:59:01.156Z"
  },
  {
    "id": 24,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Search domain and repository modules are permanently enforced at 100 percent statements branches functions and lines",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:58:29.734Z",
    "resolved_at": "2026-08-18T05:59:01.230Z"
  },
  {
    "id": 25,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/librarySearchRepository.ts",
    "line": null,
    "description": "Prepared candidate parameters follow SQLite lexical placeholder order across filter candidate rank cursor and limit bindings",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T05:59:01.303Z",
    "resolved_at": "2026-08-18T05:59:01.406Z"
  },
  {
    "id": 26,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/customExerciseRepository.ts",
    "line": null,
    "description": "Custom create retries reconstruct exact committed SQLite facts after repository recreation",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:02:03.767Z",
    "resolved_at": "2026-08-18T07:02:08.606Z"
  },
  {
    "id": 27,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/library/customExerciseCommands.ts",
    "line": null,
    "description": "Favorite preference lifecycle shares revision-safe owner-state transactions with hide and archive",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:02:08.683Z",
    "resolved_at": "2026-08-18T07:02:08.802Z"
  },
  {
    "id": 28,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Custom exercise command and repository modules are permanently enforced at 100 percent all-metrics coverage",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:02:08.884Z",
    "resolved_at": "2026-08-18T07:02:08.992Z"
  },
  {
    "id": 29,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/migrations/0009_owned_plans.ts",
    "line": null,
    "description": "Owned-plan no-permanent-delete enforcement covers plans days occurrences warm-ups targets policies and structural impact refusal",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:57:56.921Z",
    "resolved_at": "2026-08-18T07:58:02.224Z"
  },
  {
    "id": 30,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/workoutAppRuntime.tsx",
    "line": null,
    "description": "Final runtime migration manifest uses validated Expo SQLite recovery backup before destructive migration 0006",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:58:02.302Z",
    "resolved_at": "2026-08-18T07:58:02.409Z"
  },
  {
    "id": 31,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/ownedPlanRepository.ts",
    "line": null,
    "description": "Stable aggregate reorders use collision-safe temporary ordinals inside one exclusive transaction",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:58:02.484Z",
    "resolved_at": "2026-08-18T07:58:02.594Z"
  },
  {
    "id": 32,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Owned-plan command migration and repository modules are permanently enforced at 100 percent all-metrics coverage",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T07:58:02.670Z",
    "resolved_at": "2026-08-18T07:58:02.776Z"
  },
  {
    "id": 33,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/plansWorkoutRepository.ts",
    "line": null,
    "description": "Nine-profile session adapters preserve retained Phase 1 schema and legacy recommendation/outcome JSON compatibility while v9 uses complete metric identity",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T08:59:28.380Z",
    "resolved_at": "2026-08-18T08:59:34.124Z"
  },
  {
    "id": 34,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/workout/setCommands.test.ts",
    "line": null,
    "description": "Completed unscored fixed-time and interval semantic boundaries restore setCommands integrity-critical coverage to 100 percent all metrics",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T08:59:34.200Z",
    "resolved_at": "2026-08-18T08:59:34.339Z"
  },
  {
    "id": 35,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/layout/AdaptiveScreen.tsx",
    "line": null,
    "description": "AdaptiveScreen now exposes controlled scroll restoration required by Library process-local state",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T12:16:19.939Z",
    "resolved_at": "2026-08-18T12:16:24.511Z"
  },
  {
    "id": 36,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/workoutAppRuntime.tsx",
    "line": null,
    "description": "Library starter summaries cross the owner-accepted hash boundary before presentation",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T12:16:24.583Z",
    "resolved_at": "2026-08-18T12:16:24.683Z"
  },
  {
    "id": 37,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/screens/LibraryScreen.tsx",
    "line": null,
    "description": "Favorites use a dedicated authoritative filter query instead of the first All Exercises page",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T12:16:24.755Z",
    "resolved_at": "2026-08-18T12:16:24.857Z"
  },
  {
    "id": 38,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/workoutAppRuntime.tsx",
    "line": null,
    "description": "Content update failure preserves trusted launch and the previous committed Library",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T12:16:24.928Z",
    "resolved_at": "2026-08-18T12:16:25.029Z"
  },
  {
    "id": 39,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/plans/activateStarterPlan.ts",
    "line": null,
    "description": "D-54 required a distinct inactive accepted-copy command so comparison never mutates the active plan, schedule, or workout",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T13:36:19.225Z",
    "resolved_at": "2026-08-18T13:36:51.112Z"
  },
  {
    "id": 40,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/starterPlanRuntime.tsx",
    "line": null,
    "description": "Retained Phase 1 Full Body Foundation copies require a read-only revision-one compatibility graph for accepted revision-two diff",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T13:36:22.233Z",
    "resolved_at": "2026-08-18T13:36:51.190Z"
  },
  {
    "id": 41,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Added authoritative owned-plan readback on the trusted kernel",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T14:25:58.350Z",
    "resolved_at": "2026-08-18T14:28:02.701Z"
  },
  {
    "id": 42,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Prevented local draft validity from enabling Schedule or Activate before Save plan",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T14:25:58.421Z",
    "resolved_at": "2026-08-18T14:28:02.774Z"
  },
  {
    "id": 43,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Added authoritative in-progress workout presence to editor snapshots",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T14:25:58.494Z",
    "resolved_at": "2026-08-18T14:28:02.843Z"
  },
  {
    "id": 44,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Closed non-pointer dirty-leave drag reduced-motion and lifecycle focus paths",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T14:25:58.566Z",
    "resolved_at": "2026-08-18T14:28:02.913Z"
  },
  {
    "id": 45,
    "kind": "deviation",
    "phase": "02",
    "file": "",
    "line": null,
    "description": "Restored global function coverage with focused runtime adapter proof",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T14:25:58.636Z",
    "resolved_at": "2026-08-18T14:28:02.981Z"
  },
  {
    "id": 46,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/metricRepository.ts",
    "line": null,
    "description": "Metric profile migration now validates and updates retained and final owned plan target and policy graphs atomically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T15:42:21.542Z",
    "resolved_at": "2026-08-18T15:42:25.930Z"
  },
  {
    "id": 47,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/workoutAppRuntime.tsx",
    "line": null,
    "description": "Trusted custom exercise runtime provides bounded detail migration reads and revisioned commands while routes and screens remain thin",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T15:42:26.010Z",
    "resolved_at": "2026-08-18T15:42:26.122Z"
  },
  {
    "id": 48,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/customExerciseRuntime.test.tsx",
    "line": null,
    "description": "Focused runtime adapter and real SQLite readback tests restore global coverage while metricRepository remains 100 percent all metrics",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T15:42:26.199Z",
    "resolved_at": "2026-08-18T15:42:26.310Z"
  },
  {
    "id": 49,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/planImpactRepository.ts",
    "line": null,
    "description": "D-32 removal retains source rows outside the current ordinal window and appends prospective schedule facts",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T17:05:35.629Z",
    "resolved_at": "2026-08-18T17:05:41.344Z"
  },
  {
    "id": 50,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/sqlite/repositories/planImpactRepository.ts",
    "line": null,
    "description": "Plan-impact retries reconstruct exact committed SQLite state without a second receipt table",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T17:05:41.431Z",
    "resolved_at": "2026-08-18T17:05:41.547Z"
  },
  {
    "id": 51,
    "kind": "deviation",
    "phase": "02",
    "file": "src/domains/plans/index.ts",
    "line": null,
    "description": "Plan-impact domain and UI consume cross-domain behavior only through public barrels",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T17:05:41.628Z",
    "resolved_at": "2026-08-18T17:05:41.742Z"
  },
  {
    "id": 52,
    "kind": "deviation",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Plan-impact command and repository modules are permanently enforced at 100 percent all-metrics coverage",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T17:05:41.823Z",
    "resolved_at": "2026-08-18T17:05:41.933Z"
  },
  {
    "id": 53,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/workoutAppRuntime.tsx",
    "line": null,
    "description": "Trusted runtime and owned editor expose only bounded D-32 D-52 D-53 capabilities through thin routes",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T17:05:42.017Z",
    "resolved_at": "2026-08-18T17:05:42.131Z"
  },
  {
    "id": 54,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Merged coverage passes all 1,449 tests but global function coverage is 89.92 percent against the 90 percent threshold after three focused Plan 02-19 attempts; Plan 02-21 owns final Phase 2 coverage enumeration",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T18:22:12.323Z",
    "resolved_at": "2026-08-18T19:45:33.147Z"
  },
  {
    "id": 55,
    "kind": "deviation",
    "phase": "02",
    "file": "jest.config.js",
    "line": null,
    "description": "Component route tests required app-root discovery and escaped Expo Router parenthesized paths.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T07:19:24.555Z",
    "resolved_at": "2026-08-22T07:20:22.835Z"
  },
  {
    "id": 56,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/components/CalendarField.tsx",
    "line": null,
    "description": "Bound calendar month navigation to LocalDate years 0001 through 9999.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T07:42:49.261Z",
    "resolved_at": "2026-08-22T07:43:04.397Z"
  },
  {
    "id": 57,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/__tests__/PlanImpactReplacement.test.tsx",
    "line": null,
    "description": "Added calendar proof to the owning prospective day-removal impact suite.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T07:42:49.335Z",
    "resolved_at": "2026-08-22T07:43:04.484Z"
  },
  {
    "id": 58,
    "kind": "deviation",
    "phase": "02",
    "file": "tests/integration/complete-set.test.ts",
    "line": null,
    "description": "Full-schema test fixture required identity-column updates after replacing migration-0001-only setup.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T08:46:54.873Z",
    "resolved_at": "2026-08-22T08:47:49.892Z"
  },
  {
    "id": 59,
    "kind": "deviation",
    "phase": "02",
    "file": "src/platform/preferences/restAlertPreferenceStore.ts",
    "line": null,
    "description": "Lazy Expo SQLite KV access preserves the fail-soft default-on preference contract in Node lifecycle verification.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T09:07:17.462Z",
    "resolved_at": "2026-08-22T09:07:52.870Z"
  },
  {
    "id": 60,
    "kind": "deviation",
    "phase": "02",
    "file": "src/bootstrap/phase1NotificationTestControls.ts",
    "line": null,
    "description": "Development stale-alert control now selects the immutable v2 default channel instead of legacy v1.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T09:07:17.536Z",
    "resolved_at": "2026-08-22T09:07:52.946Z"
  },
  {
    "id": 61,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/components/SemanticNumberField.tsx",
    "line": null,
    "description": "Preserved caller-supplied active numeric focus styling in the shared semantic field.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T09:32:53.868Z",
    "resolved_at": "2026-08-22T09:33:32.398Z"
  },
  {
    "id": 62,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/components/SetRow.tsx",
    "line": null,
    "description": "Persisted confirmed active duration values directly instead of stale React draft state.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T09:32:53.954Z",
    "resolved_at": "2026-08-22T09:33:32.469Z"
  },
  {
    "id": 63,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/components/index.ts",
    "line": null,
    "description": "Added card-safe shared component modes as a resolved Rule 2 accessibility correction.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T10:05:26.208Z",
    "resolved_at": "2026-08-22T10:06:30.531Z"
  },
  {
    "id": 64,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/screens/ActiveWorkoutScreen.tsx",
    "line": null,
    "description": "Preserved completed rows after the final active set so active-session correction remains available.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T10:52:29.777Z",
    "resolved_at": "2026-08-22T10:53:06.725Z"
  },
  {
    "id": 65,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/screens/ActiveWorkoutScreen.tsx",
    "line": null,
    "description": "Added synchronous duplicate-submit guards and committed-row reveal/focus for active-workout mutations.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T10:52:29.849Z",
    "resolved_at": "2026-08-22T10:53:06.798Z"
  },
  {
    "id": 66,
    "kind": "deviation",
    "phase": "02",
    "file": "src/ui/screens/ActiveWorkoutScreen.tsx",
    "line": null,
    "description": "Added synchronous rest-command in-flight guard so rapid repeated Skip activation invokes the authoritative command once.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T11:10:17.444Z",
    "resolved_at": "2026-08-22T11:10:56.187Z"
  },
  {
    "id": 67,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "scripts/run-coverage-gate.mjs",
    "line": null,
    "description": "Whole-repository coverage gate was intentionally deferred to orchestration after Plan 05-05 focused verification",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T08:52:48.942Z",
    "resolved_at": "2026-08-26T11:09:50.347Z"
  },
  {
    "id": 68,
    "kind": "deviation",
    "phase": "05",
    "file": "scripts/run-phase5-maestro.mjs",
    "line": null,
    "description": "Added real consolidated production candidate flows and producers in place of deferred Phase 3 and 4 validators",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T13:20:54.098Z",
    "resolved_at": "2026-08-26T13:21:13.616Z"
  },
  {
    "id": 69,
    "kind": "deviation",
    "phase": "05",
    "file": "scripts/create-release-candidate-manifest.mjs",
    "line": null,
    "description": "Made the immediate canonical manifest and explicit SHA propagation authoritative after the single build",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T13:20:54.198Z",
    "resolved_at": "2026-08-26T13:21:13.728Z"
  },
  {
    "id": 70,
    "kind": "deviation",
    "phase": "05",
    "file": "scripts/generate-phase5-attended-checklist.mjs",
    "line": null,
    "description": "Replaced digest-only attended trust with exact rows and immutable attachment byte verification",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T13:20:54.291Z",
    "resolved_at": "2026-08-26T13:21:13.860Z"
  },
  {
    "id": 71,
    "kind": "deviation",
    "phase": "05",
    "file": ".github/workflows/release-promotion.yml",
    "line": null,
    "description": "Hardened cross-run promotion with successful-run provenance reuse rejection and public hash verification",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T13:20:54.390Z",
    "resolved_at": "2026-08-26T13:21:13.963Z"
  }
]
````
