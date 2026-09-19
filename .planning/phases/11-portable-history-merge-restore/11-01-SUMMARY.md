---
phase: 11-portable-history-merge-restore
plan: 01
subsystem: portability, sqlite, encrypted-backup, merge
tags: [gtbk-v2, portable-identity, atomic-merge, expo-sqlite, reconciliation]

requires:
  - phase: 09-in-workout-exercise-editing
    provides: version-20 session-edit receipt source facts
  - phase: 10-advanced-set-timing
    provides: version-21 timing source facts and manifest-bound SQLite proof patterns
provides:
  - schema-22 immutable owner-scoped root identities and GTBK v2 with v1 restore-clean compatibility
  - authenticated, read-only merge preview bound to one-use archive/local-state tokens
  - one private-writer, fail-closed workout-session merge tracer with deterministic rebuild readiness
  - host and manifest-bound Expo SQLite merge success and rollback evidence
affects: [11-02-conflict-engine, 11-03-data-recovery-ui, 11-04-portability-verification, phase-12-sync]

actuals:
  tokens: 85720
  tasks: 3
  commits: 9

tech-stack:
  added: []
  patterns:
    - Merge preflight authenticates/decrypts and validates before any SQLite fact read, then issues a one-use token bound to archive bytes and canonical local source facts.
    - The session tracer consumes its token before one kernel.write transaction rechecks the local fingerprint, replaces one FK-closed aggregate, and leaves rebuild_pending until parity is proven.
    - A manifest-bound deep-link suite override is allowlisted only for the Phase 11 portable-merge contract and is quoted as one adb remote-shell argument.

key-files:
  created:
    - src/platform/sqlite/repositories/logicalMergeRepository.ts
    - src/testing/contracts/portableMerge.contract.ts
    - tests/integration/portable-merge.test.ts
  modified:
    - src/domains/portability/mergeCommands.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/platform/sqlite/repositories/restorePreflightAdapters.ts
    - app/__native-contracts.tsx
    - scripts/run-native-sqlite-contracts.mjs

key-decisions:
  - "D-02 is upheld: portable merge eligibility begins at schema 22, whose opaque owner namespace and immutable root identities are the durable dedup contract."
  - "D-04 is upheld: merge preflight never writes; commit consumes the token before a single private transaction and any failure rolls back authoritative rows, schema metadata, triggers, user_version, and portability state."
  - "Replayable pending effects are derivatives and are superseded by reconciliation after merge; only authoritative schedule opportunities block a session replacement."

patterns-established:
  - "Use canonicalMergeValue for both token fingerprints and deterministic aggregate-digest ties so every device derives the same winner."
  - "Native suite selectors that add query parameters must be remote-shell quoted in adb commands; unquoted ampersands split the command before Android receives the package argument."

requirements-completed: [DATA-08, DATA-09]

coverage:
  - id: D1
    description: "Schema 22 publishes immutable opaque owner namespaces and root identities, and GTBK v2 remains compatible with restore-clean GTBK v1."
    requirement: DATA-09
    verification:
      - kind: unit
        ref: src/domains/portability/portableIdentity.test.ts and src/domains/portability/backupContracts.test.ts
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/build.json migrations-effects case matrix (13/13)
        status: pass
    human_judgment: false
  - id: D2
    description: "Authenticated GTBK v2 preflight produces a bounded, read-only one-session preview and one-use token; v1 remains restore-clean only."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: src/domains/portability/mergeCommands.test.ts
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D3
    description: "A newer duplicate session aggregate replaces the local aggregate in one writer transaction, stale and injected failures preserve canonical state, and deterministic reconciliation controls ready state."
    requirement: DATA-08
    verification:
      - kind: integration
        ref: tests/integration/portable-merge.test.ts#authenticates commits relaunches and deterministically rebuilds an archive-wins session
        status: pass
      - kind: integration
        ref: tests/sqlite-host/logicalMergeRepository.test.ts
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge (3/3)
        status: pass
    human_judgment: false

duration: multi-session
completed: 2026-09-20
status: complete
---

# Phase 11 Plan 01: Stable Identity & Merge Tracer Summary

**Schema-22 portable identities, GTBK v2, and a manifest-bound atomic session merge tracer now establish the safe local merge primitive that later conflict and sync phases extend.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-20
- **Tasks:** 3 implementation tasks plus D-02/D-04 decision gates
- **Files modified:** 47 source, test, runtime, evidence, and planning files

## Accomplishments

