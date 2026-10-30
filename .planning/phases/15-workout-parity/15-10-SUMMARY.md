---
phase: 15-workout-parity
plan: "10"
subsystem: workout-outcomes-and-plan-writeback
tags: [react-native, sqlite, workout-outcomes, idempotency, revision-guards, accessibility]
requires:
  - phase: 15-09
    provides: Active workout action dock, saved-workout completion route, and completion write-back port
provides:
  - Commit-gated terminal workout outcomes with operation-specific recovery
  - Factual completion review and source-derived default-No plan write-back rows
  - Token-bound plan target application that retains immutable workout history
affects: [15-11, 15-12, 15-13, workout-completion, plan-impact]
actuals:
  tokens: 7943
  tasks: 3
  commits: 9
tech-stack:
  added: []
  patterns:
    - Terminal outcome retries reuse the original revision and confirmation envelope
    - Plan write-back displays typed source-produced target deltas rather than UI-inferred proposals
key-files:
  created: []
  modified:
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/screens/WorkoutCompletionScreen.tsx
    - src/domains/plans/planImpactCommands.ts
key-decisions:
  - "Resolved terminal outcome results are validated against the exact saved session ID and expected terminal status before navigation."
  - "Unknown terminal receipts re-read durable session facts before choosing navigation or the original retry envelope."
  - "A preview without supported factual target rows is a Keep-only default-No state, even when other composition facts differ."
patterns-established:
  - "Terminal outcome failure keeps the Active screen and source facts intact, with retry using the original input envelope."
  - "Plan write-back rows carry metric identity, typed current/proposed targets, and units from the domain layer."
requirements-completed: [WRK-33, WRK-34, WRK-35, WRK-36]
coverage:
  - id: D1
    description: Commit-gated finish, partial, zero-set, discard, and retry outcomes retain Active facts until the authoritative result.
    requirement: WRK-34
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/workout-outcomes.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Completion presents durable factual context and remains usable when summary derivation fails.
    requirement: WRK-35
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/WorkoutCompletionScreen.test.tsx
        status: pass
      - kind: automated_ui
        ref: app/__tests__/completion-route.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Plan write-back exposes typed source-derived changes, defaults to Keep, and revalidates the token-bound atomic apply.
    requirement: WRK-36
    verification:
      - kind: unit
        ref: src/domains/plans/planImpactCommands.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/plan-impact-replacement.test.ts
        status: pass
    human_judgment: false
duration: 11m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 10: Active Outcome and Saved-Workout Journey Summary

**Commit-gated workout outcomes with factual completion review and default-No, revision-bound plan target write-back.**

## Performance

- **Duration:** 17m
- **Started:** 2026-10-10T14:00:19Z
- **Completed:** 2026-10-10T14:17:30Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Finish, partial, zero-set, and discard stay on Active until an authoritative matching terminal result returns; an unknown receipt first re-reads durable session facts before it can route or offer the original retry envelope.
- Completion continues to present saved facts, actual counts, results, optional effort, details, and a projection-only summary retry path.
- Plan write-back now emits typed current/proposed/unit target rows from canonical domain facts, applies only after source/token/revision revalidation, and exposes a Keep-only no-difference state.

## Task Commits

1. **Task 1: Finish one workout through commit-gated outcome and completion routing**
   - `51387cd`: failing finish recovery coverage
   - `42a6a96`: commit-gated finish routing and recovery
   - `a28ab5b`: failing unknown-outcome durable reload coverage
   - `ee99ff9`: reload unknown terminal outcomes before deciding
2. **Task 2: Cover partial, later, zero-set, discard, and factual completion review**
   - `b21f024`: failing partial recovery coverage
   - `11fe3e4`: operation-specific terminal outcome recovery
3. **Task 3: Produce and apply factual default-No plan changes**
   - `42fea38`: failing typed plan-impact coverage
   - `8576752`: failing plan-preview presentation coverage
   - `7861da1`: factual default-No plan write-back rendering

## Files Created/Modified

- `src/ui/screens/ActiveWorkoutScreen.tsx` — validates terminal results, re-reads source facts for unknown receipts, preserves Active state on failure, and retries the original finish/partial/zero-set/discard command envelope.
- `app/workout/[sessionId].tsx` — owns the authoritative session-detail reload used to resolve unknown terminal receipts before navigation.
- `src/ui/screens/WorkoutCompletionScreen.tsx` — renders factual plan target rows and the Keep-only no-difference sheet.
- `src/domains/plans/planImpactCommands.ts` — emits typed source-derived current/proposed target changes alongside the signed preview composition.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — covers finish and partial recovery paths.
- `src/ui/__tests__/WorkoutCompletionScreen.test.tsx` — covers factual row rendering and no-difference default-No behavior.
- `src/domains/plans/planImpactCommands.test.ts` — covers canonical typed target deltas.

## Decisions Made

- Terminal navigation is permitted only after the command returns the requested session ID with its expected completed, partial, zero-set, or discarded status.
- A mismatched terminal receipt is not trusted: the route reloads the requested session's durable detail, and the screen routes only if that detail confirms the expected terminal status.
- Target deltas are canonical domain data; presentation formats those typed values but never derives proposed targets from workout result strings.
- No supported target difference means no Save action. Closing or choosing Keep leaves the completed workout and future plan unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated typed preview fixtures for the required target-change contract**

- **Found during:** Task 3
- **Issue:** Existing runtime and route fixtures omitted the new required `changes` field, blocking typecheck.
- **Fix:** Added explicit empty factual-change arrays to the affected test fixtures.
- **Files modified:** `app/__tests__/completion-route.test.tsx`, `src/bootstrap/ownedPlanRuntime.test.ts`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/domains/workout/outcomes.test.ts`
- **Verification:** `npm run typecheck` passed.
- **Committed in:** `8576752`

**Impact on plan:** The contract update is required for the source-produced preview rows and does not broaden runtime scope.

**2. [Rule 1 - Bug] Reconciled unknown terminal receipts before routing**

- **Found during:** Final integrity review of Task 1.
- **Issue:** A mismatched terminal command result stayed Active but did not reload the authoritative session detail before choosing recovery; successful fallback routing also used the untrusted response ID.
- **Fix:** Added a route-owned durable session-detail resolver for mismatched finish, partial, zero-set, and discard receipts, then route only with the requested session identity after its expected durable status is confirmed.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, `app/workout/[sessionId].tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** Focused component tests, typecheck, lint, and boundaries passed.
- **Committed in:** `a28ab5b`, `ee99ff9`

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)

## Issues Encountered

- The first red outcome tests exposed unhandled terminal command rejections; the final state machine now keeps the Active view intact and presents operation-specific retry recovery.

## Known Stubs

None.

## Next Phase Readiness

- Saved-workout outcomes and plan write-back are ready for downstream Phase 15 surface work.
- No native matrix was run: the requested checkpoint was limited to relevant component, unit, integration, typecheck, lint, and boundary checks.

## Self-Check: PASSED

- Required source files and the summary exist.
- All nine task commits are present in git history.

---
*Phase: 15-workout-parity*
*Completed: 2026-10-10*
