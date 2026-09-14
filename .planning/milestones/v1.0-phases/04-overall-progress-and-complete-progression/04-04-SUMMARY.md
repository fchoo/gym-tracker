---
phase: 04-overall-progress-and-complete-progression
plan: 04
subsystem: progression
tags: [sqlite, progression, copied-plans, policy-registry, metrics]

requires:
  - phase: 02-owned-library-and-planning
    provides: immutable copied plan policies, targets, and metric identities
  - phase: 04-overall-progress-and-complete-progression
    provides: deterministic load/reps progression baseline
provides:
  - fail-closed dispatch for named and versioned copied-plan non-load policies
  - factual fixed-target outcomes that preserve immutable comparator boundaries
  - owned load/reps automatic progression gated by the exact copied policy and rule identity
affects: [04-05-recommendation-lifecycle, 04-06-progress-recommendation-review, phase-05-release]

actuals:
  tokens: 16000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - copied policy IDs, versions, metric identities, and serialized rule identity must all agree before behavior is evaluated
    - unrecognized or malformed copied policy data fails closed without pending target writes

key-files:
  created:
    - src/domains/progression/planAuthoredV1.ts
    - src/domains/progression/policyRegistry.ts
    - src/domains/progression/planAuthoredV1.test.ts
  modified:
    - src/domains/progression/index.ts
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - tests/integration/starter-activation-repository.test.ts

key-decisions:
  - "Manual, unknown, malformed, identity-mismatched, and unsupported-version copied policies never reach automatic target recommendation generation."
  - "Fixed distance, fixed time, and interval policies produce factual non-actionable outcomes; no generic non-load coaching is inferred."
  - "Owned load/reps uses the existing automatic evaluator only when its persisted policy and serialized rule both equal load_reps.double_progression.v1 at version 1. Legacy load/reps behavior remains compatible."

patterns-established:
  - "Policy routing: validate the copied policy record, its serialized rule identity, and full metric identity before evaluating progression."

requirements-completed: [PROG-08]

coverage:
  - id: D1
    description: "Named copied-plan manual and fixed-target policies preserve metric-specific evidence and fail closed."
    requirement: "PROG-08"
    verification:
      - kind: unit
        ref: "src/domains/progression/planAuthoredV1.test.ts"
        status: pass
      - kind: integration
        ref: "tests/integration/cross-profile-workout.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Owned load/reps recommendations require the exact automatic copied policy and cannot be produced from manual or malformed policy data."
    requirement: "PROG-08"
    verification:
      - kind: integration
        ref: "tests/integration/starter-activation-repository.test.ts#does not apply load/reps progression for a manual or malformed copied policy"
        status: pass
      - kind: integration
        ref: "tests/integration/load-reps.test.ts"
        status: pass
    human_judgment: false

duration: 1h 20m
completed: 2026-08-24
status: complete
---

# Phase 4 Plan 04: Named Copied-Plan Policy Registry Summary

**Copied-plan progression now accepts only exact named/versioned policy contracts, retaining fixed targets as factual evidence and preventing manual load/reps policies from entering automatic recommendations.**

## Performance

- **Duration:** 1h 20m
- **Completed:** 2026-08-24
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a deterministic policy registry for approved manual-hold and plan-authored fixed distance, fixed time, and interval policies.
- Validated metric identity, target/source-fact contracts, serialized rule identity, and immutable comparator boundaries before returning a non-actionable factual or manual outcome.
- Routed owned load/reps through automatic double progression only when its copied row and rule JSON both declare `load_reps.double_progression.v1` version 1; legacy graphs preserve their established behavior.
- Added a real SQLite regression fixture for the copied Band Pull Apart manual hold and a tampered policy-rule variant, both of which create no pending target recommendation.

## Verification

- `npm run test:unit -- --runInBand src/domains/progression/planAuthoredV1.test.ts` — 11 passed.
- `npm run test:integration -- --runInBand tests/integration/cross-profile-workout.test.ts tests/integration/load-reps.test.ts tests/integration/starter-activation-repository.test.ts` — 53 passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed; boundary check covered 204 files.
- `git diff --check` — passed.

## Task Commits

1. **Tasks 1–2: registry, repository integration, and SQLite regression coverage** — recorded in the Plan 04-04 implementation commit.

## Files Created/Modified

- `src/domains/progression/planAuthoredV1.ts` — deterministic non-load policy evaluation and immutable comparator checks.
- `src/domains/progression/policyRegistry.ts` — exact named/versioned policy dispatch with manual fallbacks.
- `src/domains/progression/planAuthoredV1.test.ts` — unit fixtures for manual, fixed-target, unknown, mismatch, and protocol-error outcomes.
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` — copied policy lookup and owned automatic load/reps gate.
- `tests/integration/starter-activation-repository.test.ts` — persisted copied-policy behavior, including manual/malformed load/reps policy rejection.

## Decisions Made

- Automatic behavior is a copied-plan capability, not a metric-profile default for owned plans.
- Manual and plan-authored non-load outcomes remain non-actionable until a future explicit rule deliberately introduces an owner-reviewed action.

## Deviations from Plan

### Auto-fixed Issues

**1. Owned manual load/reps policy bypassed the copied-policy registry**

- **Found during:** final integration review of Task 2.
- **Issue:** the repository routed every `load_reps` owned target to automatic double progression solely from its metric profile, allowing `load_reps.manual_hold.v1` to create a pending recommendation.
- **Fix:** required exact automatic policy identity, full metric identity, and matching serialized rule JSON before invoking the automatic evaluator.
- **Files modified:** `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`, `tests/integration/starter-activation-repository.test.ts`.
- **Verification:** focused regression initially failed with one pending recommendation; it now passes alongside 53 relevant integration tests.
- **Committed in:** the Plan 04-04 implementation commit.

**Total deviations:** 1 auto-fixed correctness issue.

**Impact on plan:** the fix strengthens the plan’s fail-closed requirement without broadening policy scope.

## Issues Encountered

- The initial policy-routing branch was too coarse for owned `load_reps` data. The added persisted fixture proved the behavior and constrained the repair to copied-policy eligibility.

## User Setup Required

None — no external configuration or attended device work is required for this automated policy layer.

## Next Phase Readiness

- Phase 4 can now build stored recommendation lifecycle behavior on explicit policy outcomes rather than profile-only inference.
- Native/device verification remains intentionally deferred to the shared final Phase 5 gate.

---

*Phase: 04-overall-progress-and-complete-progression*
*Completed: 2026-08-24*
