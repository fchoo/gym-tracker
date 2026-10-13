---
phase: 19-progress-parity
fixed_at: 2026-10-13T02:24:28Z
review_path: .planning/phases/19-progress-parity/19-REVIEW.md
security_path: .planning/phases/19-progress-parity/19-SECURITY.md
ui_review_path: .planning/phases/19-progress-parity/19-UI-REVIEW.md
verification_path: .planning/phases/19-progress-parity/19-VERIFICATION.md
iteration: 1
findings_in_scope: 24
fixed: 24
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-10-13T02:24:28Z
**Source reviews:** `19-REVIEW.md`, `19-SECURITY.md`, `19-UI-REVIEW.md`, `19-VERIFICATION.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 24
- Fixed: 24
- Skipped: 0
- Native execution: not run, as required; Phase 20 ownership is unchanged

## Fixed Issues

### CR-01: Running periods and complete All-time data

**Files modified:** `src/platform/sqlite/repositories/progressRepository.ts`, `tests/sqlite-host/progressRepository.test.ts`
**Commit:** `707ba616`
**Applied fix:** Applied the selected owner-local Running window to accepted activity reads and replaced semantic `LIMIT 500` truncation with deterministic snapshot-local paging to completion. Added 501-row and out-of-range behavior tests proving the latest fact and complete history remain available.

### CR-02: Active-plan and current-target authority

**Files modified:** `src/domains/progress/contracts.ts`, `src/domains/progress/dashboardProjection.ts`, `src/platform/sqlite/repositories/progressRepository.ts`
**Commit:** `bb6ea670`
**Applied fix:** Retained plan identity, active lifecycle, and current-goal identity; excluded inactive/archived goals; resolved current Target independently from target-at-effort history; and projected target-only and non-2.4 km states without relabelling.

### CR-03: One coherent SQLite snapshot

**Files modified:** `src/platform/sqlite/repositories/progressRepository.ts`, `src/platform/sqlite/repositories/runningPlanRepository.ts`, `src/bootstrap/workoutAppRuntime.tsx`
**Commit:** `707ba616`
**Applied fix:** Moved active Running aggregate reads into the repository snapshot and removed post-snapshot runtime composition. Dashboard facts and target-editor source revisions now originate from one coherent read transaction.

### CR-04: Complete All, Strength, and Running hierarchy

**Files modified:** `src/domains/progress/contracts.ts`, `src/domains/progress/dashboardProjection.ts`, `src/ui/screens/ProgressScreen.tsx`
**Commit:** `bb6ea670`
**Applied fix:** Added typed Latest, Best, Target, Gap, status, evidence, factual history, source identity, active-goal, sparse, one-effort, and target-only projections. All three roots now render factual heroes and charts instead of placeholder text; Running also renders goals and Best efforts.

### CR-05: Bounded automatic refresh

**Files modified:** `src/ui/screens/ProgressScreen.tsx`, `src/ui/__tests__/ProgressScreen.test.tsx`
**Commit:** `17328e93`
**Applied fix:** Threaded repository refresh metadata to the screen and scheduled exactly the declared 250/1000/4000 ms attempts while Updating. Selection changes and unmount cancel obsolete timers; current/unavailable and max-attempt states terminate polling.

### CR-06: Durable recommendation receipts for every caller

**Files modified:** `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `tests/integration/load-reps.test.ts`
**Commit:** `80e80943`
**Applied fix:** Routed completion and Progress Keep/Use through one fenced command builder. Current-schema decisions always persist SHA-256-bound receipts, including superseded outcomes, and replay by recommendation identity after acknowledgement loss or process relaunch.

### CR-07: Recommendation receipts survive merge

**Files modified:** `src/domains/portability/mergePlan.ts`, `src/domains/portability/mergePlan.test.ts`, `tests/sqlite-host/logicalMergeRepository.test.ts`
**Commit:** `a49d9d79`
**Applied fix:** Materialized both legacy and owned receipt tables with remapped recommendation foreign keys, collision-safe keep-both request IDs, validated hashes/decisions/results, and rewritten bounded result identities. Pure-planner and real-SQLite merge tests prove retained read-back.

### CR-08: Exact exercise-history source revision reaches its destination

