---
phase: 11-portable-history-merge-restore
reviewed: 2026-09-23T03:12:00Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - app/__native-contracts.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - app/more/data-and-recovery.tsx
  - maestro/phase11/portable-merge.yaml
  - package.json
  - scripts/run-native-sqlite-contracts.mjs
  - scripts/run-phase11-maestro.mjs
  - src/bootstrap/customExerciseRuntimeReadPort.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutMutationTestControls.ts
  - src/domains/portability/backupCommands.test.ts
  - src/domains/portability/backupCommands.ts
  - src/domains/portability/mergeCommands.test.ts
  - src/domains/portability/mergeCommands.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergePlan.ts
  - src/platform/files/expoBackupFilePort.test.ts
  - src/platform/files/expoBackupFilePort.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/restorePreflightAdapters.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - src/testing/contracts/portableMerge.contract.test.ts
  - src/testing/contracts/portableMerge.contract.ts
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/ui/screens/SettingsScreen.tsx
  - tests/integration/custom-exercise.test.ts
  - tests/integration/portable-merge.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-23T03:12:00Z
**Depth:** standard
**Files Reviewed:** 29
**Status:** clean

## Summary

All supplied Phase 11 source, UI, contract, runner, and test files were re-reviewed at standard depth after `abc60051060e746e530853fb698d1d1fd1ac9eb6`. The CR-01 fix is correct: no-op plans now require a non-empty validated operation list, while zero-write plans return `ready` only after plan/mapping validation, live-local-fact validation, and an in-transaction local fingerprint recheck. Production still receives only the full-plan writer capability.

The no-op return is before `PRAGMA defer_foreign_keys`, trigger capture/drop/recreation, source inserts/deletes, and `markRebuildPending`, so it cannot mutate authoritative rows, schema/trigger SQL, user version, or portability state. The integration regression also confirms a secure no-op token is consumed and cannot be replayed. Mutation plans continue to return `rebuild_pending`. No critical or warning finding remains.

Exact verification run during re-review:

- `npm run test:unit -- --runInBand src/domains/portability/mergeCommands.test.ts src/domains/portability/mergePlan.test.ts` — PASS, 2 suites and 93 tests.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts` — PASS, 1 suite and 97 tests. Includes planner-produced no-op canonical-state proof, stale fingerprint rejection, malformed operation/mapping/local-fact rejection, and mutation rollback paths.
- `npm run test:integration -- --runInBand tests/integration/portable-merge.test.ts` — PASS, 1 suite and 2 tests. Includes authenticated duplicate-only `ready`, canonical-state equality, token-reuse rejection, and archive-wins `rebuild_pending`.
- `npm run test:unit -- --runInBand src/testing/contracts/portableMerge.contract.test.ts` — PASS, 1 suite and 3 tests; its host SQLite contract now includes `portable-merge-duplicate-only-ready` and registered native contract coverage.

## CR-01 Re-review

**Status: resolved by `abc6005`.**

`assertFullPlanSlice()` now rejects only an empty operation list at [logicalMergeRepository.ts:419] and retains all operation, aggregate, mapping, and remap admission checks before the new no-op branch. `commitFullPlan()` snapshots and validates the plan, enters the repository-owned writer, reads current local facts, recomputes and verifies the fingerprint, repeats plan/live-state validation, then returns `{ state: "ready" }` only if both write collections are empty at [logicalMergeRepository.ts:1025-1036]. The existing mutation path continues past that branch to set `rebuild_pending` at [logicalMergeRepository.ts:1038-1073].

Host coverage at [logicalMergeRepository.test.ts:2389] confirms a planner-produced local-won-only plan returns `ready` with canonical SQLite state unchanged. Integration coverage at [portable-merge.test.ts:203] additionally verifies secure token consumption and replay rejection. The source-owned portable-merge contract registers and proves the same case on host SQLite, and keeps it in the manifest-bound native suite at [portableMerge.contract.ts:46-60] and [portableMerge.contract.ts:568-587].

## Prior Adversarial Findings Reconciliation

1. **Absent local setting with `local_won`: resolved.** The writer checks a `local_won` setting exists in current local facts at [logicalMergeRepository.ts:607-610], and host coverage exercises the rejection at `tests/sqlite-host/logicalMergeRepository.test.ts:2009-2033`.
2. **Custom-exercise aggregate closure: resolved.** Custom aggregate validation enforces the allowed table graph and root/child ownership at [logicalMergeRepository.ts:192-233]; malformed closure cases are covered in `tests/sqlite-host/logicalMergeRepository.test.ts:2262-2293`.
3. **`idMappings` and `idRemaps` admission: resolved.** Every mapping/remap is restricted to an admitted root operation and required remaps are exhaustive at [logicalMergeRepository.ts:522-551]. Host tests cover invalid mapping/remap admission.
4. **Broad merge-writer surface: resolved by c483dc3.** `createLogicalMergeRepository()` now returns only `{ commit }` at [logicalMergeRepository.ts:1143-1153]; the secure runtime receives only `{ commitFullPlan }` from [logicalMergeRepository.ts:1160-1169] through [workoutAppRuntime.tsx:1419-1428]. Search of production callers found no alternate production writer path.
5. **Owned-plan aggregate graph closure: resolved.** The writer validates day, occurrence, target, policy, schedule, recommendation, and source links in the owned-plan aggregate at [logicalMergeRepository.ts:298-416], with adversarial malformed-graph cases in the host suite.
6. **Same portable/physical ID across classes: not a defect.** The implementation keys identity mappings by `recordClass`, archive ID, and local ID at [logicalMergeRepository.ts:529-545], and tests accept separate custom-exercise and owned-plan namespaces. Class-aware identity is intentional and valid.

---

_Reviewed: 2026-09-23T03:12:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