- Published schema-22 owner namespace and immutable random portable identities on owner-created exercises, plans, and all workout sessions; logical GTBK v2 preserves those facts while v1 remains clean-restore compatible and merge-ineligible.
- Added a transport-agnostic merge preflight that reads bounded archive bytes, authenticates/decrypts before parsing or local reads, validates v2 identity/schema/reference facts, returns only bounded counts, and issues a one-use archive/local-state-bound token.
- Implemented the vertical session tracer: exact `MERGE` confirmation consumes the token before one `kernel.write` transaction rechecks its local fingerprint, replaces the complete session aggregate, verifies triggers/foreign keys/source facts, and records `rebuild_pending`.
- Proved all injected writer stages, stale plans, no-op stale tokens, invalid confirmation, archive failures, insert failures, verification failures, and pending-effect reconciliation keep source truth safe; successful merges relaunch and rebuild deterministic FTS/history derivatives to `ready`.
- Registered a fail-closed real-Expo `portable-merge` contract. The final Phase 11 development-test artifact is bound to `b3c0df871017b7d5184d32126a6ddab9ad3b082d`, with retained/installed APK SHA-256 `2c8feb2d6047974b381f881f0017389feae776ae7e3417a3148276bb7983c46b`.

## Task Commits

Each task was committed atomically:

1. **Task 1 decision: Uphold D-02 identity semantics** — `d24a052`
2. **Task 2: Schema-22 stable identities and additive GTBK v2** — `3fed5a2`
3. **Task 3: Read-only single-session merge preflight** — `b802ce9`
4. **Task 5: Atomic session merge writer and evidence** — `b6549be`, `c3ccbac`, `ab69dd5`, `bd178a4`, `e8d304d`, `b3c0df8`

## Files Created/Modified

- `src/domains/portability/mergeCommands.ts` — authenticated preview, token lifecycle, deterministic comparison, and safe commit boundary.
- `src/platform/sqlite/repositories/logicalMergeRepository.ts` — one-transaction session aggregate replace/recheck/verification writer.
- `src/platform/sqlite/repositories/restorePreflightAdapters.ts` — shared canonical local-fact reader for preflight and writer rechecks.
- `src/bootstrap/workoutAppRuntime.tsx` — merge command/runtime composition and post-commit reconciliation state mapping.
- `src/testing/contracts/portableMerge.contract.ts` — shared host/Expo success, insert rollback, and verification rollback contract.
- `tests/sqlite-host/logicalMergeRepository.test.ts` and `tests/integration/portable-merge.test.ts` — canonical rollback, stale-token, relaunch, and deterministic-derivative proof.

## Decisions Made

- D-02 and D-04 were explicitly upheld before their irreversible boundaries: v2 identity tuples are immutable, and all merge writes stay fail-closed within one private transaction.
- The session tracer intentionally handles only one FK-closed workout-session aggregate. Full settings/custom exercise/custom plan conflict policy belongs to Plan 11-02.
- Pending effects remain rebuildable derivatives; reconciliation supersedes them after source replacement rather than treating them as merge-blocking source references.

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking native evidence defect] Portable merge suite did not reach the packaged route**

- **Found during:** First manifest-bound portable-merge run.
- **Issue:** A Phase 11 APK defaults to the migrations suite; the runner expected the portable-merge result without passing that selection through the deep link.
- **Fix:** Added an allowlisted Phase 11 `suite=portable-merge` route override, then remote-shell quoting so the `&suite` separator remains part of the URI.
- **Verification:** Source contract tests, final manifest-bound portable merge 3/3.
- **Committed in:** `c3ccbac`, `ab69dd5`.

**2. [Correctness review finding] Rebuildable pending effects blocked source-safe session replacement**

- **Found during:** Final merge writer review.
- **Issue:** The writer treated `pending_effects` as an external source reference even though reconciliation owns superseding those derivative effects after a merge.
- **Fix:** Keep only schedule opportunity references as merge blockers and add a regression showing pending effects are superseded during reconciliation.
- **Verification:** Host writer suite and exact coverage gate passed.
- **Committed in:** `b3c0df8`.

---

**Total deviations:** 2 auto-fixed blocking/correctness issues.
**Impact on plan:** Both fixes preserve D-04 atomicity and make native evidence and derivative recovery reflect the intended data model; no Drive/sync scope was added.

## Issues Encountered

- Native builds required the project-pinned Node 24.19.0 and Temurin 17.0.20+8 rather than the shell defaults.
- The native build tool correctly refused to build while Task 5 source was uncommitted, requiring each device artifact to be created from a clean exact head.
- Full Jest coverage output is truncated by the terminal process cap after success; the zero exit status and gate behavior provide the retained strict-coverage proof.

## User Setup Required

None.

## Next Phase Readiness

Plan 11-02 can now replace the one-session tracer with the full D-01 conflict engine: session/correction/void newest-wins, settings existing-wins, and custom exercise/plan keep-both with deterministic physical-key remapping. It must retain the preflight token, one-writer, GTBK-v2-only merge, reconciliation, and real-Expo proof boundaries established here.

---
*Phase: 11-portable-history-merge-restore*
*Plan: 11-01*
*Completed: 2026-09-20*
