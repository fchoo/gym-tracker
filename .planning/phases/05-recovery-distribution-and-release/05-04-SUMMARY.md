---
phase: 05-recovery-distribution-and-release
plan: 04
subsystem: secure-logical-restore
tags: [restore, sqlite, authenticated-encryption, preflight, rollback, expo-file-picker]

requires:
  - phase: 05-recovery-distribution-and-release/05-03
    provides: bounded encrypted GTBK archives and the audited logical source-table registry
provides:
  - authenticate-and-decrypt-before-parse restore preflight with bounded schema, identity, reference, and candidate validation
  - exact REPLACE-gated single-use restore tokens and bounded replacement preview
  - one serialized all-or-nothing user-owned logical source replacement transaction with retained catalog authority
  - durable ready or rebuild_pending restore state for post-commit reconciliation
affects: [restore-reconciliation, clean-install-recovery, phase-05-final-gate]

actuals:
  tokens: 49185
  tasks: 2
  commits: 17

tech-stack:
  added: []
  patterns: [single-use preflight capability, captured ownership before deletion, exact trigger suspension and recreation, post-commit derivative rebuild state]

key-files:
  created:
    - src/domains/portability/restoreCommands.ts
    - src/platform/sqlite/migrations/0016_portability_restore_state.ts
    - src/platform/sqlite/repositories/logicalRestoreRepository.ts
    - src/platform/sqlite/repositories/restorePreflightAdapters.ts
    - tests/sqlite-host/logicalRestoreRepository.test.ts
  modified:
    - src/platform/files/expoBackupFilePort.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - app/more/data-and-recovery.tsx
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "Restore accepts logical producer schema versions 15 and 16 so archives created before migration 0016 remain recoverable."
  - "Only explicit delete-blocking triggers are suspended from a fixed allowlist; their sqlite_master SQL is captured and recreated exactly inside the same transaction, while 0010 and 0015 insert-validation triggers remain active."
  - "Current user ownership identities are captured before any deletion, retained bundled rows remain authoritative, and shared taxonomy rows survive unless they are exclusively stale user-owned facts."
  - "An invalid confirmation does not consume the preflight token, while every real commit attempt consumes it before invoking the writer and cannot be replayed."
  - "Candidate evidence validation mirrors migration 0015 and the producer JSON shape so trigger-rejected recommendation evidence never reaches the writer."

patterns-established:
  - "Restore capability pattern: bounded authenticated preflight issues an in-memory single-use token; the writer accepts only the validated snapshot bound to that token."
  - "Logical replacement pattern: freeze mixed-ownership identities first, delete and insert in explicit FK-safe order under deferred checks, verify canonical state, then set rebuild_pending before commit."

requirements-completed: [DATA-04, DATA-05]
coverage:
  - id: D1
    description: Restore authenticates and decrypts before parsing, validates bounded schema, IDs, references, retained catalog facts, and installed trigger predicates, and issues a preview only for a valid logical snapshot.
    requirements: [DATA-04, DATA-05]
    verification:
      - kind: unit
        ref: src/domains/portability/restoreCommands.test.ts
        status: pass
      - kind: unit
        ref: src/platform/sqlite/repositories/restorePreflightAdapters.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Exact REPLACE confirmation commits one single-use, all-or-nothing user-owned replacement while retaining bundled authority and restoring every source, schema, trigger, and connection invariant after injected failure.
    requirements: [DATA-04, DATA-05]
    verification:
      - kind: integration
        ref: tests/sqlite-host/logicalRestoreRepository.test.ts
        status: pass
      - kind: integration
        ref: tests/sqlite-host/portabilityMigration.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: The Data and recovery route uses a read-only bounded picker, shows truthful replacement and catalog-availability facts, requires exact case-sensitive REPLACE, blocks duplicate submission, and exposes only safe errors.
    requirements: [DATA-04, DATA-05]
    verification:
      - kind: unit
        ref: src/platform/files/expoBackupFilePort.test.ts
        status: pass
      - kind: automated_ui
        ref: app/more/__tests__/data-and-recovery.test.tsx
        status: pass
    human_judgment: false
  - id: D4
    description: Restore file picking, focus behavior, and destructive confirmation remain usable on the exact final Android release candidate.
    requirements: [DATA-04, DATA-05]
    verification: []
    human_judgment: true
    rationale: Native picker and attended accessibility behavior are intentionally consolidated into the exact-candidate Phase 05 Plan 05-07 gate.

