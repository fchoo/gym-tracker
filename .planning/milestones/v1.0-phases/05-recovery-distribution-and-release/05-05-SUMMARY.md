---
phase: 05-recovery-distribution-and-release
plan: 05
subsystem: restore-reconciliation
tags: [sqlite, restore, reconciliation, fts, projections, clean-install]

requires:
  - phase: 05-recovery-distribution-and-release/05-04
    provides: authenticated logical source replacement and durable rebuild_pending restore state
provides:
  - local-only bundled-reference availability reconciliation after logical restore
  - deterministic sequential FTS and history/progress/recommendation derivative recovery with retryable pending state
  - startup and Data and recovery UI gating that never presents pending derivatives as current
  - controlled host-SQLite clean-database parity proof with Android backup-rule source-contract coverage
affects: [csv-export, final-release-gate, clean-install-recovery]

actuals:
  tokens: 14273
  tasks: 2
  commits: 7

tech-stack:
  added: []
  patterns: [durable rebuild-pending coordinator, local-authority catalog reconciliation, derivative parity before ready CAS]

key-files:
  created:
    - src/platform/sqlite/repositories/restoreReconciliationRepository.ts
    - tests/sqlite-host/restoreReconciliationRepository.test.ts
    - tests/sqlite-host/cleanInstallRestore.test.ts
  modified:
    - src/platform/sqlite/repositories/logicalRestoreRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - app/more/data-and-recovery.tsx
    - app/more/__tests__/data-and-recovery.test.tsx
    - tests/sqlite-host/logicalRestoreRepository.test.ts
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "Restored source facts remain authoritative: archive bundled rows are never imported or used to replace local catalog authority."
  - "Derivative recovery runs sequentially outside source replacement; every error retains rebuild_pending and only proven freshness/parity permits the guarded ready transition."
  - "History rebuild subjects are reseeded from restored source facts because logical archives omit derivative revision and projection tables."
  - "The pending-state timestamp is monotonic so a same-millisecond stale ready transition cannot satisfy the reconciliation compare-and-swap."

patterns-established:
  - "Restore recovery pattern: source replacement commits rebuild_pending first, then a coordinator separately reconciles local availability and rebuilds FTS followed by history derivatives before guarded ready acknowledgement."
  - "Restore presentation pattern: UI success requires ready; pending state is explicit and exposes a bounded retry action."

requirements-completed: [DATA-05, DATA-06]
coverage:
  - id: D1
    description: Local bundled references remain local-authority only, unavailable installed references stay readable, and retryable derivative recovery reaches ready only after FTS and history parity checks.
    requirement: DATA-06
    verification:
      - kind: integration
        ref: tests/sqlite-host/restoreReconciliationRepository.test.ts
        status: pass
      - kind: integration
        ref: tests/sqlite-host/logicalRestoreRepository.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Runtime startup and Data and recovery UI gate restore acknowledgement on ready and offer retry while a rebuild remains pending.
    requirement: DATA-05
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx
        status: pass
      - kind: automated_ui
        ref: app/more/__tests__/data-and-recovery.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: A clean host-SQLite database restores logical source facts, converges after an injected rebuild interruption, and matches FTS, history projections, availability, and backup-rule source contracts.
    requirement: DATA-06
    verification:
      - kind: integration
        ref: tests/sqlite-host/cleanInstallRestore.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: The permanent integrity coverage gate includes the restore reconciliation coordinator.
    requirement: DATA-06
    verification:
      - kind: other
        ref: scripts/run-coverage-gate.mjs
        status: pass
    human_judgment: false

duration: 13m commit window
completed: 2026-08-26
status: complete
---

# Phase 05 Plan 05: Restore Reconciliation and Clean-Install Recovery Summary

**Logical restore now retains local catalog authority, rebuilds search and history derivatives deterministically, and withholds recovery success until a clean local state is proven ready.**

## Performance

- **Duration:** 13m recorded implementation-commit window; start time was not captured by the executor.
- **Completed:** 2026-08-26T16:48:35+08:00
- **Tasks:** 2 completed
- **Files modified:** 9

## Accomplishments

