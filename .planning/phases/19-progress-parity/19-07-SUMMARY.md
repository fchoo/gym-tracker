---
phase: 19-progress-parity
plan: "07"
subsystem: progression, sqlite-portability, ui
tags: [recommendations, sqlite, receipts, backup, restore, merge, react-native, accessibility]

requires:
  - phase: 19-02
    provides: snapshot-safe Progress runtime and authoritative recommendation facts
  - phase: 14
    provides: BottomSheet dismissal, focus, and modal-isolation semantics
provides:
  - Durable immutable receipts for explicit Keep/Use target recommendations in both legacy and owned graphs
  - Schema v45 and logical backup format v10 portability for recommendation-decision receipts
  - Accessible explicit Review target sheet with authoritative read-back success and persistent retry
affects: [progression, logical-backup, logical-restore, logical-merge, ProgressScreen]

actuals:
  tokens: 18680
  tasks: 2
  commits: 8

tech-stack:
  added: []
  patterns:
    - Canonical scalar request envelopes hash to immutable SQLite receipt records inside the exclusive command transaction
    - Current-format-only portability evolves schema artifacts while frozen historical registries remain unchanged
    - BottomSheet owns presentation and cancellation; the caller owns command state and authoritative refresh

key-files:
  created:
    - src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts
  modified:
    - src/domains/progression/recommendationCommands.ts
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - src/ui/components/RecommendationSurface.tsx
    - src/domains/portability/backupContracts.ts
    - src/platform/sqlite/repositories/logicalBackupRepository.ts
    - src/platform/sqlite/repositories/logicalRestoreRepository.ts
    - src/domains/portability/mergePlan.ts
    - src/platform/sqlite/repositories/logicalMergeRepository.ts

key-decisions:
  - "Durable immutable receipts are separate source facts and never actionable-evidence JSON."
  - "Receipt rows follow their recommendation owner graphs during merge, not an independent source graph."
  - "Recommendation presentation observes promise failures but never treats a void route callback as committed success."

patterns-established:
  - "Recommendation decision: validate the fixed-order revision-fenced envelope, replay the matching receipt, or atomically commit mutation, lifecycle, and receipt before acknowledging."
  - "Current portability format: add current receipt tables and trigger handling only to v10 while v1-v9 table registries stay frozen."

requirements-completed: [PRO-14, PRO-15]

coverage:
  - id: D1
    description: Explicit review and exactly-once Use target decision with revision-fenced replay
    requirement: PRO-14
    verification:
      - kind: unit
        ref: src/domains/progression/recommendationCommands.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/load-reps.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Explicit Keep, dismiss, busy, failure/retry, source navigation, and historical read-only recommendation states
    requirement: PRO-15
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RecommendationSurface.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/load-reps.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Current-schema recommendation receipt portability through backup, restore, and merge without source-row leakage
    verification:
      - kind: integration
        ref: tests/sqlite-host/cleanInstallRestore.test.ts; tests/sqlite-host/logicalRestoreRepository.test.ts; tests/sqlite-host/logicalMergeRepository.test.ts
        status: pass
    human_judgment: false

duration: 1h 12m
completed: 2026-10-12
status: complete
---

# Phase 19 Plan 07: Explicit Recommendation Review Summary

**Immutable v45 decision receipts make explicit Keep/Use target reviews replay-safe and revision-fenced, with v10 portable backup/restore/merge behavior and an accessible authoritative Review target sheet.**

## Performance

- **Duration:** 1h 12m
- **Started:** 2026-10-12T16:30:11Z
- **Completed:** 2026-10-12T17:42:27Z
- **Tasks:** 2/2
- **Files modified:** 22

## Accomplishments

- Added immutable legacy and owned recommendation-decision receipt tables, canonical 64-character request hashing, changed-payload conflicts, authoritative `already_committed` replay, and exclusive commit-before-acknowledgement semantics.
- Registered schema v45 and logical backup v10 without modifying frozen historical migration or backup-format artifacts; backup generation, restore, and merge preserve receipt facts only within their owning recommendation graph.
- Replaced implicit recommendation outcomes with an explicit accessible Review target BottomSheet: named Keep/Use decisions, no-write cancellation, shared busy lock, persistent inline recovery, source navigation, and historical read-only rendering.
- Proved current migration, backup/restore/merge, command, integration, component, type, boundary, lint, diff, and focused 100% integrity coverage gates.

## Task Commits

Each task was committed atomically:

1. **Task 1: Review and Use one fresh target recommendation exactly once** - `efb69fe3` (test), `384e9ad6` (feat), `23952006` (fix)
2. **Task 2: Complete Keep, dismiss, busy, stale, failure, retry, and historical states** - `11b546ef` (feat), `d406afcb` (fix), `dfe088c3` (fix), `4abef7a4` (fix), `b0d27529` (test)

## Files Created/Modified

