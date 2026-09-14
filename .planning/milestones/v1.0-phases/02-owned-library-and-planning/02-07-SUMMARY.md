---
phase: 02-owned-library-and-planning
plan: 07
subsystem: database
tags: [sqlite, metrics, migration, idempotency, immutable-history, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Complete nine-profile metric registry, retained content-library schema, and direct-imported FTS migration 0005
  - phase: 01-trustworthy-workout-loop
    provides: Private FIFO BEGIN IMMEDIATE writer, released workout snapshot graph, expected revisions, and recovery-backup seam
provides:
  - Registry-digest-bound owner approval for the one-way D-34 through D-39 migration contract
  - Destructive migration 0006 with complete metric identities on future targets, policies, snapshots, observations, and recommendations
  - Retained v5 fixture plus direct v0-v5 upgrade proof with exact legacy JSON and timed-hold seconds preservation
  - Atomic custom-exercise profile migration with complete replacement maps, expected revisions, invalidations, exact idempotent replay, and fresh baselines
  - Complete-identity comparable-history reads and 100 percent integrity-critical coverage
affects: [custom-exercises, plan-targets, progression, workout-history, migration-manifest, plan-02-11]

actuals:
  tokens: 31222
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - Complete persisted metric identity is profile plus contract version plus exercise metric generation
    - Released strict tables widen through validated destructive forward copy with recovery backup
    - Idempotent one-way commands bind the key to canonical validated request and committed ID-only result bytes
    - Incompatible policies remain immutable invalidated records while one new active policy is installed

key-files:
  created:
    - artifacts/review/phase2/metric-migration-decision.json
    - src/domains/metrics/migrateCustomExerciseMetricProfile.ts
    - src/platform/sqlite/migrations/0006_metric_profiles.ts
    - src/platform/sqlite/repositories/metricRepository.ts
    - tests/integration/metric-profile-migration.test.ts
    - tests/migrations/fixtures/v5-search-fts.sql
    - tests/sqlite-host/metric-profiles.test.ts
  modified:
    - scripts/run-coverage-gate.mjs
    - src/domains/metrics/migrateCustomExerciseMetricProfile.test.ts

key-decisions:
  - "The owner approved D-34 through D-39 as a one-way future-only migration bound to metric registry SHA-256 ea8cca49791400150c41f32511d88ce79e7191b70d81c437494b93726b1e3037."
  - "Migration 0006 assigns deterministic legacy contract version 1 and metric generation 1 while preserving every released target, snapshot, observation, and undo JSON byte; src/platform/sqlite/migrations/index.ts remains owned by Plan 02-11."
  - "A profile migration requires exact target and policy occurrence sets, expected exercise/target/policy revisions, no active workout use, and a true immutable-history acknowledgement."
  - "Idempotent replay requires the same canonical validated request, returns only committed IDs/count-derived state, and never increments the metric generation twice."
  - "Pending recommendations and queued recommendation-regeneration effects are invalidated or superseded in the same transaction, and a fresh generation baseline begins with no cross-profile history inference."

patterns-established:
  - "Metric migration schema pattern: widen source, future-target, policy, snapshot, set, and recommendation rows together, then enforce registry-supported profile/version pairs and complete identity foreign keys."
  - "Future-only migration pattern: classify all conflicts before writes, replace every future contract atomically, preserve old policy evidence as invalidated, and commit one request/result audit event."
  - "History pattern: query completed comparable working sets only by exact exercise ID, profile, contract version, and metric generation."

requirements-completed: [LIB-11, LIB-12]

coverage:
  - id: D1
    description: "Migration 0006 upgrades retained v0 through v5 databases, persists every registered metric identity, and preserves legacy load/reps and timed-hold V1 bytes without reinterpretation."
    requirement: LIB-11
    verification:
      - kind: integration
        ref: "tests/sqlite-host/metric-profiles.test.ts#metric profile persistence migration"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false
  - id: D2
    description: "The D-34 command accepts only custom exercises with complete owner-entered replacements and explicit policy decisions, then migrates all future contracts or none."
    requirement: LIB-12
    verification:
      - kind: unit
        ref: "src/domains/metrics/migrateCustomExerciseMetricProfile.test.ts#D-34 through D-39 metric profile migration command"
        status: pass
      - kind: integration
        ref: "tests/integration/metric-profile-migration.test.ts#atomic D-34 future-target profile migration"
        status: pass
    human_judgment: false
  - id: D3
    description: "Completed and in-progress snapshots remain immutable, incompatible progression is invalidated atomically, idempotent retries are exact, and history is segmented by complete identity."
    requirement: LIB-11
    verification:
      - kind: integration
        ref: "tests/integration/metric-profile-migration.test.ts#history preservation, rollback, idempotency, and comparable history"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run lint && npm run check:boundaries"
        status: pass
    human_judgment: false

duration: 40 min
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 07: Metric Profile Persistence and Migration Summary

**Versioned nine-profile SQLite persistence with an owner-approved, atomic future-target migration that preserves all historical workout bytes**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-18T03:46:38Z
- **Completed:** 2026-08-18T04:25:54Z
- **Tasks:** 3
- **Tracked implementation files changed:** 9
- **Implementation commits:** 5
- **Merged coverage run:** 918 tests passed
- **Integrity-critical gate:** 36 files at 100% statements, branches, functions, and lines

## Accomplishments

- Recorded owner response `approve-d34` and bound D-34 through D-39 to the exact current metric-registry digest.
- Added migration 0006 as the destructive direct successor of 0005 for focused contracts, while leaving the runtime migration manifest unchanged for Plan 02-11.
- Migrated retained v0 through v5 fixtures and proved every legacy target, session exercise, set, observation, and undo field remains byte-equivalent except for deterministic identity columns.
- Persisted all nine profile names and all ten registered profile/version contracts, including timed-hold V1 seconds and V2 milliseconds, with exact safe-integer boundaries.
- Added an explicit command and repository transaction that rejects bundled exercises, active use, stale revisions, incomplete replacement maps, invalid policy decisions, and idempotency-key payload conflicts.
- Invalidated incompatible recommendations and policies, superseded queued recommendation work, established a fresh baseline, and returned only stable IDs and committed state after commit.

## Task Commits

1. **Task 1: Approve D-34 one-way migration contract** — `2bbb2d5`
2. **Task 2 RED: Retained metric persistence contracts** — `3b82a63`
3. **Task 2 GREEN: Complete metric identity persistence** — `edb3af7`
4. **Task 3 RED: D-34 through D-39 command contracts** — `d804eac`
5. **Task 3 GREEN: Atomic custom metric-profile migration** — `5e56c41`

## Files Created/Modified

- `artifacts/review/phase2/metric-migration-decision.json` — exact owner approval, decision set, registry digest, immutable-history contract, and one-way undo cost.
- `src/platform/sqlite/migrations/0006_metric_profiles.ts` — destructive forward copy, complete identity columns, policy invalidation state, baseline/event tables, and fail-closed verification.
- `tests/migrations/fixtures/v5-search-fts.sql` — retained post-0005 fixture with timed-hold V1 seconds in a future target and completed observation.
- `tests/sqlite-host/metric-profiles.test.ts` — retained v0-v5 upgrades, exact legacy rows, every registry identity, verifier failures, and E-64 through E-78 persistence.
- `src/domains/metrics/migrateCustomExerciseMetricProfile.ts` — strict command boundary for explicit replacements, units/defaults, policy decisions, acknowledgement, generation, and idempotency.
- `src/platform/sqlite/repositories/metricRepository.ts` — complete pre-write classification, one FIFO transaction, exact invalidations, baseline/event persistence, and complete-identity history reads.
- `tests/integration/metric-profile-migration.test.ts` — atomic success, stale/repeated calls, active-use and bundled blocking, rollback, history immutability, queued-effect invalidation, and fresh-baseline proof.
- `scripts/run-coverage-gate.mjs` — permanent complete coverage enforcement for migration 0006, the command, and the metric repository.

## Decisions Made

- Legacy rows use deterministic complete identity `(existing profile, contractVersion 1, generation 1)` and retain their existing JSON strings unchanged.
- Future target and occurrence rows use composite identity foreign keys so a partial target/occurrence migration cannot commit.
- Invalidated policies retain their old identity and rule bytes as audit facts; a separate partial unique index enforces one active policy per occurrence and policy type.
- Migration events store canonical validated request bytes and committed result bytes so an idempotency key cannot be replayed with a different replacement contract.
- Comparable history excludes partial exercise exposures and filters by complete identity; a new generation therefore starts with an empty baseline without reinterpreting old observations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Bound idempotency to the complete validated request and superseded queued recommendation work**
- **Found during:** Task 3 threat/deviation pass
- **Issue:** Replaying only by idempotency key could accept a different replacement payload, and already queued recommendation effects could regenerate old-profile work after a successful migration.
- **Fix:** Persist canonical request bytes beside the committed result, reject mismatched key reuse, and supersede pending/processing recommendation effects that reference the migrated exercise in the same transaction.
- **Files modified:** `src/platform/sqlite/migrations/0006_metric_profiles.ts`, `src/platform/sqlite/repositories/metricRepository.ts`, `tests/integration/metric-profile-migration.test.ts`
- **Verification:** Exact replay, mismatched replay, queued-effect invalidation, commit rollback, and merged coverage tests pass.
- **Committed in:** `5e56c41`

**2. [Rule 2 - Missing Critical] Enforced complete coverage for all new integrity-critical modules**
- **Found during:** Task 3 pre-commit project-rule check
- **Issue:** The existing explicit coverage list did not yet include migration 0006, the D-34 command, or the metric repository.
- **Fix:** Added all three modules and closed every statement, branch, function, and line gap with focused unit, host, and integration tests.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `src/domains/metrics/migrateCustomExerciseMetricProfile.test.ts`, `tests/sqlite-host/metric-profiles.test.ts`, `tests/integration/metric-profile-migration.test.ts`
- **Verification:** `npm run test:coverage -- --runInBand` passes 918 tests with 36 integrity-critical files at 100% all metrics.
- **Committed in:** `5e56c41`

---

**Total deviations:** 2 auto-fixed Rule 2 missing critical controls
**Impact on plan:** Both additions close correctness gaps required by the approved atomic/idempotent contract and project coverage rules. No package, runtime manifest, UI, network, authentication, or cross-profile inference scope was added.

## Issues Encountered

- SQLite `ON DELETE RESTRICT` fires immediately even when foreign keys are deferred, so migration 0006 uses the planned full dependency-ordered forward-copy rebuild instead of dropping referenced parents in isolation.
- The shell emitted a recurring non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands; it did not affect tests, commits, or artifacts.
- The pre-existing untracked `.gsd/dispatch-isolation-sentinel.json` was left byte-identical and unstaged.

## Known Stubs

None. The changed files contain no TODO/FIXME, skipped tests, placeholder product data, or incomplete persistence paths.

## Threat Review

- T-02-03: Both legacy and library origins must be `custom`; bundled exercises fail before writes.
- T-02-04: Exercise, target, and existing policy revisions plus exact occurrence/target sets are classified before one serialized transaction.
- T-02-05: Released JSON bytes remain unchanged, history reads require complete identity, and no conversion or profile-only aggregation exists.
- T-02-07: Results and conflicts expose stable codes, IDs, counts, revisions, and baseline state only; replacement values and observations are not logged.
- No unplanned network, authentication, external file access, or trust-boundary surface was introduced.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/metric-profiles.test.ts` — PASS, 22 tests.
- `npm run test:integration -- --runInBand tests/integration/metric-profile-migration.test.ts` — PASS, 16 tests.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm run check:boundaries` — PASS.
- `npm run test:coverage -- --runInBand` — PASS, 918 tests; 36 integrity-critical files at 100% statements, branches, functions, and lines.
- Registry/artifact/approved SHA-256 equality — PASS at `ea8cca49791400150c41f32511d88ce79e7191b70d81c437494b93726b1e3037`.
- `src/platform/sqlite/migrations/index.ts` — unchanged; final manifest remains Plan 02-11 scope.
- All five implementation commits exist, delete no tracked files, and contain the required TRAE CLI trailer exactly once.

## User Setup Required

None - no package installation, credentials, external service, or manual device action is required.

## Next Phase Readiness

- Custom exercise and plan UI work may call the strict D-34 command and render its stable conflict/result contract without implementing conversions.
- Workout/history adapters can consume complete persisted identity and generation-segmented comparable history.
- Plan 02-11 must add migration 0006 to the final ordered runtime manifest and run the phase-level packaged migration evidence.
- No blockers remain for dependent Phase 2 plans.

## Self-Check: PASSED

- All nine tracked implementation artifacts and this summary exist.
- Commits `2bbb2d5`, `3b82a63`, `edb3af7`, `d804eac`, and `5e56c41` exist and carry the required trailer exactly once.
- Registry and approval artifact remain bound to SHA-256 `ea8cca49791400150c41f32511d88ce79e7191b70d81c437494b93726b1e3037`.
- `src/platform/sqlite/migrations/index.ts` and `.gsd/dispatch-isolation-sentinel.json` remain unchanged.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