**Files modified:** `app/session/[sessionId].tsx`, `src/bootstrap/workoutAppRuntime.tsx`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`, `tests/integration/workout-outcomes.test.ts`
**Commit:** `2147e216`
**Applied fix:** Parsed and validated positive Progress source revisions, loaded the exact effective session revision in one snapshot, and failed closed for mismatch, correction, removal, or missing source. Destination route tests cover all four states.

### CR-13: Strength chart direction and target equality

**Files modified:** `src/ui/components/FactualHistoryChart.tsx`, `src/ui/__tests__/FactualHistoryChart.test.tsx`
**Commit:** `d7030c20`
**Applied fix:** Made better values move upward for both lower-is-better and higher-is-better metrics and rendered exact equality as `At target`.

### WR-01: Preserve visual extrema and target crossings

**Files modified:** `src/ui/components/FactualHistoryChart.tsx`, `src/ui/__tests__/FactualHistoryChart.test.tsx`
**Commit:** `d7030c20`
**Applied fix:** Separated mandatory semantic points from discretionary spacing samples. First, last, Best, Latest, local extrema, and target-crossing points are never dropped; the visual set may exceed the nominal cap when semantics require it.

### WR-02: Consistent duration formatting

**Files modified:** `src/ui/components/FactualHistoryChart.tsx`, `src/ui/screens/ProgressScreen.tsx`
**Commit:** `d7030c20`
**Applied fix:** Reused one hour-aware formatter across root/history presentation and covered 59:59, 1:00:00, and 23:59:59 boundaries.

### WR-03: Fence target and recommendation success feedback

**Files modified:** `src/ui/screens/ProgressScreen.tsx`, `src/ui/components/RunningTargetSheet.tsx`, `src/ui/__tests__/ProgressScreen.test.tsx`
**Commit:** `eaba8482`
**Applied fix:** Root success feedback now requires a non-obsolete matching authoritative read-back. Committed target refresh failures retain inline recovery and retry only the read. Superseded recommendations render the stale state and never produce a success toast.

### WR-04: Replace placeholder/proxy tests with outcomes

**Files modified:** `src/domains/progress/dashboardProjection.test.ts`, `tests/sqlite-host/progressRepository.test.ts`, `src/ui/__tests__/ProgressScreen.test.tsx`, `app/__tests__/session-route.test.tsx`
**Commits:** `bb6ea670`, `2147e216`, `87cc13fb`
**Applied fix:** Tests now assert period-specific facts, 501-row completion, active/current targets, target-only states, complete All/Strength hierarchy, bounded refresh, exact source revisions, and owner-visible sparse/recovery behavior.

### PRO-05 / PRO-12: Authoritative 2.4 km target and editable distance

**Files modified:** `src/domains/running/contracts.ts`, `src/bootstrap/runningPlanRuntime.tsx`, `src/ui/components/RunningTargetSheet.tsx`
**Commit:** `52739cc0`
**Applied fix:** The production Running goal parser establishes the owner-approved 2.4 km 11:00 target when no later owner revision exists. One active source plan now accepts explicit 2.4 km, 10 km, or Half Marathon revisions, while the sheet maintains independent distance drafts and leaves longer targets unset until entry.

### T-19-08-04 and exact focus/48dp return paths

**Files modified:** `tests/integration/bodyweight-history.test.ts`, `src/ui/components/RecommendationSurface.tsx`, `src/ui/components/FactualHistoryChart.tsx`, `src/ui/screens/ProgressScreen.tsx`
**Commit:** `d71cd628`
**Applied fix:** Bodyweight isolation now compares SHA-256 digests of exact protected target, recommendation, import, session, exercise, and set rows instead of counts. Recommendation and history source actions are 48dp and restore exact invoking focus; Settings-to-Bodyweight returns to its exact action.

## Security Threat Closure

| Threat | Closure evidence |
|---|---|
| T-19-01-04 | Complete Running/Strength data is paged to completion; chart data is owner-pageable and untruncated. |
| T-19-02-01 | Dashboard facts and active Running target sources share one SQLite snapshot. |
| T-19-02-03 | Range predicates, snapshot-local paging, complete data pages, and bounded retries are behavior-tested. |
| T-19-03-02 | Gap, comparator, current target, and Running pacing are prepared below the screen boundary. |
| T-19-03-04 | Generation changes cancel obsolete reads; 250/1000/4000 ms fallback is bounded and terminal. |
| T-19-04-03 | Semantic SVG sampling is bounded where possible; complete data uses 100-row UI pages without truncation. |
| T-19-04-04 | UI continues to receive typed display facts and opaque local source IDs/revisions only. |
| T-19-07-02 | Every production Keep/Use path writes a canonical SHA-256 durable receipt and supports relaunch replay. |
| T-19-07-04 | Superseded results remain non-success and cannot emit target-updated feedback. |
| T-19-08-04 | Exact protected-state byte/value digests prove bodyweight commands do not alter protected graphs. |
| T-19-09-02 | Recommendation and target messages require committed/already-committed authoritative read-back. |

## Verification

Verification ran in the isolated worktree `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p19-fix-data-live` on `agent-phase19-fix-data`. The worktree used a temporary read-only `node_modules` symlink to the orchestrator checkout only for dependency resolution; source, index, commits, and outputs remained isolated.

- `npm run typecheck`: passed
- `npm run lint`: passed, boundary check across 428 files
- `npm run check:boundaries`: passed, boundary check across 428 files
- Unit host: 149 suites / 2,426 tests passed
- Components/routes host: 98 suites / 912 tests passed
- SQLite host: 29 suites / 595 tests passed
- Integration host: 34 suites / 504 tests passed
- Exact Phase 19 integrity gate after coverage remediation: 310 suites / 4,438 tests passed
- Integrity coverage: 19 files, exactly 100% statements / branches / functions / lines
- `git diff --check`: passed
- Android/Gradle/APK, adb, emulator/device, Maestro, native evidence, native benchmark: `NOT_RUN`

## Atomic Commits

- `707ba616` — CR-01 / CR-03 pageable coherent Progress reads
- `bb6ea670` — CR-02 / CR-04 factual goal hierarchy
- `80e80943` — CR-06 durable recommendation receipts
- `a49d9d79` — CR-07 merge receipt preservation
- `2147e216` — CR-08 exact workout source revisions
- `d7030c20` — CR-13 / WR-01 / WR-02 factual chart correction
- `17328e93` — CR-05 bounded automatic refresh
- `eaba8482` — WR-03 target/recommendation success fencing
- `52739cc0` — PRO-05 / PRO-12 authoritative editable Running distance
- `d71cd628` — T-19-08-04 protected digests and exact focus
- `87cc13fb` — exact defensive Progress coverage

## Skipped Issues

None.

---

_Fixed: 2026-10-13T02:24:28Z_
_Fixer: TRAE (gsd-code-fixer)_
_Iteration: 1_
