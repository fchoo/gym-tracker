---
phase: 17-library-running-plans
plan: "06"
subsystem: starter-plan UI and SQLite activation boundary
tags: [starter-plans, activation, sqlite, map-01, immutable-history, accessibility]
requires:
  - phase: 13
    provides: per-sport MAP-01 activation, receipt fences, and source revision contracts
  - phase: 14
    provides: accessible confirmation, focus restoration, and presentation primitives
provides:
  - immutable starter preview with explicit inactive editable-copy creation
  - sport-scoped starter activation review and stale-preview refresh
  - confirmation-gated template-update copies with fresh revision readback
affects: [17-07, 17-08, library, plan-editor, running-plans]
tech-stack:
  added: []
  patterns: [bundle-to-owned-copy, receipt-backed-readback, sport-scoped-activation, confirmation-before-copy]
key-files:
  created: []
  modified:
    - app/library/starter/[templateId].tsx
    - src/bootstrap/workoutAppRuntime.tsx
    - src/platform/sqlite/repositories/starterPlanRepository.ts
    - src/ui/screens/StarterPlanDetailScreen.tsx
    - src/ui/screens/StarterActivationScreen.tsx
    - src/ui/screens/TemplateUpdateScreen.tsx
    - src/ui/__tests__/StarterPlans.test.tsx
key-decisions:
  - "Starter save creates a fresh inactive owned copy and routes to editing only after durable commit and authoritative refresh."
  - "Strength starter activation reads and mutates only Strength schedule state; Running remains unaffected under MAP-01."
  - "Template-update copies re-read the comparison immediately after the user confirms, so creation uses current revisions while preserving existing history."
actuals:
  tokens: 68447
  tasks: 3
  commits: 6
requirements-completed: [LIB-10, LIB-11, LIB-12, LIB-15, LIB-23]
coverage:
  - id: D1
    description: Immutable starters save a fresh inactive editable copy without activation.
    requirement: LIB-10
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/StarterPlans.test.tsx#starter detail
        status: pass
      - kind: unit
        ref: src/domains/plans/activateStarterPlan.test.ts#creates an inactive independent copy without an activation confirmation token
        status: pass
    human_judgment: false
  - id: D2
    description: Explicit starter activation remains reviewed, receipt-fenced, and scoped to Strength without changing Running.
    requirement: LIB-11
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/StarterPlans.test.tsx#starter activation
        status: pass
      - kind: integration
        ref: tests/integration/starter-activation-repository.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/multi-plan-foundation-tracer.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Template-update comparison creates a confirmed inactive independent copy without rewriting the current owned plan or history.
    requirement: LIB-12
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/StarterPlans.test.tsx#starter template update
        status: pass
    human_judgment: false
  - id: D4
    description: Starter flows retain Phase 14 focus restoration, Back navigation, loading, error, retry, and accessible action states.
    requirement: LIB-15
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/StarterPlans.test.tsx
        status: pass
    human_judgment: false
  - id: D5
    description: Bundled starter hashes and source revisions remain the authority for new owned copies.
    requirement: LIB-23
    verification:
      - kind: unit
        ref: src/domains/plans/activateStarterPlan.test.ts
        status: pass
    human_judgment: false
duration: 7m
completed: 2026-10-11
status: complete
---

# Phase 17 Plan 06: Starter preview, activation, and updates Summary

Immutable bundled starters now create independently editable inactive owned copies, while reviewed Strength activation and template updates retain source hashes, current revisions, MAP-01 boundaries, and immutable prior history.

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-11T02:29:09+08:00
- **Completed:** 2026-10-11T02:36:31+08:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added the explicit `Save editable copy` starter-detail action. It writes a fresh inactive plan through the receipt-backed runtime, refreshes trusted state, and then opens the user-owned editor; bundled source rows and history are not edited.
- Made starter activation explicitly Strength-scoped in its review copy and persistence reads. The current strength schedule is refreshed after a stale confirmation while in-progress workouts, existing-copy selection, confirmation, and focus restoration remain protected.
- Added a reviewed confirmation for template-update copies. After confirmation, the screen reloads the comparison to bind creation to current revisions, then creates only a fresh inactive copy; cancellation and failure preserve the original owned copy, schedule, draft, and history.

