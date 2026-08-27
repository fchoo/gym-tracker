---
phase: 04-overall-progress-and-complete-progression
plan: 08
subsystem: workout-history
tags: [sqlite, progression, effective-history, session-detail, accessibility]

requires:
  - phase: 03-calendar-and-history-integrity
    provides: effective history overlays with lifecycle and retained source target identities
  - phase: 04-overall-progress-and-complete-progression
    provides: versioned named non-load progression policy evaluation
provides:
  - deterministic raw and effective-history non-load outcomes on Session Detail
  - fail-closed policy identity resolution through immutable raw set rule snapshots and retained targets
  - read-only Workout details evidence with accessible exercise-history drill-downs
affects: [phase-05-release, workout-history, progression, session-detail]

actuals:
  tokens: 9424
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - Non-load policy results are deterministic Session Detail projections, never recommendation rows or target mutations.
    - Effective-history outcomes resolve policy identity from retained raw facts and fail closed on unresolved added, replaced, or malformed sets.

key-files:
  created: []
  modified:
    - src/domains/workout/sessionDetail.ts
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - src/ui/screens/SessionDetailScreen.tsx
    - tests/integration/starter-activation-repository.test.ts
    - src/ui/__tests__/WorkoutCompletionScreen.test.tsx

key-decisions:
  - "Session Detail carries typed non-actionable outcomes rather than a new mutable persistence authority."
  - "Raw immutable rule type/version and complete metric identity must match copied policy identity before any outcome is exposed."
  - "Effective overlays recalculate from corrected snapshots only when every set resolves one exact retained policy identity; voided or unresolved histories expose no outcome."
  - "Workout details show exact manual-review copy and source evidence without accept/reject target controls."

patterns-established:
  - "Fail-closed effective replay: use raw retained target links for policy identity and effective facts only for the evaluated evidence."
  - "Read-only policy presentation: pair rule/version, target, reason, fact count, and existing source-history action."

requirements-completed: [PROG-08]

coverage:
  - id: D1
    description: "Completed non-load source facts project deterministic versioned factual/manual outcomes while leaving recommendation rows and target values unchanged."
    requirement: PROG-08
    verification:
      - kind: integration
        ref: tests/integration/starter-activation-repository.test.ts#keeps copied non-load policies factual and never creates pending target writes
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D2
    description: "Workout details presents manual and factual outcomes as read-only evidence with exact manual-review copy and exercise-history drill-downs."
    requirement: PROG-08
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/WorkoutCompletionScreen.test.tsx#presents manual and factual non-load outcomes as read-only source evidence
        status: pass
    human_judgment: false

duration: 22m
completed: 2026-08-26
status: complete
---

# Phase 04 Plan 08: Deterministic Non-Load Outcome Exposure Summary

**Completed manual-hold and plan-authored non-load work now projects source-backed, versioned read-only outcomes from raw or effective session history, with no recommendation or target mutation.**

## Performance

- **Duration:** 22m
- **Started:** 2026-08-26T03:21:46Z
- **Completed:** 2026-08-26T03:44:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `SessionNonLoadOutcome` to the typed Workout Session Detail contract. Each value carries rule identity, policy evaluation result, immutable comparator evidence, stable source session/exercise/set IDs, and an effective revision.
- Replaced the prior evaluate-then-discard non-load branch with deterministic read projection. Raw sets must match immutable `rule_type`, `rule_version`, complete metric identity, and one copied policy identity through retained target links.
- Recalculated corrected and restored overlay results from their effective facts while resolving policy identity only through matching retained raw sets. Voided overlays suppress results; unresolved, replaced, added, malformed, or inconsistent facts fail closed.
- Added compact Workout details cards using the exact `Manual review` and `This target has no automatic change.` language. Each card exposes rule/version, current target, evidence count, reason, and an accessible exercise-history link without decision controls.

## Verification

- `npm run test:integration -- --runInBand tests/integration/starter-activation-repository.test.ts` — passed, 35 tests.
- `npm run test:components -- --runInBand src/ui/__tests__/WorkoutCompletionScreen.test.tsx` — passed, 14 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed; boundary check covered 215 files.
- `npm run check:boundaries` — passed; boundary check covered 215 files.
- `npm run test:coverage -- --runInBand` — passed; all unit, component, SQLite-host, and integration projects completed and the integrity coverage gate passed.
- `git diff --check` — passed before every task commit; no task commit deleted tracked files.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1: Project versioned non-load outcomes from immutable/effective session facts** — `316d580` (test, RED), `0d5722a` (feat, GREEN), and `a9854b7` (fix, effective added-set source identity)
2. **Task 2: Present manual and factual outcomes in Workout details** — `e83aad5` (test, RED) and `327a7ba` (feat, GREEN)

_All task commits include the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer._

## Files Created/Modified

- `src/domains/workout/sessionDetail.ts` — defines the immutable, non-actionable non-load outcome contract.
- `src/domains/workout/index.ts` — exports the Session Detail outcome type.
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` — projects raw/effective outcomes, strictly validates identities, suppresses voided history, and removes non-load result discard.
- `tests/integration/starter-activation-repository.test.ts` — asserts fixed distance/time/interval factual outcomes and preserved no-write behavior.
- `src/ui/screens/SessionDetailScreen.tsx` — renders read-only policy evidence and source history actions.
- `src/ui/__tests__/WorkoutCompletionScreen.test.tsx` — verifies manual/factual card content, accessible drill-down, and absence of decision actions.
- `src/bootstrap/workoutAppRuntime.test.tsx` — supplies the required empty outcome collection in its Session Detail fixture.

## Decisions Made

- Retained SQLite session facts and the Phase 3 effective-history overlay as the only outcome authority; no migration, recommendation entity, or mutable target path was added.
- Required exact source policy identity rather than inferring legacy policy IDs from a profile. Unsupported or ambiguous legacy policy rules produce no outcome.
- Used raw target-linked snapshots for policy identity and effective snapshot values for corrected/restored evidence. This preserves replayability without showing stale source data.
- Reused existing exercise-history navigation instead of introducing a new route or control surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected effective added-set source identity**
- **Found during:** Task 1 (effective-history projection audit)
- **Issue:** An effective added set used a retained raw set to resolve policy identity, so its output source ID would have reported the raw set instead of the effective set.
- **Fix:** Preserved the effective set ID in output while continuing to resolve policy identity from retained raw facts.
- **Files modified:** `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`
- **Verification:** Typecheck, focused integration/components, and full integrity coverage all passed.
- **Committed in:** `a9854b7`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug).
**Impact on plan:** Necessary replayability correction only; no architectural expansion or new authority.

## Issues Encountered

- Two Session Detail test fixtures required an explicit empty `nonLoadOutcomes` collection after the contract became required; updated as direct compile-time fixture maintenance.
- The UI RED test initially selected a duplicated evidence label with `getByText`; it was refined to assert both expected evidence rows.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PROG-08 is source-complete with deterministic non-load outcomes, read-only history evidence, and no target mutation path.
- Phase 4’s gap closure plans are complete. Native/device/attended approval and Terminal Seal remain exclusively owned by Phase 5 Plan 05-07.

## Self-Check: PASSED

- All seven modified implementation/test files exist.
- Task commits `316d580`, `0d5722a`, `a9854b7`, `e83aad5`, and `327a7ba` exist in git history.

---

*Phase: 04-overall-progress-and-complete-progression*
*Plan: 08*
*Completed: 2026-08-26*
