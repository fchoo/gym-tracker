---
phase: 02-owned-library-and-planning
plan: 18
subsystem: ui
tags: [sqlite, owned-plans, schedule-impact, exercise-replacement, react-native, maestro, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Revisioned no-permanent-delete owned-plan aggregate and structural-impact refusal from Plan 02-11
  - phase: 02-owned-library-and-planning
    provides: Adaptive owned-plan editor and trusted runtime port from Plan 02-15
  - phase: 02-owned-library-and-planning
    provides: Immutable prospective schedule versions, bindings, overrides, opportunities, and events from Plan 02-16
provides:
  - Revision-bound D-32 schedule-impact preview with explicit replacement-day, binding-removal, or effective-date choice
  - Atomic plan plus prospective schedule mutation that retains removed source rows and leaves sessions, opportunities, and history unchanged
  - Complete-identity D-52 compatible-first exercise replacement with explicit target, warm-up, rest, progression, and immutable-history review
  - Exact D-53 This occurrence and All occurrences in this plan scopes with complete impact preview and Save replacement
  - Trusted runtime/editor routes and authored installed Maestro journey for Plan 02-21 unchanged-APK execution
affects: [phase2-native-contracts, phase2-verification, today-schedule-reads, owned-plan-editor, exercise-history]

actuals:
  tokens: 58752
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - Current impact previews hash complete plan, day, schedule, binding, pending override, candidate, occurrence, child-fact, and revision snapshots
    - Structural day removal retains immutable rows outside the current ordinal window while appending one prospective schedule version
    - Exercise replacement keeps occurrence identity and child target/warm-up/rest/policy facts, changing only selected future exercise references
    - Exact committed-state replay is reconstructed from SQLite source facts without a second receipt table

key-files:
  created:
    - app/library/plan/[planId]/day/[dayId]/remove.tsx
    - app/library/plan/[planId]/replace/[occurrenceId].tsx
    - maestro/phase2/plan-impact-replacement.yaml
    - src/domains/plans/planImpactCommands.test.ts
    - src/domains/plans/planImpactCommands.ts
    - src/platform/sqlite/repositories/planImpactRepository.ts
    - src/ui/components/ImpactPreview.tsx
    - src/ui/screens/ExerciseReplacementScreen.tsx
    - src/ui/screens/PlanDayRemovalScreen.tsx
    - tests/integration/plan-impact-replacement.test.ts
  modified:
    - app/library/plan/[planId]/edit.tsx
    - scripts/run-coverage-gate.mjs
    - src/bootstrap/ownedPlanRuntime.tsx
    - src/bootstrap/workoutAppRuntime.tsx
    - src/domains/plans/index.ts
    - src/domains/scheduling/index.ts
    - src/platform/sqlite/repositories/ownedPlanRepository.ts
    - src/ui/__tests__/PlanImpactReplacement.test.tsx
    - src/ui/components/index.ts
    - src/ui/screens/OwnedPlanEditorScreen.tsx

key-decisions:
  - "D-32 removal never deletes owned plan source rows: the removed day is retired outside the current days_per_week ordinal window, while a new immutable schedule version becomes prospective authority."
  - "Impact previews are current-revision tokens over complete affected plan, schedule, override, candidate, occurrence, target, warm-up, rest, and policy facts; stale facts fail before writes."
  - "D-52 compatibility means exact (profile, contractVersion, exerciseMetricGeneration) equality only; names and similar presentation never imply compatibility or historical comparability."
  - "D-53 replacement preserves occurrence and child identities, submitted values, sessions, snapshots, and history; scope changes only selected future exercise references."
  - "Thin routes and the owned editor use the existing trusted runtime kernel; no route or screen imports SQLite or repository internals."

patterns-established:
  - "Impact boundary: source-backed complete preview -> explicit owner choice/review -> one serialized aggregate transaction -> post-commit invalidation."
  - "Removal boundary: retain source/history rows -> exclude retired facts from current read models -> append prospective schedule intent."
  - "Replacement boundary: complete-identity candidate partition -> exact scope -> complete reviewed occurrence facts -> conditional reference updates."

requirements-completed: [LIB-05, LIB-08]

coverage:
  - id: D1
    description: "Schedule-bound day removal requires a current complete preview and one explicit replacement, removal, or effective-date choice before atomic Save."
    requirement: LIB-08
    verification:
      - kind: integration
        ref: "tests/integration/plan-impact-replacement.test.ts#plan impact day removal"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/PlanImpactReplacement.test.tsx#Plan impact day removal"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compatible-first exercise replacement uses complete metric identity, exact occurrence scopes, complete value review, and immutable history."
    requirement: LIB-05
    verification:
      - kind: unit
        ref: "src/domains/plans/planImpactCommands.test.ts#D-52/D-53 exercise replacement commands"
        status: pass
      - kind: integration
        ref: "tests/integration/plan-impact-replacement.test.ts#plan impact exercise replacement"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/PlanImpactReplacement.test.tsx#Exercise replacement"
        status: pass
    human_judgment: false
  - id: D3
    description: "Public installed journey covers D-32 choices, D-52/D-53 replacement review, stale-preview retry, and active-workout restructuring block."
    requirement: LIB-08
    verification:
      - kind: other
        ref: "maestro/phase2/plan-impact-replacement.yaml#authored public-semantic flow"
        status: pass
    human_judgment: false

duration: 73 min
completed: 2026-08-19
status: complete
---

# Phase 02 Plan 18: Schedule Impact and Exercise Replacement Summary

**Revision-bound schedule-impact removal and complete-identity exercise replacement with explicit future-only choices, atomic SQLite persistence, and immutable workout history**

## Performance

- **Duration:** 73 min
- **Started:** 2026-08-18T15:50:04Z
- **Completed:** 2026-08-18T17:02:48Z
- **Tasks:** 3
- **Tracked implementation files changed:** 20
- **Implementation commits:** 6
- **Focused plan-impact tests:** 54 passed
- **Merged gate:** 1,432 tests passed across 73 suites
- **Integrity-critical gate:** 49 files at 100% statements, branches, functions, and lines

## Accomplishments

- Added a dedicated D-32 route and adaptive screen that names every affected recurring binding and pending date, shows the current preview revisions, and requires replacement day, remove binding, or effective LocalDate before `Remove day`.
- Added one serialized plan-impact repository that retains immutable source rows, conditionally retires the current day, appends a prospective schedule version, updates only pending overrides at or after the effective date, and rolls back plan plus schedule together.
- Added D-52 compatible-first replacement by exact profile, contract version, and exercise metric generation, with incompatible identities visible but disabled and no comparability claim.
- Added exact D-53 `This occurrence` and `All occurrences in this plan` scopes with complete occurrence preview and explicit target, warm-up, rest, progression, and history acknowledgements before `Save replacement`.
- Kept sessions, snapshots, consumed opportunities, prior schedule versions/bindings, targets, warm-ups, rest, policies, and history byte-identical across successful mutations and rollback failures.
- Wired the owned editor and thin routes through the existing trusted runtime kernel, then authored the 92-command public-semantic installed Maestro journey for later unchanged-APK execution.

## Task Commits

1. **Task 1 RED: Day-impact component contracts** — `1acdd8b`
2. **Task 1 RED: Day-impact SQLite contracts** — `4f24516`
3. **Task 1 GREEN: Atomic schedule-bound day removal** — `ea5d4b5`
4. **Task 2 RED: Compatible replacement contracts** — `3784332`
5. **Task 2 GREEN: Complete explicit exercise replacement** — `db81248`
6. **Task 3: Installed plan-impact Maestro journey** — `6a2473b`

## Files Created/Modified

- `src/domains/plans/planImpactCommands.ts` — revision-bound previews, exact complete-identity compatibility, explicit D-32 choices, D-53 scope validation, review acknowledgement, and post-commit invalidation.
- `src/platform/sqlite/repositories/planImpactRepository.ts` — source-backed preview reads, atomic day/schedule impact, scoped replacement, exact committed-state replay, optimistic race guards, and immutable-history persistence.
- `src/ui/components/ImpactPreview.tsx` — shared literal before/after and current-revision impact rendering.
- `src/ui/screens/PlanDayRemovalScreen.tsx` — loading/error/current-preview route with all three D-32 choices, stale refresh, and active-workout restructuring block.
- `src/ui/screens/ExerciseReplacementScreen.tsx` — compatible-first candidate sections, exact scopes, complete current value review, error retention, and `Save replacement`.
- `src/ui/screens/OwnedPlanEditorScreen.tsx` — public Remove day and Replace exercise route actions while ordinary draft editing remains unchanged.
- `src/bootstrap/ownedPlanRuntime.tsx`, `src/bootstrap/workoutAppRuntime.tsx` — bounded plan-impact capabilities over the already-open trusted kernel and trusted read refresh after commit.
- `app/library/plan/[planId]/day/[dayId]/remove.tsx`, `app/library/plan/[planId]/replace/[occurrenceId].tsx` — SQL-free thin routes.
- `src/domains/plans/planImpactCommands.test.ts`, `tests/integration/plan-impact-replacement.test.ts`, `src/ui/__tests__/PlanImpactReplacement.test.tsx` — complete command, real SQLite, state matrix, adaptive, accessibility, stale, rollback, retry, and immutable-history proof.
- `scripts/run-coverage-gate.mjs` — permanent 100% all-metrics enforcement for both new integrity-critical modules.
- `maestro/phase2/plan-impact-replacement.yaml` — authored installed public-semantic D-32/D-52/D-53 journey.

## Decisions Made

- A removed owned day remains an immutable source row at a retired ordinal; current plan reads use `plans.days_per_week` as the authoritative current ordinal window.
- Schedule impact always appends a new version. Existing versions, bindings, consumed opportunities, sessions, and historical facts are never rewritten.
- Pending date overrides at or after the chosen effective LocalDate are explicitly rebound or changed to rest day; earlier dates remain unchanged.
- Exercise replacement changes only `owned_plan_day_exercises.exercise_id` under expected occurrence and plan revisions. Targets, warm-ups, rest, policies, and all historical snapshots remain unchanged.
- Exact committed replacement replay is reconstructed from current plan revision, replacement exercise identity, occurrence revisions, and byte-equivalent submitted child facts, so an uncertain successful save is safely retryable without a new receipt table.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Retained removed source rows instead of physical deletion**
- **Found during:** Task 1 schema and history review.
- **Issue:** Existing owned-plan triggers prohibit permanent day/occurrence deletion, and sessions retain foreign keys to source day facts.
- **Fix:** Retired the removed day outside the current `days_per_week` ordinal window, filtered current plan readback by that window, and appended prospective schedule facts while preserving historical references.
- **Files modified:** `src/platform/sqlite/repositories/planImpactRepository.ts`, `src/platform/sqlite/repositories/ownedPlanRepository.ts`, `tests/integration/plan-impact-replacement.test.ts`
- **Verification:** Current editor readback excludes the retired day; raw source row, sessions, opportunities, and old schedule versions remain byte-identical.
- **Committed in:** `ea5d4b5`

**2. [Rule 2 - Missing Critical Functionality] Added source-backed retry safety without a second receipt table**
- **Found during:** Task 1/2 uncertain-commit review.
- **Issue:** A committed mutation whose UI acknowledgement was lost could otherwise be misclassified as stale because source revisions already advanced.
- **Fix:** Day removal replays from immutable schedule events; replacement reconstructs exact committed state from plan revision, occurrence revisions, replacement identity, and complete child facts.
- **Files modified:** `src/domains/plans/planImpactCommands.ts`, `src/platform/sqlite/repositories/planImpactRepository.ts`, `tests/integration/plan-impact-replacement.test.ts`
- **Verification:** Exact retries return `already_committed`; changed request/facts reject without invalidation or writes.
- **Committed in:** `ea5d4b5`, `db81248`

**3. [Rule 3 - Blocking Issue] Preserved architecture boundaries through public domain barrels**
- **Found during:** Task 1 boundary lint.
- **Issue:** Initial plan-impact code imported scheduling internals and the UI named a platform repository result type.
- **Fix:** Exported required LocalDate/timezone helpers through the scheduling barrel and exported command result contracts through the plans domain; routes/screens remain platform-free.
- **Files modified:** `src/domains/scheduling/index.ts`, `src/domains/plans/index.ts`, `src/domains/plans/planImpactCommands.ts`, `src/ui/screens/PlanDayRemovalScreen.tsx`
- **Verification:** `npm run lint` passes all 145 source files.
- **Committed in:** `ea5d4b5`

**4. [Rule 2 - Missing Critical Functionality] Permanently enforced complete coverage for impact integrity modules**
- **Found during:** Task 2 project-rule verification.
- **Issue:** Project rules require complete branch coverage for integrity-critical source mutation modules.
- **Fix:** Closed validation, stale, replay, rotation, empty-graph, override, rollback, concurrency, and committed-state branches, then added both modules to `scripts/run-coverage-gate.mjs`.
- **Files modified:** `src/domains/plans/planImpactCommands.test.ts`, `tests/integration/plan-impact-replacement.test.ts`, `scripts/run-coverage-gate.mjs`
- **Verification:** Merged coverage passes 1,432 tests and reports 49 integrity-critical files at 100% statements, branches, functions, and lines.
- **Committed in:** `db81248`

**5. [Rule 2 - Missing Critical Functionality] Added direct trusted runtime and editor navigation wiring**
- **Found during:** Task 2 end-to-end route integration.
- **Issue:** The planned screens could not be reached or refresh trusted Library state without bounded runtime capabilities and explicit editor actions.
- **Fix:** Added plan-impact methods to the existing owned-plan runtime and workout runtime, public editor actions, and thin remove/replace routes.
- **Files modified:** `app/library/plan/[planId]/edit.tsx`, `src/ui/screens/OwnedPlanEditorScreen.tsx`, `src/bootstrap/ownedPlanRuntime.tsx`, `src/bootstrap/workoutAppRuntime.tsx`, `src/domains/plans/index.ts`
- **Verification:** Component navigation tests, typecheck, boundary lint, focused integration, and merged coverage pass.
- **Committed in:** `db81248`

---

**Total deviations:** 5 auto-fixed (4 Rule 2 missing critical controls, 1 Rule 3 boundary blocker)
**Impact on plan:** All adjustments are directly required for correctness, immutable history, retry safety, architectural boundaries, coverage policy, or explicit D-32/D-52/D-53 reachability. No package, migration, network, authentication, external file, history-migration, or unrelated UI scope was added.

## Issues Encountered

- The retained v8 fixture intentionally omits later operational schedule tables, so the real SQLite proof uses the canonical retained v6 fixture migrated through 0008 and 0009 before seeding isolated Plan 02-18 facts.
- Expo notifications emits a known non-fatal Expo Go warning during merged host coverage; all 73 suites and integrity gates still pass.
- The shell emits a recurring non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands; it did not affect tests, commits, or artifacts.
- The pre-existing untracked `.gsd/dispatch-isolation-sentinel.json` remained byte-identical and unstaged.

## Known Stubs

None. Changed files contain no TODO/FIXME, skipped tests, placeholder product data, incomplete UI feed, or unrun verification.

## Threat Review

- T-02-03: Commands operate only on custom/copied owned-plan aggregates; bundled plan reads return no impact command, and no bundled source or historical row is updated.
- T-02-04: Preview tokens bind all current plan, day, schedule, binding, override, candidate, occurrence, target, warm-up, policy, and revision facts; repositories re-read and compare inside one serialized transaction.
- T-02-05: Compatibility is exact complete metric identity equality; no value conversion, comparability inference, or history migration exists. Schedule changes are prospective and explicit.
- T-02-07: UI and errors expose intentional plan names, bounded IDs/revisions/counts, and safe codes only; raw SQL, target payload diagnostics, and storage causes are not rendered.
- No unplanned network endpoint, authentication path, file access, schema migration, package, or new external trust boundary was introduced.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/PlanImpactReplacement.test.tsx` — PASS, 13 tests.
- `npm run test:integration -- --runInBand tests/integration/plan-impact-replacement.test.ts` — PASS, 24 tests.
- `npm run test:unit -- --runInBand src/domains/plans/planImpactCommands.test.ts` — PASS, 17 tests.
- `npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanEditor.test.tsx` — PASS, 13 tests.
- `npm run test:integration -- --runInBand tests/integration/owned-plan-crud.test.ts` — PASS, 15 tests.
- Focused two-module coverage — PASS, 100% statements, branches, functions, and lines.
- `npm run test:coverage -- --runInBand` — PASS, 1,432 tests across 73 suites; 49 integrity-critical files at 100% all metrics.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS, 145 source files.
- Maestro YAML parse and required-label gates — PASS, 92 public-semantic commands authored; unchanged-APK execution remains Plan 02-21 scope.
- Stub, skipped-test, permanent-delete, immutable-history write, route-platform-import, threat-surface, deletion, commit-trailer, and sentinel scans — PASS.

## User Setup Required

None - no package installation, credentials, external service, schema migration, or manual device action is required.

## Next Phase Readiness

- Plan 02-21 can execute `maestro/phase2/plan-impact-replacement.yaml` against the unchanged Phase 2 APK alongside the other authored Library flows.
- Today/schedule reads continue to resolve immutable earlier versions and opportunities while the latest prospective version uses only current plan days.
- Exercise history remains attached to original exercise/session snapshots; future current-plan occurrences reflect explicit replacement only.
- `.planning/WINDOWS.md` remains at zero open defects; no stubs, skipped tests, unrun verification, or deferred Plan 02-18 gaps remain.

## Self-Check: PASSED

- All 20 tracked implementation/test/Maestro artifacts and this summary exist.
- Commits `1acdd8b`, `4f24516`, `ea5d4b5`, `3784332`, `db81248`, and `6a2473b` exist and carry the required TRAE CLI trailer exactly once.
- Focused component, unit, integration, typecheck, lint, Maestro, and merged coverage evidence matches the claims above.
- No tracked files were deleted; no migration or package file changed.
- `.gsd/dispatch-isolation-sentinel.json` remains byte-identical and unstaged.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-19*
