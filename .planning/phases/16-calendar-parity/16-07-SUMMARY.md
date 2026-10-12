---
phase: 16-calendar-parity
plan: "07"
subsystem: calendar-cross-route-and-evidence
tags: [calendar, expo-router, running, garmin, evidence, diagnostics, tdd]
requires:
  - phase: 16-calendar-parity
    provides: Source-backed Calendar projection, spatial return state, Revision 18 comparison map, and diagnostic controls from Plans 16-01 through 16-06.
  - phase: 17-library-running-plans
    provides: Real Running plan route, loader, and detail screen from Plan 17-08.
  - phase: 18-garmin-import
    provides: Real imported-activity route, accepted-detail loader, and bounded Calendar origin from Plans 18-08 and 18-14.
provides:
  - Real Calendar-to-Running and Calendar-to-Garmin journeys with exact durable identities and stack Back restoration.
  - Calendar-origin read-only modes that do not expose Running lifecycle/edit or Garmin match/revision commands.
  - Fail-closed Phase 16 evidence aggregation over nine NV-CAL cases, eight host route journeys, fourteen Revision 18 mappings, and DEV-01/DEV-02 technical status.
  - Raw development-test Calendar query/frame diagnostics with Phase 20-only acceptance ownership.
  - Exact 100/100/100/100 focused coverage registration for phase16CalendarTestControls.ts.
affects: [phase-20-native-acceptance, calendar-parity, running-detail, imported-activity-detail]
tech-stack:
  added: []
  patterns:
    - Calendar-origin destination routes pass only query and Back capabilities to real downstream screens.
    - Final evidence status is derived from constituent cases and cannot be promoted over FAIL or REVIEW_REQUIRED.
    - Performance producers retain raw source-backed samples and metadata without authoring an acceptance verdict.
key-files:
  created:
    - app/__tests__/calendar-cross-destination-route.test.tsx
    - scripts/benchmark-v12-interactions.mjs
    - scripts/verify-v12-native-evidence.mjs
    - scripts/v12-evidence-scripts.test.mjs
    - scripts/fixtures/v12-calendar-evidence/complete.json
  modified:
    - app/(tabs)/calendar.tsx
    - app/(tabs)/__tests__/calendar.test.tsx
    - app/library/running/[planId].tsx
    - app/garmin/activity/[activityId].tsx
    - app/__tests__/garmin-activity-route.test.tsx
    - src/ui/calendar/CalendarAgenda.tsx
    - src/ui/screens/RunningPlanDetailScreen.tsx
    - src/ui/screens/ImportedActivityDetailScreen.tsx
    - scripts/run-v12-maestro.mjs
    - scripts/v12-calendar-comparison.test.mjs
    - scripts/run-coverage-gate.mjs
    - package.json
key-decisions:
  - "Calendar origin is a query-only mode on the real Running and imported-activity detail screens; management origins retain their existing commands."
  - "Host route journeys may pass, but unexecuted native, comparison, DEV, and diagnostic rows remain REVIEW_REQUIRED and keep all_pass false."
  - "Phase 16 diagnostics retain raw query and complete interaction samples plus computed p95, missed frames, refresh rate, and profiler overhead; Phase 20 alone assigns release/profile verdicts."
  - "The Plan 16-06 handoff makes phase16CalendarTestControls.ts integrity-critical and gives it an exact focused 100% gate."
metrics:
  duration: 41m
  completed: 2026-10-13
actuals:
  tokens: 30108
  tasks: 3
  commits: 7
status: complete
---

# Phase 16 Plan 07: Real Destination Integration and Evidence Seal Summary

**Calendar now opens the real Phase 17 Running and Phase 18 Garmin detail routes by durable identity, restores exact Calendar focus without source commands, and validates Phase 16 evidence and diagnostics without manufacturing native acceptance.**

## Performance

- **Duration:** 41 minutes
- **Tasks:** 3/3
- **Implementation/test/tool files changed:** 17
- **TDD commits:** 6 RED/GREEN commits plus this summary commit
- **Native execution:** `NOT_RUN` — explicitly deferred to Phase 20

