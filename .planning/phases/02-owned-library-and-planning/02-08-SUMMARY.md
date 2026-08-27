---
phase: 02-owned-library-and-planning
plan: 08
subsystem: database
tags: [sqlite, starter-plans, activation, scheduling, idempotency, source-attribution, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Owner-accepted six-template starter bytes, exact acceptance hashes, and D-55 content from Plan 02-05
  - phase: 02-owned-library-and-planning
    provides: Calendar-safe Weekday/Rotation transitions and immutable consumed schedule semantics from Plan 02-03
  - phase: 02-owned-library-and-planning
    provides: Accepted catalog identities and complete nine-profile persistence from Plans 02-04 and 02-07
provides:
  - Direct-imported migration 0008 with authoritative owned source attribution, effective schedule versions, bindings, overrides, opportunities, events, and activation receipts
  - Exact hash-bound parsing and confirmation-bound activation commands for all six accepted starter templates
  - Atomic fresh-copy and explicit existing-copy reactivation with preserved prior plans/schedules, optimistic revisions, and active-workout blocking
  - Executable D-55 proof for five ordered weekday days and 20 unique weighted load/reps occurrences with no omissions or substitutions
affects: [library-plans, plan-editing, schedule-commands, workout-start, migration-manifest, plan-02-11]

actuals:
  tokens: 53116
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Accepted starter bytes are hash- and semantic-validated before any repository call
    - Activation confirmation tokens bind template revision, date, timezone, mode, bindings, and explicit copy choice
    - Accepted occurrence-level metric overrides live in the authoritative owned Phase 2 graph without mutating bundled catalog identities
    - Request receipts bind canonical command SHA-256 values to committed read models after one serialized SQLite transaction

key-files:
  created:
    - src/domains/scheduling/activation.ts
    - src/domains/scheduling/index.ts
    - src/platform/sqlite/migrations/0008_schedule_activation.ts
    - src/platform/sqlite/repositories/starterPlanRepository.ts
    - tests/integration/starter-activation-repository.test.ts
    - tests/migrations/fixtures/v6-metric-profiles.sql
    - tests/sqlite-host/schedule-activation.test.ts
  modified:
    - scripts/run-coverage-gate.mjs
    - src/domains/metrics/index.ts
    - src/domains/plans/activateStarterPlan.ts
    - src/domains/plans/activateStarterPlan.test.ts
    - src/domains/plans/index.ts

key-decisions:
  - "Migration 0008 is an additive direct successor of retained version 6 with version 7 intentionally unused; src/platform/sqlite/migrations/index.ts remains exclusively owned by Plan 02-11."
  - "The accepted command consumes only asset SHA-256 8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4 and acceptance-file SHA-256 22052f2e1dbda90122d141e5d2888a3e7579d77c92be395a36bd5fb1ebe3f2e5."
  - "Occurrence-level metric overrides are copied into dedicated authoritative owned occurrence, target, warm-up, policy, and immutable source-map tables instead of mutating bundled exercise identities."
  - "Existing copies require explicit create_another or reactivate_existing intent; initial activation persists an explicit initial receipt choice, and reactivation appends a new immutable effective schedule version."
  - "Retained legacy schedule rows are bridged into the 0008 source schema, while a legacy active plan without a schedule is explicitly deactivated by the first valid activation."

patterns-established:
  - "Activation boundary: exact accepted bytes -> complete semantic parse -> confirmation-bound canonical request hash -> one FIFO transaction -> committed read model."
  - "Ownership boundary: every copied day and occurrence has immutable source attribution while all editable IDs are fresh and independent."
  - "Schedule boundary: one active plan and one active owned schedule are enforced by partial unique indexes; versions, bindings, events, and consumed facts remain immutable."
  - "Compatibility boundary: Phase 1 activation remains available through legacy-last overload ordering and public scheduling/metric domain barrels."

requirements-completed: [LIB-07, LIB-09]

coverage:
  - id: D1
    description: "Migration 0008 takes the retained version 6 database forward without mutating existing plan, target, or policy bytes and enforces one active plan/schedule plus immutable terminal schedule facts."
    requirement: LIB-09
    verification:
      - kind: integration
        ref: "tests/sqlite-host/schedule-activation.test.ts#schedule activation migration"
        status: pass
      - kind: other
        ref: "npm run test:sqlite:host -- --runInBand tests/sqlite-host/schedule-activation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every accepted starter activation clones the complete editable graph into fresh owned IDs or explicitly reactivates the selected copy while preserving the prior plan and schedule."
    requirement: LIB-07
    verification:
      - kind: integration
        ref: "tests/integration/starter-activation-repository.test.ts#accepted starter activation repository"
        status: pass
      - kind: unit
        ref: "src/domains/plans/activateStarterPlan.test.ts#accepted starter activation boundary"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gym Body-Part Split clones Chest, Back, Shoulders, Legs, and Arms on Monday through Friday with exactly 20 unique weighted load/reps occurrences, no bodyweight occurrence, and no substitution."
    requirement: LIB-07
    verification:
      - kind: integration
        ref: "tests/integration/starter-activation-repository.test.ts#proves D-55 clones five ordered weekday days and 20 weighted occurrences"
        status: pass
      - kind: other
        ref: "final D-55 accepted-byte assertion"
        status: pass
    human_judgment: false
  - id: D4
    description: "Activation rejects missing copy choice, active workouts, stale revisions, changed request identity, unavailable references, malformed receipts, and partial clone failures before acknowledgement."
    requirement: LIB-09
    verification:
      - kind: integration
        ref: "tests/integration/starter-activation-repository.test.ts#conflict, tampering, and rollback cases"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false

duration: 54 min
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 08: Accepted Starter Activation and Schedule Source Summary

**Hash-bound six-template activation with complete fresh owned graphs, effective-dated Weekday/Rotation schedules, explicit reactivation choices, and exact D-55 5-day/20-occurrence proof**

## Performance

- **Duration:** 54 min
- **Started:** 2026-08-18T04:33:48Z
- **Completed:** 2026-08-18T05:27:15Z
- **Tasks:** 2
- **Tracked implementation files changed:** 12
- **Implementation commits:** 4
- **Merged coverage run:** 968 tests passed
- **Integrity-critical gate:** 40 files at 100% statements, branches, functions, and lines

## Accomplishments

- Added additive migration 0008 with immutable accepted-template/source maps, authoritative owned occurrences/targets/warm-ups/policies, effective schedule versions and bindings, overrides, opportunities, append-only events, and canonical activation receipts.
- Added strict exact-byte/semantic parsing for six accepted starter templates, confirmation tokens bound to all editable preview decisions, canonical request SHA-256 identities, and backward-compatible Phase 1 activation overloads.
- Implemented one-transaction fresh-copy and explicit reactivation flows with exact catalog-reference validation, active-workout blocking, optimistic active/selected-copy revisions, idempotent replay, full rollback, prior-plan/schedule preservation, and post-commit invalidation scopes.
- Proved D-55 exactly: Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, Friday Arms; four unique weighted `load_reps` occurrences per day; 20 total; zero bodyweight occurrences; zero substitutions; zero omissions.
- Kept `src/platform/sqlite/migrations/index.ts`, the accepted starter asset/decision bytes, and `.gsd/dispatch-isolation-sentinel.json` unchanged.

## Task Commits

1. **Task 1 RED:** `8c72212` — failing retained-v6, fresh-owned tracer, one-active, and immutable schedule-fact contracts.
2. **Task 1 GREEN:** `d56909e` — initial activation validator, migration 0008, portable retained-v6 fixture, and host tracer.
3. **Task 2 RED:** `fe2b0d7` — failing exact-byte activation, six-template graph, D-55, choice, revision, rollback, and source-independence contracts.
4. **Task 2 GREEN:** `639271b` — exact accepted parser, atomic clone/reactivate repository, retained compatibility, and permanent integrity coverage.

## Files Created/Modified

- `src/domains/scheduling/activation.ts` — validated editable initial Weekday/Rotation schedule input with LocalDate/timezone and binding invariants.
- `src/domains/scheduling/index.ts` — public scheduling boundary for cross-domain activation consumers.
- `src/platform/sqlite/migrations/0008_schedule_activation.ts` — authoritative source attribution, owned graph, one-active schedule/version/binding/override/opportunity/event schema and immutability triggers.
- `tests/migrations/fixtures/v6-metric-profiles.sql` — portable immutable post-0006 fixture with FTS reconstructed through public virtual-table DDL.
- `tests/sqlite-host/schedule-activation.test.ts` — retained migration, one-day tracer, one-active enforcement, and immutable terminal-fact proof.
- `src/domains/plans/activateStarterPlan.ts` — exact accepted-pack parser, confirmation token, canonical request digest, and backward-compatible activation command.
- `src/domains/plans/activateStarterPlan.test.ts` — exact hash, semantic corruption, confirmation, revision, day-binding, and digest-port tests.
- `src/platform/sqlite/repositories/starterPlanRepository.ts` — FIFO transaction for complete fresh clones, explicit reactivation, conflicts, receipts, source maps, events, and committed results.
- `tests/integration/starter-activation-repository.test.ts` — all six templates, D-55, fresh IDs, copy choices, active workout, revisions, replay, rollback, source independence, and tampering topology.
- `scripts/run-coverage-gate.mjs` — permanent 100% all-metrics enforcement for the four new integrity-critical modules.
- `src/domains/metrics/index.ts`, `src/domains/plans/index.ts` — public domain contracts required by boundary lint and downstream consumers.

## Decisions Made

- The Phase 2 owned occurrence graph is authoritative for all accepted metric identities and occurrence-level overrides. The released 0006 composite workout tables are not mutated to masquerade a bundled exercise as a different profile.
- Source template JSON, day IDs, occurrence IDs, catalog identities, metric overrides, and content rationale are immutable attribution facts; edited owned rows remain independent.
- Activation request identity is the canonical SHA-256 of request ID, timestamp, expected active revision, exact accepted asset identity, template/revision, schedule preview, and copy choice.
- First activation accepts no copy choice and persists `initial`; existing copies require `create_another` or `reactivate_existing`, including selected plan/schedule expected revisions.
- Reusing a preserved schedule across reactivation is valid and creates a new immutable effective version; activation receipts therefore do not require globally unique schedule IDs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the generated retained-v6 fixture portable**
- **Found during:** Task 1 GREEN host execution.
- **Issue:** SQLite `.dump` emitted `writable_schema` statements for FTS shadow internals, which Node's defensive SQLite adapter rejects.
- **Fix:** Preserved the real post-0006 schema/data while reconstructing FTS through normal `CREATE VIRTUAL TABLE ... fts5` and `rebuild` statements, then added `PRAGMA user_version = 6`.
- **Files modified:** `tests/migrations/fixtures/v6-metric-profiles.sql`
- **Verification:** Fixture imports under both SQLite CLI and Node adapter; integrity check, FTS docsize count, retained migration tests, and full host suite pass.
- **Committed in:** `d56909e`

**2. [Rule 1 - Bug] Corrected activation receipt lifecycle constraints**
- **Found during:** Task 2 first-activation and reactivation tests.
- **Issue:** The initial schema allowed only repeat-copy choices and made result schedule IDs unique, preventing first activation and multiple immutable receipts for one preserved reactivated schedule.
- **Fix:** Added explicit `initial` receipt choice, retained selected-plan checks, removed global schedule-result uniqueness, and kept request ID as the idempotency key.
- **Files modified:** `src/platform/sqlite/migrations/0008_schedule_activation.ts`, `tests/integration/starter-activation-repository.test.ts`
- **Verification:** First activation, create another, reactivation, exact replay, changed request identity, and receipt tampering tests pass.
- **Committed in:** `639271b`

**3. [Rule 2 - Missing Critical Functionality] Preserved complete accepted occurrence attribution and metric overrides**
- **Found during:** Task 2 graph mapping.
- **Issue:** Plan-level template JSON alone could not safely map edited owned days/occurrences back to accepted source IDs, and 0006's composite identity FK cannot represent the five accepted occurrence-level metric overrides without mutating bundled exercise identity.
- **Fix:** Added immutable day/occurrence source maps plus authoritative owned occurrence, warm-up, target, and policy tables with complete metric identity and override metadata.
- **Files modified:** `src/platform/sqlite/migrations/0008_schedule_activation.ts`, `src/platform/sqlite/repositories/starterPlanRepository.ts`, focused tests
- **Verification:** All six complete graph-count cases, five accepted overrides, source-independence tests, and D-55 fresh-ID checks pass.
- **Committed in:** `639271b`

**4. [Rule 2 - Missing Critical Functionality] Bridged retained legacy schedule facts and orphan active plans**
- **Found during:** Task 2 retained-v6 activation.
- **Issue:** Retained databases may have legacy schedule rows or an active copied plan without a schedule, which could bypass joined active-state classification or block the new one-active index.
- **Fix:** Migration 0008 imports legacy schedules/versions/bindings; repository active-state classification reads active plans independently and explicitly deactivates the allowed legacy orphan on first activation while rejecting inconsistent topologies.
- **Files modified:** `src/platform/sqlite/migrations/0008_schedule_activation.ts`, `src/platform/sqlite/repositories/starterPlanRepository.ts`, integration tests
- **Verification:** Retained migration, orphan first activation, mismatched topology, no-active state, and one-active partial-index tests pass.
- **Committed in:** `639271b`

**5. [Rule 3 - Blocking] Preserved Phase 1 caller and boundary compatibility**
- **Found during:** Task 2 unit/type/boundary verification.
- **Issue:** Accepted policy IDs use dotted namespaces, direct scheduling-internal imports violate domain boundaries, and `ReturnType<typeof activateStarterPlan>` selects the final overload signature.
- **Fix:** Accepted dotted policy IDs, added public scheduling/metric barrels, and ordered overloads with the legacy signature last while retaining accepted-call inference.
- **Files modified:** `src/domains/plans/activateStarterPlan.ts`, `src/domains/scheduling/index.ts`, `src/domains/metrics/index.ts`, `src/domains/plans/index.ts`
- **Verification:** Accepted parser suite, Phase 1 integration tracer, benchmark typecheck, and boundary lint pass.
- **Committed in:** `639271b`

**6. [Rule 2 - Missing Critical Verification] Enforced complete coverage permanently**
- **Found during:** Task 2 project-rule verification.
- **Issue:** New integrity-critical activation modules were not yet enrolled in the repository's permanent all-metrics gate.
- **Fix:** Added activation command, initial validator, migration 0008, and starter repository to `integrityCriticalFiles`; added semantic corruption and repository-topology tests until all four reached 100% statements, branches, functions, and lines.
- **Files modified:** `scripts/run-coverage-gate.mjs`, activation unit/host/integration tests
- **Verification:** `npm run test:coverage -- --runInBand` passes 968 tests and 40 integrity-critical files at 100% all metrics.
- **Committed in:** `639271b`

---

**Total deviations:** 6 auto-fixed (2 Rule 1/3 bugs or blockers, 4 Rule 2/3 correctness and verification requirements)
**Impact on plan:** Every change closes a correctness, persistence, compatibility, or continuous-verification gap required by the locked activation contract. No package, UI, network, authentication, accepted-content, or runtime-manifest scope was added.

## TDD Gate Compliance

- Task 1 RED `8c72212` failed because `src/domains/scheduling/activation.ts` and migration 0008 did not exist.
- Task 1 GREEN `d56909e` passed the exact host command at 100% all metrics, then passed the mandatory tracer feedback gate from committed HEAD.
- Task 2 RED `fe2b0d7` failed on missing accepted activation exports and missing `starterPlanRepository`.
- Task 2 GREEN `639271b` passed all six templates, lifecycle/conflict cases, D-55, broad regressions, and merged coverage.
- No refactor-only commit was required.

## Issues Encountered

- The retained v6 fixture intentionally contains a legacy active `plan-copy` without `plan_schedules`; active plan and active schedule classification therefore cannot rely on an inner join.
- The shell repeatedly emitted the pre-existing non-fatal `compdef:153: _comps: assignment to invalid subscript range` message; every invoked command returned its own test/type/lint status independently.
- `gsd-tools windows list` produced no stdout under one redirected invocation, but `.planning/WINDOWS.md` remained authoritative and now records `open_count: 0`.

## Known Stubs

None. Changed production files contain no TODO/FIXME, placeholder product data, hardcoded UI-empty state, skipped tests, or incomplete repository paths. SQL `placeholders` are bound query markers, not product stubs.

## Threat Model Verification

- **T-02-01 accepted starter tampering:** exact asset and acceptance-file SHA-256 values are recomputed, then all envelope/count/reference/metric/override/D-55 semantics are parsed before repository entry.
- **T-02-03 bundled/owned boundary:** every owned plan/day/occurrence/target/warm-up/policy ID is fresh; immutable source maps retain accepted identity; source/template tables cannot be updated or deleted; bundled exercise rows are never written.
- **T-02-04 stale/repeated activation:** canonical request digest, request-id receipt, expected active schedule revision, selected plan/schedule revisions, one-active indexes, and one serialized transaction reject stale or changed replays.
- **T-02-05 silent schedule mutation:** date, timezone, mode, bindings, and copy choice are confirmation-bound; versions/bindings/events/consumed facts are immutable; prior plans and schedules remain inactive rather than reset or archived.
- No new network endpoint, authentication path, external file access path, dependency, or logging of workout observations was introduced.

## Authentication Gates

None.

## User Setup Required

None - no package installation, credentials, external services, runtime network access, or manual migration registration required.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/schedule-activation.test.ts` — PASS, 13 tests.
- `npm run test:integration -- --runInBand tests/integration/starter-activation-repository.test.ts` — PASS, 21 tests.
- `npm run test:unit -- --runInBand` — PASS, 579 tests.
- `npm run test:components -- --runInBand` — PASS, 89 tests.
- `npm run test:sqlite:host -- --runInBand` — PASS, 182 tests.
- `npm run test:integration -- --runInBand` — PASS, 118 tests.
- `npm run typecheck` — PASS.
- `npm run lint` and `npm run check:boundaries` — PASS across 108 source files.
- `npm run test:coverage -- --runInBand` — PASS, 968 tests; 40 integrity-critical files at 100% statements, branches, functions, and lines.
- Final D-55 accepted-byte assertion — PASS: five ordered weekday days, four occurrences each, 20 unique IDs, all `load_reps`, zero bodyweight, zero substitutions.
- Protected-file hashes — PASS: `migrations/index.ts`, accepted starter asset/decision, and `.gsd/dispatch-isolation-sentinel.json` unchanged.
- Commit trailers and deletion check — PASS: all four task commits contain the required TRAE trailer exactly once and delete no tracked files.
- Broken-windows ledger — PASS: 0 open, 22 fixed entries.

## Next Phase Readiness

- Library and schedule UI can call a strict command that returns only committed owned plan/schedule read models and exact invalidation scopes.
- Later plan/schedule commands can build on effective versions, immutable source maps, explicit overrides/opportunities/events, and accepted metric-override ownership.
- Plan 02-11 must register migration 0008 in the final ordered runtime manifest and run packaged migration/native evidence after all Phase 2 migration modules exist.
- No blockers, stubs, skipped tests, open broken-window entries, unrun verification, or unresolved threat flags remain.

## Self-Check: PASSED

- All eight plan deliverable files plus the public barrels and coverage-gate update exist.
- Task commits `8c72212`, `d56909e`, `fe2b0d7`, and `639271b` exist and contain the required TRAE CLI trailer exactly once.
- Exact task commands, broad regressions, the merged coverage gate, D-55 assertion, and protected-file checks passed from committed HEAD.
- Summary validation passed; `.planning/WINDOWS.md` reports zero open entries.
- `src/platform/sqlite/migrations/index.ts` and `.gsd/dispatch-isolation-sentinel.json` remain byte-identical to their execution-start hashes.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