- `src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts` - Adds immutable legacy and owned receipt tables plus backup-generation triggers.
- `src/platform/sqlite/migrations/index.ts` - Registers schema v45 deterministically.
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` - Validates/replays/commits receipt-backed decisions under the existing exclusive transaction.
- `src/domains/progression/recommendationCommands.ts` - Creates fixed-order canonical revision-fenced decision request envelopes.
- `src/ui/components/RecommendationSurface.tsx` - Renders the authoritative Review target sheet and read-only history.
- `src/domains/portability/backupContracts.ts` - Adds v10 receipt tables while freezing v1-v9 contracts.
- `src/platform/sqlite/repositories/logicalBackupRepository.ts` - Exports only receipt rows owned by the selected recommendation graph.
- `src/platform/sqlite/repositories/logicalRestoreRepository.ts` - Suspends and restores receipt/backup triggers around logical restore.
- `src/domains/portability/mergePlan.ts` and `src/platform/sqlite/repositories/logicalMergeRepository.ts` - Keep receipt rows in owner aggregates and verify recommendation closure.
- `tests/integration/load-reps.test.ts` and focused SQLite/component suites - Prove replay, conflict, portability, and explicit review behavior.

## Decisions Made

- Receipts remain immutable, normalized source facts rather than evidence JSON, so duplicate request identity can return the original bounded committed result without changing target facts a second time.
- Legacy and owned receipts travel with the recommendation-owner aggregate in logical merge; source graph classification remains limited to source-root facts.
- The Review target sheet has no workflow authority on dismiss. Success is possible only after committed/already-committed authoritative read-back; a generic failure preserves visible evidence and offers `Retry target decision`.

## Verification

- `npm run test:unit -- --runInBand src/domains/progression/recommendationCommands.test.ts` — passed.
- `npm run test:integration -- --runInBand tests/integration/load-reps.test.ts` — passed.
- `npm run test:components -- --runInBand src/ui/__tests__/RecommendationSurface.test.tsx` — 22 tests passed.
- Migration effects, clean-install restore, logical restore, logical merge, backup repository, and current-format portability suites — passed.
- `npm run typecheck`, `npm run check:boundaries`, `npm run lint`, and `git diff --check` — passed.
- Focused integrity gate — 11 suites / 425 tests passed; `backupContracts.ts`, `mergePlan.ts`, `restoreCommands.ts`, `recommendationCommands.ts`, `logicalBackupRepository.ts`, `logicalMergeRepository.ts`, and `logicalRestoreRepository.ts` each reached 100% statements, branches, functions, and lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added durable portable recommendation-decision receipts**
- **Found during:** Task 1 (Review and Use one fresh target recommendation exactly once)
- **Issue:** The planned acknowledgement-loss replay contract required a durable request identity, canonical hash, and bounded committed result, but the current schema had no receipt source facts for either legacy or owned recommendation graph. Status-only idempotency or evidence-JSON encoding could not satisfy the explicit replay, privacy, audit, and portability invariants.
- **Fix:** Added the smallest current-schema migration (v45), immutable receipt insert semantics, current v10 logical format support, backup-generation/source trigger handling, restore handling, owner-graph merge closure, and focused proof. Frozen historical migrations and v1-v9 format registries remain unchanged.
- **Files modified:** `src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts`, `src/platform/sqlite/migrations/index.ts`, `src/domains/portability/backupContracts.ts`, `src/platform/sqlite/repositories/logicalBackupRepository.ts`, `src/platform/sqlite/repositories/logicalRestoreRepository.ts`, `src/domains/portability/restoreCommands.ts`, `src/domains/portability/mergePlan.ts`, `src/platform/sqlite/repositories/logicalMergeRepository.ts`, and focused portability/migration tests.
- **Verification:** Migration effects, clean current-schema backup/restore, logical restore, logical merge, no-source-leak ownership checks, and focused 100% integrity coverage passed.
- **Committed in:** `384e9ad6`, `d406afcb`, `dfe088c3`, `4abef7a4`, `b0d27529`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Mandatory correctness and audit support for the plan's explicit exactly-once contract. The change was limited to the current schema and its required portability surfaces; it did not change product scope or historical artifacts.

## Issues Encountered

- Clean current-schema restore initially rejected logical format v10. The restore command now accepts v10 only with schema v45, and the clean-install round trip passes.
- Initial merge classification treated receipt rows as source graph facts. Receipts are now owner-plan facts, with receipt-to-recommendation closure validation inside the owning aggregate.
- The strict integrity gate exposed uncovered legacy branches. Focused tests and a clock normalization refactor achieved 100% coverage without lowering the threshold.
- The state helper could not parse this parallel-execution `STATE.md`; its progress result was therefore restored to the existing authoritative aggregate, and its generated decision labels were corrected from Phase 16 to Phase 19.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Progress recommendation decisions are durable, replay-safe, portable, and visible through an explicit accessible review surface. Concurrent Phase 19 plans can consume the v45/v10 current contract; they must preserve receipt ownership and authoritative read-back semantics.

## Self-Check

PASSED — summary and all five key artifacts exist; all eight implementation commits are present in the repository history; summary frontmatter and whitespace validation passed.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-12*