## Accomplishments

- Added a real-component route harness covering completed and partial Strength, planned Strength, planned Running, imported outdoor Running, imported treadmill Running, stale Running, and removed Garmin identities.
- Preserved exact opaque IDs, Calendar month/date/focused-week/agenda state, stack Back, invoking-row focus, and the shared 3dp focus contract across touch and keyboard activation.
- Made Calendar-origin Running and Garmin details query-only while preserving all Library/Workout/Progress management behavior outside that origin.
- Proved the route matrix leaves a synthetic source digest unchanged and calls no completion, rest, correction, removal, resume, lifecycle, matching, or revision command.
- Added a fail-closed evidence verifier that validates the exact NV-CAL-01..09 set, exact route/comparison sets, artifact descriptors, immutable identities, monotonic observations, privacy, owner deviations, and derived aggregate status.
- Added a real native diagnostic collector source that retains at least 100 source-backed query samples and 100 complete drag/expand/collapse sequences with deterministic p95, missed-frame, refresh-rate, and profiler-overhead summaries, but no Phase 16 verdict.
- Added the five requested Calendar evidence/diagnostic package commands plus the exact focused Calendar-controls coverage command.

## Task Commits

1. **Task 1: Open the real Phase 17 Running detail and restore Calendar focus**
   - `2345942b` — RED real Running route journey
   - `2c36986f` — GREEN Calendar-origin Running integration
2. **Task 2: Open the real Phase 18 activity detail and close every route/authority case**
   - `b46e940b` — RED full destination authority matrix
   - `07981b9f` — GREEN real Garmin/read-only/keyboard integration
3. **Task 3: Seal Phase 16 evidence and emit performance diagnostics for Phase 20**
   - `05249eff` — RED adversarial evidence and diagnostic contracts
   - `50a212d9` — GREEN verifier, diagnostic collector, package commands, and coverage registration

Every commit contains the exact required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer. The repository hook also appended its separately configured TRAE CLI trailer.

## Verification

- Focused route and management regression gate: **9 suites, 73 tests passed**.
- Evidence/comparison gate: **12 tests passed**.
- Host fixture verifier: **valid, `REVIEW_REQUIRED`, `all_pass: false`, 9 native cases, 8 route journeys, 14 comparison rows**.
- Exact focused integrity gate for `src/bootstrap/phase16CalendarTestControls.ts`: **100% statements, 100% branches, 100% functions, 100% lines**.
- TypeScript: `npm run typecheck` passed.
- Lint: `npm run lint` passed.
- Boundaries: `npm run check:boundaries` passed across 421 files.
- Full component suite: **95 suites, 832 tests passed**.
- Full SQLite-host suite: **28 suites, 583 tests passed**.
- `git diff --check`: passed.

## Native and Performance Deferrals

- Android doctor, Gradle/APK build, ADB, emulator/device access, Maestro native execution, screenshots, native comparisons, and native benchmarks were not run.
- No native evidence was created or preseeded, and no native `PASS` was claimed.
- The checked-in evidence fixture is explicitly `host_only_fixture: true`; its native/comparison/DEV/diagnostic rows remain `NOT_RUN` / `REVIEW_REQUIRED` and its aggregate is `all_pass: false`.
- `benchmark-v12-interactions.mjs` is producer/validator source only in Phase 16. Phase 20 Plan 20-08 owns the immutable build/run identity, and Phase 20 owns native collection plus release/profile NV-PERF-07/NV-PERF-09 verdicts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Enforced read-only capability at the real downstream routes**
- **Found during:** Tasks 1 and 2
- **Issue:** The Calendar route already pointed at the Phase 17/18 paths, but those real destination routes still exposed Running lifecycle/edit/Garmin actions or Garmin match/revision commands when opened from Calendar.
- **Fix:** Added explicit Calendar-origin rendering branches to the existing Running and imported-activity routes/screens while retaining management-origin behavior.
- **Files modified:** `app/library/running/[planId].tsx`, `src/ui/screens/RunningPlanDetailScreen.tsx`, `app/garmin/activity/[activityId].tsx`, `src/ui/screens/ImportedActivityDetailScreen.tsx`
- **Commits:** `2c36986f`, `07981b9f`