duration: 3h 17m
completed: 2026-08-26
status: complete
---

# Phase 05 Plan 04: Secure Logical Restore Summary

**The app now authenticates and validates encrypted logical backups before preview, then replaces only user-owned source facts in one rollback-safe SQLite transaction after exact `REPLACE` confirmation.**

## Performance

- **Duration:** 3h 17m
- **Started:** 2026-08-26T12:37:50+08:00
- **Completed:** 2026-08-26T15:54:45+08:00
- **Tasks:** 2 completed
- **Files modified:** 18

## Accomplishments

- Added staged, read-only restore preflight that opens the authenticated GTBK envelope before JSON parsing, enforces all archive/schema/row/string/reference/candidate limits, checks retained bundled identities and local catalog availability, and issues only a bounded preview plus single-use capability token. Wrong passwords and authenticated tampering share the same safe failure boundary.
- Added migration 0016 and a one-writer logical replacement repository. It captures ownership before deletion, preserves retained catalog authority, handles the session FK cycle with deferred checks, keeps validation triggers active, temporarily suspends only fixed delete blockers, recreates exact trigger SQL, verifies canonical post-state, and records `rebuild_pending` before commit.
- Wired the read-only Expo file picker, runtime adapters, and Data and recovery review UI with exact case-sensitive `REPLACE`, invalid-confirmation retry, real-attempt token consumption, duplicate-press prevention, focus handling, truthful catalog availability, and sanitized errors.
- Extended the permanent integrity gate to the restore command, preflight adapter, transaction repository, restore-state migration, and existing Expo file adapter. Independent review found and closed one migration-0015 evidence-parity defect before plan completion.

## Automated Checks

- `npm run test:coverage -- --runInBand` — passed: 129 suites and 2,284 tests. Global coverage is 90.93% statements, 85.66% branches, 90.37% functions, and 91.13% lines. All 79 integrity-critical files pass the permanent 100% statements/branches/functions/lines gate.
- `npm run typecheck -- --pretty false` — passed.
- `npm run lint` — passed; 219-file boundary check.
- `npm run check:boundaries` — passed; 219-file boundary check.
- `git diff --check 03b62cee..6ec2144` — passed.
- Independent final review of `03b62cee..8e1d60c` found one P1 mismatch between preflight and migration 0015; `6ec2144` fixed it with RED/GREEN tests, and focused independent re-review returned `CLEAN` with 68 adapter tests passing.

## Task Commits

1. **Task 1: Add restore state and strict no-write preflight/preview** — `663a3cb`, `9ae8752`, `07961fa`, `8fdc139`, `93bb5e2`, `76552aa`, `a1824df`, `baefe37`, `6ec2144`
2. **Task 2: Replace user-owned source tables in one serialized transaction and wire the restore UX** — `c825f72`, `408db9f`, `9103592`, `cbd2730`, `f541e6b`, `17e175a`, `f33a466`, `8e1d60c`

## Files Created/Modified

