---
phase: 02-owned-library-and-planning
plan: 17
subsystem: ui
tags: [react-native, expo-router, sqlite, custom-exercises, metric-migration, maestro, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Explicit nine-profile metric registry, immutable workout snapshots, and shared MetricProfileOption from Plan 02-10
  - phase: 02-owned-library-and-planning
    provides: Adaptive Library root and exercise navigation paths from Plan 02-12
  - phase: 02-owned-library-and-planning
    provides: Revisioned custom create/edit/copy/hide/archive/restore source commands from Plan 02-13
provides:
  - Thin ordinary-create, detail, edit/custom-copy, and metric-migration routes over trusted runtime capabilities
  - Explicit nine-profile custom exercise editor with manual Hold and value-preserving duplicate confirmation
  - Authority-aware detail with attribution, versioned Best/Average/Last, reversible lifecycle, and runnable Archived references
  - One-way future-only metric migration across retained and final owned plan graphs with active-workout blocking
  - Installed public-semantic Maestro lifecycle journey authored for unchanged-APK execution in Plan 02-21
affects: [phase2-plan-impact, phase2-native-contracts, phase2-verification, phase3-history]

actuals:
  tokens: 48679
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - Screens and routes receive bounded custom-exercise capabilities while the trusted app runtime owns clocks, revisions, SQLite reads, and commands
    - Ordinary create and custom-copy editor origins are distinct; both create fresh user-owned identity only through Save exercise
    - Metric migration classifies retained and final owned target graphs together and updates all future occurrences in one serialized transaction
    - Detail history groups comparable observations by complete metric identity and never aggregates across versions or generations

key-files:
  created:
    - app/library/exercise/create.tsx
    - app/library/exercise/[exerciseId].tsx
    - app/library/exercise/[exerciseId]/edit.tsx
    - src/bootstrap/customExerciseRuntime.tsx
    - src/bootstrap/customExerciseRuntime.test.tsx
    - src/ui/screens/ExerciseDetailScreen.tsx
    - src/ui/screens/ExerciseEditorScreen.tsx
    - src/ui/screens/MetricMigrationScreen.tsx
    - src/ui/__tests__/CustomExerciseScreens.test.tsx
    - maestro/phase2/custom-exercise-lifecycle.yaml
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutAppRuntime.test.tsx
    - src/platform/sqlite/repositories/metricRepository.ts
    - tests/integration/custom-exercise.test.ts
    - tests/integration/metric-profile-migration.test.ts

key-decisions:
  - "Ordinary Create custom exercise starts blank, while Create custom copy carries a distinct prepopulated origin and creates nothing until Save exercise."
  - "Ordinary edit keeps the committed metric identity read-only; all profile changes use the explicit D-34 future-target migration flow."
  - "Custom detail and migration reads stay behind a bounded runtime capability; routes and screens import no SQLite or repository modules."
  - "D-34 replacement and policy sets cover both retained plan_* and final owned_plan_* graphs before any source write can commit."
  - "Installed Maestro remains public-semantic and authored-only here; unchanged-APK execution remains Plan 02-21 scope."

patterns-established:
  - "Capability boundary: workoutAppRuntime owns trusted source access; customExerciseRuntime adapts it to screen contracts; routes only resolve parameters and navigation."
  - "Lifecycle boundary: bundled sources expose Favorite, hide, attribution, and Create custom copy; custom sources expose edit, hide, archive, restore, and migration, with no delete path."
  - "Migration boundary: active use blocks before review; every future target and policy requires explicit replacement; immutable history stays segmented by complete identity."
  - "Verification boundary: component, runtime-adapter, real-SQLite, type, boundary, and merged coverage gates must all pass before acknowledgement."

requirements-completed: [LIB-05]

coverage:
  - id: D1
    description: "Ordinary custom creation, explicit profile selection, manual Hold, and duplicate confirmation preserve every entered value and remain distinct from Create custom copy."
    requirement: LIB-05
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/CustomExerciseScreens.test.tsx#custom exercise ordinary create and custom copy origins"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/CustomExerciseScreens.test.tsx#custom exercise duplicate warning"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exercise detail exposes authority, attribution, versioned history, hide/archive/restore, affected plans, runnable Archived references, and no permanent deletion."
    requirement: LIB-05
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/CustomExerciseScreens.test.tsx#exercise detail authority and lifecycle"
        status: pass
      - kind: integration
        ref: "tests/integration/custom-exercise.test.ts#LIB-05 custom exercise runtime reads"
        status: pass
    human_judgment: false
  - id: D3
    description: "One-way future-only metric migration blocks active workouts, requires every replacement and policy, preserves history, and atomically covers retained and final owned target graphs."
    requirement: LIB-05
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/CustomExerciseScreens.test.tsx#future-only metric profile migration"
        status: pass
      - kind: integration
        ref: "tests/integration/metric-profile-migration.test.ts#atomic D-34 future-target profile migration"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false
  - id: D4
    description: "The installed custom exercise journey uses only public labels for ordinary create, duplicate confirmation, custom copy, edit, archive/restore, active-workout blocking, and confirmed profile migration."
    requirement: LIB-05
    verification:
      - kind: other
        ref: "maestro/phase2/custom-exercise-lifecycle.yaml#138 public-semantic commands and static YAML validation"
        status: pass
    human_judgment: false

duration: 65 min
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 17: Custom Exercise Lifecycle and Metric Migration Summary

**Runtime-backed custom exercise detail, explicit create/copy/edit lifecycle, reversible archive state, and one-way future-target metric migration across both authoritative plan graphs**

## Performance

- **Duration:** 65 min
- **Started:** 2026-08-18T14:36:47Z
- **Completed:** 2026-08-18T15:41:46Z
- **Tasks:** 3
- **Tracked files changed:** 15
- **Implementation/test commits:** 5
- **Merged gate:** 1,378 tests passed across 70 suites
- **Global coverage:** 91.31% statements, 87.94% branches, 90.02% functions, 91.63% lines
- **Integrity-critical gate:** 47 files at 100% statements, branches, functions, and lines

## Accomplishments

- Added the exact `Create custom exercise` path with no profile preselection, all nine plain-language profile choices, explicit `Hold / manual decision`, and duplicate confirmation that retains the complete draft.
- Kept built-in `Create custom copy` distinct from ordinary creation: it opens a prepopulated editor, retains source authority, and creates a fresh custom identity only when `Save exercise` commits.
- Added exercise detail with `Built-in` / `Custom`, `Unavailable`, `Archived`, source pack, revision, license, attribution, and complete-identity-segmented `Best`, `Average`, and `Last`.
- Added Favorite, hide/show, edit, archive preview, archive/restore, affected-plan navigation, runnable `Archived` references, and no permanent-delete action.
- Added D-34 through D-39 migration review with active-workout blocking, every future target replacement, per-occurrence compatible policy/manual Hold, immutable-history explanation, recommendation invalidation, fresh baseline, and one-way confirmation.
- Extended the existing migration transaction to classify and update both retained `plan_*` rows and final `owned_plan_*` rows atomically.
- Authored a 138-command public-semantic Maestro journey for ordinary create, duplicate confirmation, custom copy, edit, archive/restore, active-workout blocking, and confirmed profile migration.

## Task Commits

1. **Task 1 RED: Ordinary create and duplicate/custom-copy tracer contracts** — `41ea82d`
2. **Task 1 GREEN: Explicit-profile ordinary custom create tracer** — `a56b9a8`
3. **Task 2 RED: Detail/lifecycle/migration and owned-graph contracts** — `5b81f52`
4. **Task 2 GREEN: Complete lifecycle, runtime reads, and future-only migration** — `725bc87`
5. **Task 3: Installed public-semantic custom exercise lifecycle** — `68ae742`

## Files Created/Modified

- `app/library/exercise/create.tsx` — thin ordinary custom-create route.
- `app/library/exercise/[exerciseId].tsx` — thin authority-aware exercise detail route.
- `app/library/exercise/[exerciseId]/edit.tsx` — thin edit, custom-copy, and metric-migration route.
- `src/bootstrap/customExerciseRuntime.tsx` — bounded custom exercise screen capability adapter and distinct origin contracts.
- `src/bootstrap/workoutAppRuntime.tsx` — trusted custom detail/history/migration reads and revisioned source commands.
- `src/platform/sqlite/repositories/metricRepository.ts` — complete retained plus final-owned migration classification and writes.
- `src/ui/screens/ExerciseEditorScreen.tsx` — explicit-profile create/custom-copy/edit editor with retained duplicate drafts.
- `src/ui/screens/ExerciseDetailScreen.tsx` — attribution/history/lifecycle/affected-plan detail.
- `src/ui/screens/MetricMigrationScreen.tsx` — complete future-target replacement, policy review, block, and one-way confirmation.
- `src/ui/__tests__/CustomExerciseScreens.test.tsx` — ordinary/copy/duplicate/detail/lifecycle/migration/eight-state/adaptive behavior.
- `src/bootstrap/customExerciseRuntime.test.tsx` — capability adapter and provider-hook contracts.
- `tests/integration/custom-exercise.test.ts` — real-SQLite runtime source/history/migration readback plus lifecycle regressions.
- `tests/integration/metric-profile-migration.test.ts` — final owned-graph target/policy migration proof.
- `maestro/phase2/custom-exercise-lifecycle.yaml` — installed public-semantic lifecycle authored for Plan 02-21.

## Decisions Made

- Ordinary edit cannot change the metric radio directly. The current metric identity is shown read-only so D-34 migration remains the only profile-change path.
- Custom-copy intent stays separate from ordinary creation through the editor origin, but both use the same validated create command and fresh owner identity on Save.
- `workoutAppRuntime` is the trusted SQLite/composition owner; `customExerciseRuntime` is a typed capability adapter rather than a second source or repository layer.
- Runtime detail history considers only complete comparable exposures for one exact `(profile, contractVersion, exerciseMetricGeneration)` group.
- Maestro execution is intentionally deferred to Plan 02-21; this plan validates static YAML, exact labels, and public-semantic-only commands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Migrated the final owned-plan target graph**
- **Found during:** Task 2 repository/runtime integration.
- **Issue:** The existing D-34 repository classified only retained `plan_day_exercises`, `plan_working_set_targets`, and `progression_policies`; Plan 02-11’s final editable graph stores current owner targets and policies in `owned_plan_*` tables.
- **Fix:** Classified both graphs as one exact occurrence/target/policy set, validated every revision before writes, updated each graph’s target and policy tables atomically, and advanced both occurrence identities in the same transaction.
- **Files modified:** `src/platform/sqlite/repositories/metricRepository.ts`, `tests/integration/metric-profile-migration.test.ts`
- **Verification:** All 17 metric-profile migration integration tests pass, including final owned targets, replay, stale revisions, active-use blocking, history preservation, and rollback; the repository remains 100% all metrics.
- **Committed in:** `725bc87`

**2. [Rule 3 - Blocking Integration] Added trusted runtime detail and migration capabilities**
- **Found during:** Task 2 thin-route wiring.
- **Issue:** The base runtime owned the custom repository but exposed no bounded detail/history/migration reads or revisioned lifecycle commands, so thin routes and platform-free screens could not consume authoritative facts safely.
- **Fix:** Added bounded trusted read models and commands in `workoutAppRuntime`, adapted them through `customExerciseRuntime`, and kept all routes/screens free of SQL and platform imports.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/customExerciseRuntime.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/bootstrap/customExerciseRuntime.test.tsx`, `tests/integration/custom-exercise.test.ts`
- **Verification:** Runtime adapter tests, 23 custom-exercise integration tests, typecheck, and all 138 boundary-scanned files pass.
- **Committed in:** `725bc87`

**3. [Rule 2 - Missing Critical Functionality] Restored project coverage gates for the new runtime/UI surface**
- **Found during:** Task 2 merged coverage verification.
- **Issue:** All behavior and integrity tests passed, but the initial new runtime/UI surface reduced the unchanged global function threshold below 90%.
- **Fix:** Added focused capability-adapter, provider-composition, real-SQLite readback, and public user-action tests without weakening thresholds or adding test-only product paths.
- **Files modified:** `src/bootstrap/customExerciseRuntime.test.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/ui/__tests__/CustomExerciseScreens.test.tsx`, `tests/integration/custom-exercise.test.ts`
- **Verification:** `npm run test:coverage -- --runInBand` passes 1,378 tests at 91.31% statements, 87.94% branches, 90.02% functions, and 91.63% lines; all 47 integrity-critical files remain at 100% all metrics.
- **Committed in:** `725bc87`

---

**Total deviations:** 3 auto-fixed (2 Rule 2 correctness/verification requirements, 1 Rule 3 blocking integration)
**Impact on plan:** Every deviation was directly required to make the planned detail/migration routes authoritative and complete. No package, schema migration, network endpoint, auth path, permanent deletion, private Maestro selector, or unrelated feature was added.

## Issues Encountered

- The retained v6 integration fixture intentionally lacked modern catalog attribution for a bundled exercise; the runtime read test seeds one valid accepted source row rather than rewriting historical fixture bytes.
- The one-active-workout partial index prevented converting a second completed session into an active session; the active-use test rebinds the existing active session exercise instead, preserving the invariant.
- Expo emits its known non-fatal Expo Go remote-notification warning during host tests; it does not affect development-build behavior or test results.
- The shell emits a recurring non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands.
- The pre-existing untracked `.gsd/dispatch-isolation-sentinel.json` remained byte-identical and unstaged.

## Known Stubs

None. Changed files contain no TODO/FIXME, skipped tests, placeholder product data, disconnected empty feeds, permanent-delete action, or unrun planned verification. Installed Maestro execution remains explicitly assigned to Plan 02-21, not a stub.

## Threat Review

- **T-02-03:** Bundled exercise source fields have no edit command or UI action; custom-copy opens a fresh user-owned draft, and no delete surface exists.
- **T-02-04:** Create, edit, hide, archive/restore, and migration commands use request identities plus exact source/preference/target/policy revisions; success is shown only after committed readback.
- **T-02-05:** Metric identity is explicit, active-use migration is blocked, every target/policy is reviewed, old history stays immutable, and history aggregation is complete-identity segmented.
- **T-02-07:** UI and diagnostics expose bounded names, source attribution, state labels, revisions, and stable errors; owner-entered targets/notes and raw SQL never enter diagnostics.
- No new network endpoint, authentication path, external file-access pattern, schema migration, or unplanned trust boundary was introduced.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/CustomExerciseScreens.test.tsx` — PASS, 14 tests.
- `npm run test:unit -- --runInBand src/bootstrap/customExerciseRuntime.test.tsx` — PASS, 5 tests.
- `npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts` — PASS, 23 tests.
- `npm run test:integration -- --runInBand tests/integration/metric-profile-migration.test.ts` — PASS, 17 tests.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS; boundary check passed all 138 source files.
- `npm run test:coverage -- --runInBand` — PASS, 1,378 tests across 70 suites; global thresholds pass and all 47 integrity-critical files are 100% all metrics.
- Maestro static validation — PASS, two YAML documents and 138 public-semantic commands; required lifecycle labels present; no private routes, test IDs, SQL, or repository controls.
- Artifact, trailer, deletion, stub, skipped-test, forbidden-surface, generated-directory, threat-surface, and sentinel scans — PASS.

## User Setup Required

None - no package installation, credentials, external service, schema migration, or manual device action is required.

## Next Phase Readiness

- Plan 02-18 can consume complete custom-exercise lifecycle facts while adding schedule-impact and replacement flows without changing the D-34 migration boundary.
- Plan 02-21 can execute `maestro/phase2/custom-exercise-lifecycle.yaml` against the unchanged installed candidate together with the combined Phase 2 runner.
- Phase 3 history can consume complete-identity-segmented custom exercise history without cross-profile reinterpretation.
- `.planning/WINDOWS.md` records all three deviations as fixed; open defect count remains zero.

## Self-Check: PASSED

- All 15 tracked implementation/test artifacts and this summary exist.
- Commits `41ea82d`, `a56b9a8`, `5b81f52`, `725bc87`, and `68ae742` exist and carry the required TRAE CLI trailer exactly once.
- Focused component/runtime/integration tests, typecheck, lint, boundary checks, merged coverage, and Maestro static validation pass.
- No tracked file was deleted; no stub, skipped test, permanent-delete surface, private Maestro selector, or open broken-window entry remains.
- Generated `coverage-task17/` and `coverage-task17-runtime/` directories are absent.
- `.gsd/dispatch-isolation-sentinel.json` remains byte-identical and unstaged.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
