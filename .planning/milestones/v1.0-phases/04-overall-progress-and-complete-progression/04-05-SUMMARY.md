---
phase: 04-overall-progress-and-complete-progression
plan: 05
subsystem: progression
tags: [sqlite, progression, recommendations, evidence, compare-and-swap]

requires:
  - phase: 03-calendar-and-history-integrity
    provides: revision-fenced effective history and correction invalidation scopes
  - phase: 04-overall-progress-and-complete-progression
    provides: copied-policy eligibility and load/reps recommendation evaluation
provides:
  - versioned, profile-aware actionable recommendation evidence envelopes
  - additive database enforcement for complete pending v2 evidence in legacy and owned graphs
  - transactional evidence validation, target compare-and-swap acceptance, and stale supersession
affects: [04-06-progress-recommendation-review, phase-05-release]

tech-stack:
  added: [zod evidence parser, SQLite v15 additive evidence triggers]
  patterns:
    - pending v2 evidence is persisted only when structurally complete and identity-bound
    - acceptance validates the complete source and target scope before any target mutation
    - invalid, stale, or unverifiable evidence remains audit history as superseded

key-files:
  created:
    - src/domains/progression/recommendationContracts.ts
    - src/platform/sqlite/migrations/0015_progression_evidence.ts
    - src/domains/progression/recommendationContracts.test.ts
    - tests/sqlite-host/progressionEvidenceRepository.test.ts
  modified:
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - src/platform/sqlite/migrations/index.ts
    - tests/integration/load-reps.test.ts
    - tests/integration/starter-activation-repository.test.ts
    - tests/integration/workout-outcomes.test.ts
    - tests/sqlite-host/historyProjectionRepository.test.ts

key-decisions:
  - "Historical v1 recommendation rows remain audit-readable; only actionable pending v2+ evidence fails closed."
  - "Later workouts do not invalidate immutable completed source evidence. Source lifecycle/revision, target scope/revision, identity, policy, or envelope mismatch supersedes it."
  - "Every target in the stored occurrence scope must pass its own compare-and-swap update before an acceptance decision is committed."

requirements-completed: [PROG-09, PROG-10]

coverage:
  - id: D1
    description: "Actionable recommendation envelopes enforce exact rule, metric identity, source/target revisions, lifecycle, and target-scope parity."
    requirement: "PROG-09"
    verification:
      - kind: unit
        ref: "src/domains/progression/recommendationContracts.test.ts"
        status: pass
      - kind: sqlite-host
        ref: "tests/sqlite-host/progressionEvidenceRepository.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only an explicit, still-current acceptance mutates an entire future target scope; stale, malformed, legacy, manually edited, or voided-source evidence is preserved but cannot write targets."
    requirement: "PROG-10"
    verification:
      - kind: integration
        ref: "tests/integration/load-reps.test.ts"
        status: pass
      - kind: integration
        ref: "tests/integration/starter-activation-repository.test.ts"
        status: pass
    human_judgment: false

status: complete
---

# Phase 4 Plan 05: Recommendation Evidence Lifecycle Summary

**Recommendations now carry a validated v2 evidence envelope and can change future targets only through a source- and target-revision-fenced transaction.**

## Accomplishments

- Added a strict, profile-aware evidence contract with explicit rule, metric identity, completed source session/exercise/set IDs, source and target revisions, full target scope, current/proposed targets, decision rationale, confidence, and lifecycle timestamp.
- Added migration 15 with triggers for both legacy and owned recommendation graphs. Existing v1 audit history remains readable, while malformed or incomplete pending v2 content is rejected at persistence time.
- Refactored recommendation generation to write v2 evidence, preserve same-revision replay idempotency, and scope an occurrence recommendation across every target row.
- Refactored acceptance to validate the evidence envelope, source lifecycle/revision, target identity/scope/revisions, and every target compare-and-swap before recording acceptance. Any stale or malformed evidence becomes `superseded` without mutating a target.
- Added regression coverage for legacy target compatibility, source/target drift, incomplete scopes, replay conflicts, repeat decisions, discard behavior, and duplicate legacy/owned invalidation scopes.

## Verification

- `npm run test:unit -- --runInBand src/domains/shared/tooling.test.ts src/domains/progression/recommendationContracts.test.ts` — passed.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressionEvidenceRepository.test.ts tests/sqlite-host/historyProjectionRepository.test.ts` — passed.
- `npm run test:integration -- --runInBand tests/integration/load-reps.test.ts tests/integration/starter-activation-repository.test.ts tests/integration/workout-outcomes.test.ts` — passed.
- `npm run test:coverage -- --runInBand` — passed: 117 suites, 1,940 tests; 90.50% statements, 85.00% branches, 90.00% functions, 90.80% lines; all 69 integrity-critical files reached 100% on every metric.

## Decisions Made

- An unsuccessful acceptance is an audit-preserving state transition, not an exception that leaves stale pending content active: malformed, mismatched, or stale evidence is marked `superseded`.
- Immutable completed source sessions remain valid despite later unrelated workouts; only changes to their own revision/lifecycle invalidate their evidence.
- The v15 migration is additive. It protects new actionable writes without rewriting historic evidence.

## Deferred Verification

Android native generation, emulator/device execution, Maestro, benchmarks, attended approval, and Terminal Seal remain deferred to the shared final Phase 5 gate. No owner approval artifact was created.

## Next Phase Readiness

- The Progress/recommendation review surface can now present every pending recommendation from stable evidence and route its explicit accept or keep-current decision through the typed runtime boundary.
- Device-level verification remains deliberately deferred.

---

*Phase: 04-overall-progress-and-complete-progression*
*Plan: 05*
*Completed: 2026-08-25*