- `src/domains/portability/restoreCommands.ts` — bounded authenticated preflight, preview, single-use token, and exact confirmation boundary.
- `src/platform/sqlite/repositories/restorePreflightAdapters.ts` — live schema, retained-reference, catalog-availability, and 0010/0015 candidate checks.
- `src/platform/sqlite/repositories/logicalRestoreRepository.ts` — captured-ownership, FK-safe, trigger-safe one-transaction source replacement.
- `src/platform/sqlite/migrations/0016_portability_restore_state.ts` — durable `ready | rebuild_pending` singleton.
- `src/platform/files/expoBackupFilePort.ts` — bounded read-only restore picker with typed safe failures.
- `src/bootstrap/workoutAppRuntime.tsx` — trusted restore capabilities and production adapters.
- `app/more/data-and-recovery.tsx` — replacement preview and exact destructive confirmation flow.
- Focused unit, component, migration, and host-SQLite tests cover every integrity branch and rollback stage.

## Decisions Made

- Logical restore supports producer schema 15 and 16; migration 0016 is destination state, not a reason to reject valid schema-15 archives.
- Bundled exercises, library entries, plans, content packs, and starter sources are retained authorities. The archive supplies user-owned facts plus references, never bundled replacement rows.
- Restore never replaces a raw SQLite file and never disables `foreign_keys`; it uses explicit dependency order plus `PRAGMA defer_foreign_keys = ON` within the serialized writer.
- Invalid confirmation leaves the preflight capability usable. Once a valid confirmation starts a real commit attempt, the capability is consumed before the writer call regardless of success or rollback.
- Recommendation evidence preflight follows installed migration-trigger semantics and real producer JSON, while stricter application-level Zod constraints remain owned by their existing contract.

## Deviations from Plan

### Auto-fixed Issues

1. **Delete-protected source rows:** review found immutable delete triggers would block a correct logical restore. The repository now captures and suspends only the fixed delete-blocker allowlist, recreates byte-identical SQL inside the transaction, and fault-tests every drop/recreate boundary.
2. **Mixed ownership and retained references:** captured identity sets now prevent relationship filters from changing after parents disappear; shared taxonomy and bundled source rows remain intact, including duplicate-from-bundled and starter/content references.
3. **Installed trigger preflight parity:** the candidate adapter now validates 0010 and 0015 predicates before token issue. Final review exposed evidence-version, set-ID type, and target-scope shape drift; TDD commit `6ec2144` aligned the adapter with the trigger and producer.
4. **Permanent integrity enforcement:** four new restore-critical modules were added to the 100% integrity gate, and two focused Expo adapter tests restored that already-critical file to 100%.

**Total deviations:** 4 correctness and integrity hardenings.
**Impact on plan:** All changes close source-integrity or preflight gaps inside the planned restore scope; no reconciliation, CSV, native verification, or release-promotion work was pulled forward.

## Issues Encountered

- The initial broad executor stalled without modifying the tree, so execution was split into bounded TDD slices.
- The first full final gate exposed two uncovered Expo file-port branches; focused tests closed them without production changes.
- Independent review then identified a real preflight/SQLite-trigger mismatch. The failing cases were reproduced before implementation, fixed in `6ec2144`, rerun through the full gate, and independently re-reviewed clean.

## User Setup Required

None.

## Deferred Verification

No Android build, emulator/device run, Maestro run, attended accessibility/focus review, signing/publication, owner approval, or Terminal Seal evidence was produced. Native picker and exact-candidate restore behavior remain part of the single consolidated Phase 05 Plan 05-07 gate.

## Next Phase Readiness

Plan 05-05 can consume the durable `rebuild_pending` state after a committed source replacement, reconcile retained catalog references locally, and rebuild FTS/history/progress/recommendation derivatives without weakening source authority.

## Self-Check: PASSED

- All planned source files and tests exist and are committed.
- DATA-04 is complete; DATA-05 remains shared with Plan 05-05 for post-commit reconciliation failure handling.
- The final automated suite, permanent integrity coverage gate, typecheck, lint, boundaries, diff hygiene, and independent re-review all pass.
- No native/device/owner evidence is claimed; the only human-classified coverage item remains deferred to Plan 05-07.

---
*Phase: 05-recovery-distribution-and-release*
*Plan: 04*
*Completed: 2026-08-26*