- Added a durable reconciliation coordinator that reads `rebuild_pending`, preserves locally approved catalog authority, records unavailable installed references safely, reseeds omitted history rebuild subjects from restored sources, then rebuilds FTS followed by history/progress/recommendation derivatives.
- Added freshness and parity checks before the guarded `ready` transition; interrupted rebuilds remain explicitly pending and converge through a retry without nested writers or cross-repository transaction claims.
- Superseded stale active `pending_effects` after source replacement so pre-restore work cannot replay against restored source facts, while terminal audit rows remain unchanged.
- Wired startup and restore UI so derivative-dependent success appears only after ready; the route states that search and progress are rebuilding and supplies a bounded retry action.
- Added a controlled host-SQLite clean-database fixture that installs the real accepted catalog on source and destination, restores logical source facts and bundled references without replacing local catalog authority, confirms retry convergence and derivative parity, and checks each Android backup XML section independently.
- Added the reconciliation coordinator to the permanent all-metrics integrity coverage list.

## Automated Checks

- Combined restore host regression across `tests/sqlite-host/restoreReconciliationRepository.test.ts`, `tests/sqlite-host/cleanInstallRestore.test.ts`, and `tests/sqlite-host/logicalRestoreRepository.test.ts` — passed: 3 suites, 39 tests.
- Data and recovery component suite — passed: 1 suite, 8 tests.
- Runtime bootstrap unit suite — passed: 1 suite, 35 tests.
- Whole-repository coverage gate — passed: 131 suites and 2,296 tests; 90.86% statements, 85.59% branches, 90.39% functions, and 91.06% lines. All 80 integrity-critical files passed at 100% for every metric.
- `src/platform/sqlite/repositories/logicalRestoreRepository.ts` and `src/platform/sqlite/repositories/restoreReconciliationRepository.ts` each recorded 100% statements, branches, functions, and lines in the final repository coverage artifact.
- Typecheck, lint, the 220-file boundary check, and diff hygiene all passed after the repair commits.
- A fresh independent re-review of the repair range returned CLEAN and confirmed all three prior findings were closed.

## Task Commits

1. **Task 1: Reconcile catalog references and coordinate retryable rebuild state** — `e9146e6` (`feat`)
2. **Task 2: Integrate startup retry and clean-install restore/rebuild parity** — `973d833` (`feat`)
3. **Integrity coverage enforcement** — `2ed9310` (`test`)
4. **Post-review stale-effect supersession** — `6047670` (`fix`)
5. **Accepted-catalog clean-install and scoped Android XML proof** — `10c0edb` (`test`)
6. **Monotonic restore timestamp branch proof** — `7cbecf3` (`test`)
7. **Reconciliation coordinator branch and ordering proof** — `f3cfacc` (`test`)

## Files Created/Modified

- `src/platform/sqlite/repositories/restoreReconciliationRepository.ts` — coordinates local reference reconciliation, sequential derivative rebuild, parity checks, and guarded ready state.
- `src/platform/sqlite/repositories/logicalRestoreRepository.ts` — records monotonic pending-state timestamps for safe reconciliation compare-and-swap.
- `src/bootstrap/workoutAppRuntime.tsx` — invokes recovery at startup and after committed source restore, exposing typed ready/pending retry capabilities.
- `app/more/data-and-recovery.tsx` — blocks restored success copy while rebuilding and renders the retry control.
- `tests/sqlite-host/restoreReconciliationRepository.test.ts` — covers success, interrupted recovery, local unavailability, already-ready behavior, malformed state, and final parity guard.
- `tests/sqlite-host/cleanInstallRestore.test.ts` — proves fresh-database logical restore and retry convergence with the accepted bundled catalog installed independently on both sides, preserved local catalog authority, and per-section Android backup exclusions.
- `scripts/run-coverage-gate.mjs` — permanently enforces all-metrics coverage for the reconciliation coordinator.

## Decisions Made