## Task Commits

1. **Task 1: Preview and save one immutable starter as an inactive owned copy** — `b2dfc92a` (test), `cecc726a` (feat)
2. **Task 2: Confirm actual affected schedules before starter activation** — `66b85991` (test), `a6dbe703` (feat)
3. **Task 3: Preserve template-update comparison and independent-copy recovery** — `ec682c71` (test), `8e6ec43a` (feat)

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/StarterPlans.test.tsx` — passed (14 tests).
- `npm run test:unit -- --runInBand src/domains/plans/activateStarterPlan.test.ts` — passed (26 tests).
- `npm run test:integration -- --runInBand tests/integration/starter-activation-repository.test.ts tests/integration/multi-plan-foundation-tracer.test.ts` — passed (46 tests).
- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` — passed.

## Decisions Made

- Creation and copy actions never activate a plan. Activation remains a separate current-preview confirmation flow.
- A direct bundled-template copy is identified by the accepted template revision and remains source-hash validated inside the existing receipt-backed writer.
- Sport-scoped filtering is feature-detected so retained pre-Phase-13 databases preserve their former singleton behavior during recovery.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added the direct bundled-template copy writer path.**

- **Found during:** Task 1
- **Issue:** Starter detail exposed only activation; the existing inactive-copy writer required an already owned source plan, so the requested `Save editable copy` behavior could not create a fresh user-owned copy.
- **Fix:** Added the receipt-backed runtime/repository path, accepted-source identity, authoritative refresh, and editor routing for a new inactive copy.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/platform/sqlite/repositories/starterPlanRepository.ts`, starter route/screen/test files.
- **Verification:** Focused starter component and domain tests passed.
- **Committed in:** `cecc726a`

**2. [Rule 1 - Bug] Restored retained-schema compatibility for sport-scoped activation reads.**

- **Found during:** Task 2 integration verification
- **Issue:** Pre-Phase-13 retained database fixtures do not contain `plan_kind`; unconditionally filtering the new current-schema query failed recovery reads.
- **Fix:** Feature-detect the durable `plan_kind` column: current schemas enforce Strength-only reads, retained schemas use their existing singleton behavior.
- **Files modified:** `src/platform/sqlite/repositories/starterPlanRepository.ts`
- **Verification:** `starter-activation-repository.test.ts` and `multi-plan-foundation-tracer.test.ts` passed.
- **Committed in:** `a6dbe703`

**3. [Rule 3 - Blocking verification correction] Replaced a non-existent planned integration filename with the landed MAP-01 tracer.**

- **Found during:** Task 2 verification
- **Issue:** `tests/integration/multi-plan-activation.test.ts` does not exist in this checkout.
- **Fix:** Ran the corresponding landed focused proof, `tests/integration/multi-plan-foundation-tracer.test.ts`, alongside the starter activation repository test.
- **Files modified:** None.
- **Verification:** Both focused integration suites passed.
- **Committed in:** `a6dbe703`

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3). All changes preserve the planned trust boundaries and add no new deployment, native, or global verification scope.

## Known Stubs

None.

## Next Phase Readiness

Starter routes now preserve the immutable bundled/user-owned boundary, source revision hashes, explicit activation confirmation, current-preview reload, MAP-01 per-sport isolation, independent-copy recovery, and Phase 14 Back/focus/accessibility conventions.

## Self-Check: PASSED

- All seven modified production/test files and this summary exist.
- Task commits `b2dfc92a`, `cecc726a`, `66b85991`, `a6dbe703`, `ec682c71`, and `8e6ec43a` exist on `fchoo/UX-revamp`.
