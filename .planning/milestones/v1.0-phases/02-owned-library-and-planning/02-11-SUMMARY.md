---
phase: 02-owned-library-and-planning
plan: 11
subsystem: database
tags: [sqlite, owned-plans, aggregates, idempotency, optimistic-revisions, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Metric-profile-complete owned occurrence, target, warm-up, and progression-policy tables from Plans 02-06 and 02-07
  - phase: 02-owned-library-and-planning
    provides: Accepted starter activation, source attribution, and effective schedule tables from Plan 02-08
provides:
  - Final ordered runtime migration manifest through 0009 with validated recovery backup before destructive 0006
  - Explicit inactive Unicode plan drafts with one named empty day and the exact missing-valid-target scheduling blocker
  - Atomic create, Save, reorder, duplicate, archive, and restore commands with durable request receipts and optimistic revisions
  - Full-graph fresh-ID duplication with inactive schedule defaults, preserved active schedules, immutable workout snapshots, and no permanent deletion
  - Executable E-47 through E-52 and D-21 through D-31 aggregate, replay, conflict, rollback, impact, and lifecycle proof
affects: [plan-editor, library-plans-ui, schedule-impact-review, workout-snapshots, phase2-runtime-composition]

actuals:
  tokens: 75420
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Complete owned-plan drafts cross the domain boundary and commit under one expected revision in the private serialized writer
    - Durable request SHA-256 receipts reconstruct exact replay after repository recreation and reject changed request identity
    - Structural identity changes return requires_schedule_impact before writes; ordinary values and reorders preserve IDs and commit atomically
    - SQLite triggers prohibit permanent deletion of owned plans, days, occurrences, warm-ups, targets, policies, and mutation receipts

key-files:
  created:
    - src/domains/plans/ownedPlanCommands.ts
    - src/platform/sqlite/migrations/0009_owned_plans.ts
    - src/platform/sqlite/repositories/ownedPlanRepository.ts
    - tests/integration/owned-plan-crud.test.ts
    - tests/migrations/fixtures/v8-schedule-activation.sql
    - tests/sqlite-host/owned-plans.test.ts
  modified:
    - scripts/run-coverage-gate.mjs
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutAppRuntime.test.tsx
    - src/domains/plans/index.ts
    - src/domains/plans/ownedPlanCommands.test.ts
    - src/platform/sqlite/migrations/index.ts
    - tests/sqlite-host/migrations-effects.test.ts

key-decisions:
  - "Migration 0009 is additive over released 0008 and src/platform/sqlite/migrations/index.ts now registers exactly 0001, 0002, 0003, 0004, 0005, 0006, 0008, and 0009."
  - "Create permits one named empty inactive day with the literal blocker Add at least one exercise with valid targets before scheduling or activating."
  - "After the initial empty draft, any day, occurrence, warm-up, target, or policy identity-set change returns requires_schedule_impact instead of deleting or silently restructuring source facts."
  - "Reorder and field/target edits retain aggregate identities, use temporary in-transaction ordinals to avoid uniqueness collisions, and acknowledge only after commit."
  - "Duplication copies the complete editable graph and latest schedule defaults into deterministic fresh IDs; the copied plan and schedule remain inactive."
  - "Production startup uses the existing Expo SQLite recovery-backup adapter before destructive migration 0006 now that the final runtime manifest is registered."

patterns-established:
  - "Aggregate boundary: validate complete graph -> canonical SHA-256 request -> one FIFO transaction -> durable receipt -> post-commit invalidations."
  - "Impact boundary: compare complete graph identity topology before mutation; changed topology is delegated to Plan 02-18 through requires_schedule_impact."
  - "Snapshot boundary: in-progress session rows are never rewritten; successful future-facing edits return Current workout is unaffected semantics."
  - "Integrity pattern: owned-plan commands, migration 0009, and repository are permanently enforced at 100 percent statements, branches, functions, and lines."

requirements-completed: [LIB-08]

coverage:
  - id: D1
    description: "E-47 through E-52 execute retained-v8 migration, identity adjacency, Unicode empty draft, stable order, durable request replay, serialized revision conflict, rollback, and no-delete contracts."
    requirement: LIB-08
    verification:
      - kind: integration
        ref: "tests/sqlite-host/owned-plans.test.ts#owned-plan migration"
        status: pass
      - kind: other
        ref: "npm run test:sqlite:host -- --runInBand tests/sqlite-host/owned-plans.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-21 through D-25 create an explicit inactive draft and persist complete names, targets, values, and stable reorder state only through aggregate Save."
    requirement: LIB-08
    verification:
      - kind: unit
        ref: "src/domains/plans/ownedPlanCommands.test.ts#D-21 through D-25 owned-plan aggregate commands"
        status: pass
      - kind: integration
        ref: "tests/integration/owned-plan-crud.test.ts#owned-plan CRUD repository"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-26 through D-31 duplicate the full graph into fresh inactive IDs, archive and restore reversibly, surface structural impact, preserve the active schedule, and leave in-progress workout snapshots unchanged."
    requirement: LIB-08
    verification:
      - kind: integration
        ref: "tests/integration/owned-plan-crud.test.ts#D-26 through D-31 cases"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false

duration: 42 min
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 11: Owned Plan Aggregate Summary

**Revisioned owned-plan aggregates with explicit inactive drafts, atomic complete-graph Save, durable replay, fresh-ID duplication, reversible lifecycle, and schedule/snapshot-safe structural impact**

## Performance

- **Duration:** 42 min
- **Started:** 2026-08-18T07:13:38Z
- **Completed:** 2026-08-18T07:55:26Z
- **Tasks:** 2
- **Tracked files changed:** 13
- **Implementation commits:** 4
- **Focused owned-plan contracts:** 54 passed in the final diagnostic run
- **Merged gate:** 1,170 tests passed across 59 suites
- **Integrity-critical gate:** 47 files at 100% statements, branches, functions, and lines

## Accomplishments

- Registered the final released runtime migration manifest in order through 0009 and wired production startup to create and validate a local Expo SQLite recovery backup before destructive migration 0006.
- Added additive migration 0009 with owned aggregate lifecycle/eligibility state, immutable durable mutation receipts, owned-origin guards, and no-permanent-delete triggers across every owned graph layer.
- Added explicit `Create my own` draft creation with Unicode-safe names, one named empty day, inactive state, `Draft` eligibility, and the exact missing-valid-target requirement.
- Added complete aggregate Save with expected revision, stable ordinals, target/units/policy validation, durable request replay, serialized conflicts, commit rollback, and post-commit-only invalidation.
- Added full-graph duplication with fresh plan/day/occurrence/warm-up/target/policy IDs and cloned latest schedule defaults under an inactive schedule.
- Added reversible archive/restore without deletion and structural-impact refusal that preserves active schedules, source-linked graph topology, and immutable in-progress session snapshots.
- Proved malformed committed JSON/receipts, stale/not-found writes, active archive, schedule-without-version, cross-plan binding corruption, request identity drift, and commit failure all fail closed.

## Task Commits

1. **Task 1 RED: Retained-v8 owned-plan migration contracts** — `f0a4e37`
2. **Task 1 GREEN: Revisioned owned-plan migration and final manifest** — `0685923`
3. **Task 2 RED: D-21 through D-31 aggregate command/repository contracts** — `76635fc`
4. **Task 2 GREEN: Atomic CRUD, duplication, lifecycle, impact, and recovery integration** — `6e271cf`

## Files Created/Modified

- `src/platform/sqlite/migrations/0009_owned_plans.ts` — lifecycle/eligibility states, immutable request receipts, ownership validation, and no-delete triggers.
- `src/platform/sqlite/migrations/index.ts` — sole final ordered runtime manifest for released versions 0001-0006, 0008, and 0009.
- `tests/migrations/fixtures/v8-schedule-activation.sql` — immutable retained post-0008 active schedule and valid owned-graph fixture.
- `tests/sqlite-host/owned-plans.test.ts` — E-47 through E-52 migration, Unicode draft, ordering, replay, conflict, rollback, and no-delete proof.
- `src/domains/plans/ownedPlanCommands.ts` — complete graph validation, canonical request hashing, noun-specific create/Save/duplicate/archive/restore commands, and post-commit invalidations.
- `src/domains/plans/ownedPlanCommands.test.ts` — D-21 through D-31 validation, dirty-state, explicit Save, lifecycle, impact, and edge-case command contracts.
- `src/platform/sqlite/repositories/ownedPlanRepository.ts` — serialized expected-revision aggregate persistence, durable replay, fresh-ID duplication, inactive schedule cloning, and impact classification.
- `tests/integration/owned-plan-crud.test.ts` — atomic CRUD, reorder, fresh IDs, lifecycle, schedule/snapshot preservation, durable replay, concurrency, corruption, and rollback proof.
- `src/bootstrap/workoutAppRuntime.tsx` — validated Expo SQLite recovery backup for the now-registered destructive migration.
- `tests/sqlite-host/migrations-effects.test.ts`, `src/bootstrap/workoutAppRuntime.test.tsx` — final-manifest integration and current-schema startup proof.
- `src/domains/plans/index.ts`, `scripts/run-coverage-gate.mjs` — public commands and permanent three-module integrity coverage.

## Decisions Made

- Migration 0009 does not edit any released migration body. It adds only lifecycle/receipt/delete-protection facts over the existing 0006/0008 authoritative owned graph.
- The exact draft blocker is stored as a stable code plus the literal message `Add at least one exercise with valid targets before scheduling or activating.` so UI and diagnostics do not infer eligibility.
- A complete graph identity topology becomes immutable after the initial empty draft in this slice. Name, value, target, policy payload, rest, and reorder changes remain ordinary Save; adding/removing/reparenting identities returns `requires_schedule_impact` for Plan 02-18.
- Durable idempotency uses canonical request SHA-256 plus committed result JSON in SQLite. Repository recreation returns `already_committed` only for byte-equivalent request identity.
- Runtime startup now supplies the existing validated recovery-backup port because the final manifest includes destructive 0006. Historical Phase 1 tests keep a frozen three-migration fixture manifest while separately asserting current runtime order.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended no-permanent-delete enforcement to every owned graph layer**
- **Found during:** Task 2 project-rule review.
- **Issue:** The initial implementation protected only the plan row while child reconciliation could physically delete removed days, occurrences, warm-ups, targets, and policies.
- **Fix:** Added database delete guards for every owned graph table and changed post-draft topology differences to return `requires_schedule_impact` before writes, including unscheduled plans.
- **Files modified:** `src/platform/sqlite/migrations/0009_owned_plans.ts`, `src/platform/sqlite/repositories/ownedPlanRepository.ts`, `tests/sqlite-host/owned-plans.test.ts`, `tests/integration/owned-plan-crud.test.ts`
- **Verification:** Direct plan/target deletes fail; unscheduled and active structural requests preserve all graph/schedule rows and return impact-required.
- **Committed in:** `6e271cf`

**2. [Rule 3 - Blocking Integration] Wired validated recovery backup for final runtime migration 0006**
- **Found during:** Task 2 merged coverage after registering the final manifest.
- **Issue:** Production runtime and historical manifest tests had only ever executed additive 0001-0003. Registering destructive 0006 correctly triggered `migration_recovery_failed` because startup did not provide the required recovery port.
- **Fix:** Reused the established Expo SQLite hot-backup adapter with validation and local manifest persistence; isolated Phase 1 fixture tests to their frozen manifest while asserting the final runtime order separately.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`, `tests/sqlite-host/migrations-effects.test.ts`
- **Verification:** Startup smoke, 110 migration/effects host tests, and the merged 1,170-test gate pass.
- **Committed in:** `6e271cf`

**3. [Rule 1 - Bug] Made stable ordinal swaps collision-safe inside one transaction**
- **Found during:** Task 2 integration verification.
- **Issue:** Directly swapping target ordinals violated the unique `(parent, ordinal)` constraint before the second row moved.
- **Fix:** Temporarily shifted existing requested day/occurrence/warm-up/target ordinals inside the transaction, then wrote final stable ordinals before commit.
- **Files modified:** `src/platform/sqlite/repositories/ownedPlanRepository.ts`, `tests/integration/owned-plan-crud.test.ts`
- **Verification:** Target reorder commits atomically with the requested final order and no intermediate persisted state.
- **Committed in:** `6e271cf`

**4. [Rule 2 - Missing Critical Functionality] Added permanent complete coverage enforcement**
- **Found during:** Task 2 pre-commit project-rule verification.
- **Issue:** Project rules require complete branch coverage for integrity-critical modules, but the new command, migration, and repository files were not registered.
- **Fix:** Added all three to `scripts/run-coverage-gate.mjs` and covered validation, malformed state, lifecycle, replay, schedule, duplication, conflict, and rollback branches.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `src/domains/plans/ownedPlanCommands.test.ts`, `tests/sqlite-host/owned-plans.test.ts`, `tests/integration/owned-plan-crud.test.ts`
- **Verification:** Merged coverage reports all three modules at 100% statements, branches, functions, and lines.
- **Committed in:** `6e271cf`

---

**Total deviations:** 4 auto-fixed (1 Rule 1 bug, 2 Rule 2 critical controls, 1 Rule 3 integration blocker)
**Impact on plan:** Every deviation was required to satisfy the written final-manifest, no-delete, transaction, and complete-coverage contracts. No package, UI, endpoint, authentication, permanent deletion, schedule-impact execution, or snapshot mutation scope was added.

## Issues Encountered

- The initial merged gate correctly failed when the final manifest activated destructive migration recovery requirements; production now uses the pre-existing validated backup design instead of bypassing the gate.
- SQLite unique ordinal constraints require two-phase in-transaction reorder writes; temporary high ordinals remain invisible outside the exclusive transaction.
- The shell emitted a recurring non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands; it did not affect tests, commits, or artifacts.
- The pre-existing untracked `.gsd/dispatch-isolation-sentinel.json` remained unstaged and untouched.

## Known Stubs

None. Changed files contain no TODO/FIXME, skipped tests, placeholder product data, empty UI feeds, or unrun verification.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local_backup_file_access | `src/bootstrap/workoutAppRuntime.tsx` | Production startup now creates a validated local SQLite recovery database and bounded JSON manifest before destructive migration 0006; files stay inside app-owned storage and are not exposed through diagnostics or network paths. |

## Threat Review

- T-02-03: Repository predicates accept only custom/copied plan rows; bundled plans have no owned mutation path and duplication creates independent `origin='custom'` IDs.
- T-02-04: Complete graph request SHA-256, expected plan revisions, and durable receipts are checked inside one serialized `BEGIN IMMEDIATE` transaction.
- T-02-05: Structural identity changes and active archive return `requires_schedule_impact`; active schedule rows and immutable session snapshots remain byte-identical on refusal or ordinary future edit.
- T-02-07: Errors expose bounded correlation codes, plan/schedule IDs, revisions, operation, lifecycle, and invalidation keys only; target payloads, notes, raw SQL, and request JSON are not included in diagnostics.
- The new local recovery surface uses app-owned database/document directories, validates user version, foreign keys, and integrity, and retains no network or authentication capability.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/owned-plans.test.ts` — PASS, 7 tests.
- `npm run test:unit -- --runInBand src/domains/plans/ownedPlanCommands.test.ts` — PASS, 32 tests.
- `npm run test:integration -- --runInBand tests/integration/owned-plan-crud.test.ts` — PASS, 15 tests.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts` — PASS, 110 tests.
- `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx` — PASS, 19 tests.
- Focused three-module coverage diagnostic — PASS, 100% statements, branches, functions, and lines across 54 tests.
- `npm run test:coverage -- --runInBand` — PASS, 1,170 tests across 59 suites; 47 integrity-critical files at 100% all metrics.
- `npm run typecheck` — PASS.
- `npm run check:boundaries` — PASS.
- Stub, skipped-test, permanent-delete API, diagnostics, manifest-order, commit-deletion, and threat-surface scans — PASS.

## User Setup Required

None - no package installation, credentials, external service, or manual device action is required.

## Next Phase Readiness

- Plan editor/UI work can bind explicit draft, Save, duplicate, archive, restore, and exact invalidation contracts without persisting process-local dirty fields.
- Plan 02-18 can own structural impact/replacement execution using the typed `requires_schedule_impact` boundary without reverse-engineering silent schedule changes.
- Existing active schedules and in-progress workout snapshots remain safe inputs for later UI copy including `Current workout is unaffected`.
- The runtime migration manifest is final through 0009 and production startup now satisfies destructive recovery requirements.
- `.planning/WINDOWS.md` records all four plan deviations as fixed; open defect count remains zero with no stub, skipped test, or unrun verification entry.

## Self-Check: PASSED

- All 13 tracked implementation artifacts and this summary exist.
- Commits `f0a4e37`, `0685923`, `76635fc`, and `6e271cf` exist and carry the required TRAE CLI trailer exactly once.
- Coverage metadata classifies all three LIB-08 deliverables as auto-covered by passing evidence.
- No tracked files were deleted, and released migration bodies 0001 through 0008 remain unchanged.
- `.gsd/dispatch-isolation-sentinel.json` remains unstaged and untouched.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