- Catalog reconciliation consults only locally installed and approved catalog information; restored archive facts cannot install or overwrite bundled content.
- Restore source commit and derivative rebuild remain distinct operations. The durable pending state makes partial recovery visible and retryable rather than allowing stale derivative acknowledgement.
- The clean-install proof is a controlled host-SQLite fixture. Native/device clean-install evidence remains owned by Phase 05 Plan 05-07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Reseeded omitted history rebuild subjects from restored source facts**
- **Found during:** Task 1
- **Issue:** The logical archive intentionally omits history revisions, projection freshness, and effect tables. Rebuilding without reseeding subjects could report ready while rebuilding no restored history.
- **Fix:** Reconstructed rebuild subjects from restored canonical source facts before invoking the existing history rebuild API.
- **Files modified:** `src/platform/sqlite/repositories/restoreReconciliationRepository.ts`, `tests/sqlite-host/restoreReconciliationRepository.test.ts`
- **Verification:** Host-SQLite recovery and clean-install parity checks passed.
- **Committed in:** `e9146e6`

**2. [Rule 2 - Missing Critical] Made the pending restore-state timestamp monotonic**
- **Found during:** Task 1
- **Issue:** A same-millisecond state transition could leave a stale reconciliation completion insufficiently distinguishable for the final guarded ready write.
- **Fix:** Stored `max(nowMs, previousUpdatedAtMs + 1)` when recording `rebuild_pending`.
- **Files modified:** `src/platform/sqlite/repositories/logicalRestoreRepository.ts`, `tests/sqlite-host/logicalRestoreRepository.test.ts`
- **Verification:** Logical restore and reconciliation host suites passed.
- **Committed in:** `e9146e6`

**3. [Rule 1 - Correctness] Prevented stale active effects from replaying after source replacement**
- **Found during:** Independent post-plan review
- **Issue:** Active effects created for the pre-restore source state could otherwise be claimed after reconciliation and execute against restored facts.
- **Fix:** Superseded only pending and processing rows, cleared their claim/lease state, and retained terminal audit rows unchanged.
- **Files modified:** `src/platform/sqlite/repositories/restoreReconciliationRepository.ts`, `tests/sqlite-host/restoreReconciliationRepository.test.ts`
- **Verification:** Real host-SQLite coverage proves stale active rows are unclaimable after replacement while completed rows remain completed.
- **Committed in:** `6047670`

**4. [Rule 2 - Missing Critical] Strengthened clean-install catalog-authority proof**
- **Found during:** Independent post-plan review
- **Issue:** The original clean-install fixture did not install the accepted bundled catalog independently on both databases or prove that restored references leave destination-local bundled authority unchanged.
- **Fix:** Installed the real accepted catalog and acceptance artifacts on source and destination, exported a user-owned bundled reference, and compared local authority/provenance bytes before and after restore.
- **Files modified:** `tests/sqlite-host/cleanInstallRestore.test.ts`
- **Verification:** The host-SQLite clean-install suite proves the archive excludes bundled authority rows while restored owner references, FTS, history, and availability converge.
- **Committed in:** `10c0edb`

**5. [Rule 2 - Missing Critical] Scoped Android backup exclusions to each generated XML section**
- **Found during:** Independent post-plan review
- **Issue:** A global exclusion count could allow one populated XML section to mask a missing exclusion in another section.
- **Fix:** Parsed legacy full-backup, cloud-backup, and device-transfer sections independently and required exactly one database exclusion in each.
- **Files modified:** `tests/sqlite-host/cleanInstallRestore.test.ts`
- **Verification:** The strengthened source-contract test passes against the generated plugin rules.
- **Committed in:** `10c0edb`

---

**Total deviations:** 5 auto-fixed (three correctness additions and two proof-strengthening corrections).

**Impact on plan:** The correctness and proof-strengthening additions are required for deterministic derivative recovery and do not broaden product scope.

## Issues Encountered

- The initial coordinator import targeted a non-exported history barrel symbol; the typed identity key is exported from the metrics domain and the focused typecheck passed after correcting the import.
- The unavailable-reference fixture was aligned with the real catalog source graph and valid 64-character content hashes so it tests the production availability path.

## Known Stubs

None. The controlled host fixture is intentionally not native/device evidence; Phase 05 Plan 05-07 owns that exact-candidate verification rather than leaving a product stub.

## Next Phase Readiness

- Plan 05-06 can rely on restore source facts and current derivatives being explicitly ready before portability-adjacent presentation.
- Phase 05 Plan 05-07 owns only the native/device clean-install and attended exact-candidate evidence; the whole-repository coverage gate is already green at the final Plan 05-05 implementation head.

## Self-Check: PASSED

All listed implementation files and task commits are present, and the focused checks recorded above completed successfully.