**2. [Rule 1 - Bug] Restored keyboard activation for agenda rows**
- **Found during:** Task 2 RED route matrix
- **Issue:** CalendarAgenda supplied an Escape-only `onKeyDown`, which replaced the shared Enter/Space activation handler.
- **Fix:** Routed Enter and Space through the same latched durable-destination activation used by touch while preserving Escape Back.
- **Files modified:** `src/ui/calendar/CalendarAgenda.tsx`
- **Commit:** `07981b9f`

**3. [Rule 1 - Bug] Corrected the Calendar manifest Git HEAD contract**
- **Found during:** Task 3 adversarial identity test
- **Issue:** The Plan 16-06 runner validated `base_head` as a 64-character SHA-256 even though Git SHA-1 commit identities are 40 characters, making a real manifest impossible to validate.
- **Fix:** Added a dedicated 40-character Git HEAD validator while retaining 64-character source/manifest/APK/device/report hash validation.
- **Files modified:** `scripts/run-v12-maestro.mjs`, `scripts/v12-calendar-comparison.test.mjs`
- **Commit:** `50a212d9`

**4. [Rule 2 - Required Plan 16-06 handoff] Registered the Calendar diagnostic controls at exact coverage**
- **Found during:** Task 3 and the explicit owner instruction
- **Issue:** `src/bootstrap/phase16CalendarTestControls.ts` was not listed in the integrity-critical registry, so the standard focused gate could not enforce its already-proven complete branch coverage. The Plan 16-07 file list omitted `scripts/run-coverage-gate.mjs`.
- **Fix:** Added only that module to the existing integrity list and added `test:coverage:v12:calendar` with the exact focused unit project/test command.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `package.json`
- **Verification:** 100/100/100/100.
- **Commit:** `50a212d9`

## Deferred Issues

- The repository-wide `npm run test:all -- --runInBand` command stopped in the unit stage because three untouched `src/platform/sqlite/repositories/progressRepository.test.ts` cases do not supply the snapshot kernel now required by `progressRepository.ts`. The same full coverage run reached the same failures. These files are unchanged from base and are owned by the concurrent Phase 19 worktree.
- The independently run integration suite had **33/34 suites and 502/503 tests pass**; the untouched `tests/integration/starter-activation-repository.test.ts` recommendation case supplies an invalid decision timestamp to the current validator. Its source and test are unchanged from base and remain Phase 19-owned.
- Per the explicit owner boundary, these out-of-scope items were not added to `.planning/WINDOWS.md` and no shared planning-state file was modified.

## Known Stubs

None. The checked-in JSON is an explicitly labeled host-only adversarial fixture; it cannot be accepted as native evidence and does not flow into product UI.

## Threat Flags

None beyond the plan threat model. Route identity, Calendar-origin capability, evidence-file, classification, privacy, and diagnostic trust boundaries are covered by the implemented fail-closed checks.

## TDD Gate Compliance

- Task 1: RED `2345942b`, GREEN `2c36986f`.
- Task 2: RED `b46e940b`, GREEN `07981b9f`.
- Task 3: RED `05249eff`, GREEN `50a212d9`.

## State Update Boundary

Per the owner’s explicit instruction for parallel Phase 16/19 execution, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/WINDOWS.md`, Phase 14 dirty evidence, Phase 19 files, and the orchestrator checkout were not modified. The 16-07 summary is the only planning artifact written by this executor.

## Self-Check

**PASSED.** All declared created files exist; all six task commits are reachable and contain the exact required co-author trailer; the net diff contains no shared STATE/ROADMAP/REQUIREMENTS/WINDOWS, Phase 14, or Phase 19 file; and the pre-summary worktree was clean.

---
*Phase: 16-calendar-parity*
*Completed: 2026-10-13*
