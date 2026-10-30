---
phase: 12-automatic-google-drive-sync
reviewed: 2026-10-01T03:35:40Z
depth: standard
files_reviewed: 134
files_reviewed_list:
  - .github/workflows/pr.yml
  - app.config.ts
  - app/__native-contracts.tsx
  - app/__phase12-benchmark.tsx
  - app/__phase12-google-auth-smoke.tsx
  - app/__phase12-google-cleanup.tsx
  - app/__tests__/root-layout.test.tsx
  - app/_layout.tsx
  - app/more/__tests__/automatic-backup-settings.test.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - app/more/__tests__/drive-backup-privacy.test.tsx
  - app/more/__tests__/manual-encrypted-backup.test.tsx
  - app/more/automatic-backup-settings.tsx
  - app/more/data-and-recovery.tsx
  - app/more/drive-backup-privacy.tsx
  - app/more/manual-encrypted-backup.tsx
  - jest.config.js
  - maestro/phase12/automatic-drive-backup.yaml
  - modules/network-classifier/android/build.gradle
  - modules/network-classifier/android/src/main/AndroidManifest.xml
  - modules/network-classifier/android/src/main/java/expo/modules/networkclassifier/NetworkClassifierModule.kt
  - modules/network-classifier/android/src/test/java/expo/modules/networkclassifier/NetworkClassifierModuleTest.kt
  - modules/network-classifier/expo-module.config.json
  - modules/network-classifier/package.json
  - modules/network-classifier/src/index.test.ts
  - modules/network-classifier/src/index.ts
  - package.json
  - scripts/assert-generated-production-android.mjs
  - scripts/benchmark-phase12-backup.mjs
  - scripts/benchmark-phase12-backup.test.mjs
  - scripts/build-current-native-test-apk.sh
  - scripts/build-current-native-test-apk.test.mjs
  - scripts/evaluate-npm-audit.mjs
  - scripts/evaluate-npm-audit.test.mjs
  - scripts/google-oauth-config.mjs
  - scripts/google-oauth-config.test.mjs
  - scripts/phase12-evidence-scripts.test.mjs
  - scripts/prepare-phase12-google-acceptance.mjs
  - scripts/prepare-phase12-google-acceptance.test.mjs
  - scripts/record-phase12-google-acceptance.mjs
  - scripts/run-coverage-gate.mjs
  - scripts/run-native-sqlite-contracts.mjs
  - scripts/run-phase12-maestro.mjs
  - scripts/validate-development-test-app-config.mjs
  - scripts/verify-phase12-evidence.mjs
  - scripts/verify-phase12-evidence.test.mjs
  - src/bootstrap/appConfig.test.ts
  - src/bootstrap/automaticBackupRuntime.test.ts
  - src/bootstrap/automaticBackupRuntime.ts
  - src/bootstrap/benchmarkRecovery.ts
  - src/bootstrap/phase12BackupBenchmark.test.ts
  - src/bootstrap/phase12BackupBenchmark.ts
  - src/bootstrap/phase12BackupTestControls.test.ts
  - src/bootstrap/phase12BackupTestControls.ts
  - src/bootstrap/phase12GoogleAuthSmoke.test.ts
  - src/bootstrap/phase12GoogleAuthSmoke.ts
  - src/bootstrap/phase12GoogleCleanup.ts
  - src/bootstrap/productionAutomaticBackupRuntime.test.ts
  - src/bootstrap/productionAutomaticBackupRuntime.ts
  - src/bootstrap/productionAutomaticSnapshotCapture.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutLifecycle.ts
  - src/domains/backup/automaticBackupContracts.test.ts
  - src/domains/backup/automaticBackupContracts.ts
  - src/domains/backup/automaticBackupCoordinator.test.ts
  - src/domains/backup/automaticBackupCoordinator.ts
  - src/domains/backup/automaticBackupPresentation.test.ts
  - src/domains/backup/automaticBackupPresentation.ts
  - src/domains/backup/automaticBackupScheduler.test.ts
  - src/domains/backup/automaticBackupScheduler.ts
  - src/domains/backup/driveBackupStorePort.ts
  - src/domains/backup/googleAuthPort.ts
  - src/domains/portability/automaticPortability.test.ts
  - src/domains/portability/automaticPortability.ts
  - src/domains/portability/index.ts
  - src/domains/portability/mergeCommands.test.ts
  - src/domains/portability/mergeCommands.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/shared/tooling.test.ts
  - src/platform/google/driveBackupStoreAdapter.test.ts
  - src/platform/google/driveBackupStoreAdapter.ts
  - src/platform/google/googleAuthAdapter.test.ts
  - src/platform/google/googleAuthAdapter.ts
  - src/platform/sqlite/index.ts
  - src/platform/sqlite/migrations/0023_automatic_drive_backup.ts
  - src/platform/sqlite/migrations/0024_automatic_backup_receipts.ts
  - src/platform/sqlite/migrations/0025_automatic_backup_deletion_progress.ts
  - src/platform/sqlite/migrations/0026_automatic_backup_account_label.test.ts
  - src/platform/sqlite/migrations/0026_automatic_backup_account_label.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.ts
  - src/platform/sqlite/repositories/automaticSnapshotCapture.test.ts
  - src/platform/sqlite/repositories/automaticSnapshotCapture.ts
  - src/platform/sqlite/repositories/contentRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/logicalRestoreRepository.ts
  - src/platform/sqlite/repositories/starterPlanRepository.ts
  - src/platform/sqlite/sqliteKernel.ts
  - src/testing/contracts/googleDriveBackup.contract.test.ts
  - src/testing/contracts/googleDriveBackup.contract.ts
  - src/testing/contracts/sqliteKernel.contract.ts
  - src/testing/phase12AutomaticBackupFixtures.test.ts
  - src/testing/phase12AutomaticBackupFixtures.ts
  - src/testing/phase12GoogleAuthSmoke.test.ts
  - src/testing/phase12GoogleAuthSmoke.ts
  - src/testing/phase12GoogleCleanup.test.ts
  - src/testing/phase12GoogleCleanup.ts
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/ui/components/NavigationRow.test.tsx
  - src/ui/components/NavigationRow.tsx
  - src/ui/components/index.ts
  - src/ui/portability/BackupPreviewFacts.tsx
  - src/ui/portability/useCsvExportController.test.tsx
  - src/ui/portability/useCsvExportController.ts
  - src/ui/portability/useManualBackupController.test.tsx
  - src/ui/portability/useManualBackupController.ts
  - src/ui/screens/SettingsScreen.tsx
  - tests/integration/automatic-drive-backup.test.ts
  - tests/integration/content-import.test.ts
  - tests/integration/starter-activation-repository.test.ts
  - tests/sqlite-host/automaticBackupStateRepository.test.ts
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/phase12BackupBenchmark.host.test.ts
  - tests/sqlite-host/portabilityMigration.test.ts
  - tests/sqlite-host/sqliteKernel.host.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 12: Code Review Report

**Reviewed:** 2026-10-01T03:35:40Z
**Depth:** standard
**Files Reviewed:** 134
**Status:** clean

**Final re-review status:** All narrative and re-review findings are resolved through `8c64e332ff92765069f84ab6ba78813e46b81925`. Attended device evidence remains pending by design and is not a source-code finding.

## Summary

The Phase 12 summaries and all review-fix iterations were reconciled through current HEAD. All reviewed source files now meet the Phase 12 correctness, security, recovery, deletion, schema-compatibility, and evidence-integrity requirements. No open code-review issues remain.

## Final Re-review Findings

### FR-CR-01: Schema-27 installations reject their own automatic backups as future-schema data

**Fix status:** Fixed (`7dcd3a3`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:158-172`  
**Issue:** Current HEAD registers migration 27 and accepts schema 27 in `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS`, but both `snapshotFromDrive` and `validatedRecoveryCandidateFromDriveObject` still pass `currentSchemaVersion: 26` (`productionAutomaticBackupRuntime.ts:124-130`). Production capture records the live `PRAGMA user_version` in the snapshot header, so a schema-27 device creates schema-27 bytes and then classifies its own round-trip download as `update_required`; `validate()` returns false and every automatic backup is deferred at snapshot validation. Recovery scans likewise quarantine valid current backups as future schema.
**Fix:** Derive the current supported schema from the migration registry/shared schema constant and use 27 consistently in production validation and scan paths. Add a production-composition test that captures, validates, reconstructs, and prepares recovery for a schema-27 snapshot.

### FR-WR-01: The native 30-case matrix still does not execute most named behaviors

**Fix status:** Fixed (`ad9cb5b`, `4dc5cf7`, `8c64e33`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/testing/contracts/googleDriveBackup.contract.ts:81-170`  
**Issue:** The latest fix gives every case ID an explicit function and adds real Drive-adapter checks for four cases, but the other 26 native scenarios still reduce to the same generic quarantine/receipt/handover/deletion repository transitions. For example, digest/schema rejection, auth/scope fencing, manifest-size limits, future-schema recovery, retention, and most crash cuts do not execute the production behavior named by the case. A 30/30 packaged result therefore still overstates device coverage.
**Fix:** Implement a case-specific adapter scenario for every required ID, exercising the relevant production coordinator, parser, Drive adapter, and SQLite fault boundary. Keep the positive assertion count, but do not treat a generic state-row transition as proof of unrelated behavior.

## Final Re-review Verification

- Current HEAD: `8c64e332ff92765069f84ab6ba78813e46b81925`.
- TypeScript passed.
- Final focused unit suites: 15 tests passed.
- Phase 12 evidence-script suites: 16 tests passed.
- Retained pre-fix native evidence correctly failed with `phase12_manifest_stale`.
- No new APK/device/Maestro run or attended Google action was performed.

## Re-review Findings

### RR-CR-01: Reconstructed manifests cannot pass the new recovery descriptor contract

**Fix status:** Fixed (`4131ea5`, coverage `32b7b50`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:312-318`  
**Issue:** CR-02 made `prepareRecovery` require `byteLength`, `snapshotId`, `writerEpoch`, and `mutationGeneration` on every selected descriptor (`automaticBackupCoordinator.ts:654-658`). The missing/corrupt-manifest reconstruction path still writes only `fileId`, `object_sha256`, and `byteLength`. Its newly reconstructed manifest parses as a legacy manifest but every recovery attempt is rejected as `automatic_recovery_manifest_invalid`, so the D-07 recovery path remains unusable.
**Fix:** Write complete descriptors from `RecoverySnapshotCandidate` for both latest and previous during reconstruction, and add an end-to-end test that reconstructs a manifest and then successfully calls `prepareRecovery` against it.

### RR-CR-02: Recovery scanning can promote a snapshot whose logical payload was never validated

**Fix status:** Fixed (`4131ea5`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:289-308`  
**Issue:** `discoverCandidates` validates only the outer canonical envelope and digests. It does not call `parseLogicalBackupSnapshot`, schema/reference validation, or the restore candidate probe before feeding candidates to `selectRecoveryLineage`. A higher-generation envelope with an invalid logical graph can therefore displace a valid lower snapshot and be promoted into a reconstructed manifest, after which recovery fails and remains stuck.
**Fix:** Fully parse and validate every current-schema scan candidate through the same logical/schema/reference/candidate boundaries used by restore before it is eligible for lineage selection. Keep future-schema classification envelope-only and non-mutating.

### RR-CR-03: Cancelling cellular confirmation writes an unrelated restore-pending state and does not dismiss the prompt

**Fix status:** Fixed (`1ef6bed`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `app/more/data-and-recovery.tsx:802-805`  
**Issue:** The new cellular confirmation's Cancel button calls `cancelAutomaticBackupCheck`. That command invokes `coordinator.abortChecking()`, which persists `status_code = 'restore_pending'` (`automaticBackupCoordinator.ts:819-820`). It does not clear `cellularConfirmationRequired`, so the confirmation remains visible while durable state is incorrectly changed to recovery-required.
**Fix:** Add a separate transient `dismissCellularConfirmation` command that only clears the runtime flag and republishes. Never route network-policy dismissal through the recovery state machine.

### RR-WR-01: Persisted resumable uploads are invalidated by a new timestamp on every retry

**Fix status:** Fixed (`89c5680`, `1535616`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:266-307`  
**Issue:** WR-02 now reads pending upload state, but it recaptures before resuming and requires the new `sourceDigest` to equal the persisted digest. Production capture always supplies `createdAtMs: Date.now()` (`productionAutomaticBackupRuntime.ts:209-236`), so the canonical envelope and digest change after a process restart even when generation and facts are identical. The pending session is discarded and a new candidate is allocated; restart-safe resume still does not work. The test uses a fake capture that returns the persisted digest regardless of time and misses this production behavior.
**Fix:** Persist the capture timestamp or exact immutable candidate bytes and reuse them when resuming. At minimum, make candidate creation metadata deterministic from the persisted attempt and prove resume with two production captures at different wall-clock times.

### RR-WR-02: The native 30-case contract still maps most case names to four generic repository checks

**Fix status:** Fixed (`12efc0b`, `ad9cb5b`, `4dc5cf7`, `8c64e33`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/testing/contracts/googleDriveBackup.contract.ts:81-142`  
**Issue:** WR-01 now opens real Expo SQLite, but `expectedNativeBoundary` collapses all 30 advertised cases into only `quarantine`, `receipt`, `handover`, or `deletion`. Cases such as ETag conflict, redirect rejection, descriptor validation, future schema, retention, and crash cuts still do not execute their named production behavior; many host checks below remain constant predicates. A 30/30 native result therefore remains materially overstated.
**Fix:** Give each case a scenario-specific adapter operation and assertion across the actual coordinator/Drive/repository boundary. Do not count a generic quarantine row read as proof of transport, recovery, retention, or crash semantics.

### RR-WR-03: Production presentation mislabels valid and invalid remote backups as no-cloud

**Fix status:** Fixed (`96bb48f`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:75-82`  
**Issue:** CR-09 derives `no_cloud` from `authorityState === 'quarantine' && manifestId === null` before considering the recovery prompt. A replacement install does not persist the discovered remote manifest ID before recovery, so even a verified remote latest/previous prompt is labeled `no_cloud`. A malformed remote manifest with no valid scan candidate is also labeled `no_cloud` rather than `invalid_artifacts`. The action may still be recovery-driven, producing contradictory status and controls.
**Fix:** Persist or publish the coordinator's explicit discovery outcome (`needs_bootstrap`, `restore_required`, `invalid_artifacts`) and derive presentation from that outcome. Do not infer cloud absence from the local manifest ID.

## Re-review Verification

- TypeScript passed.
- Diff whitespace check passed for source files.
- Focused unit suites: 181 tests passed.
- Focused component suites: 13 tests passed.
- Focused host-SQLite suites: 105 tests passed.
- Phase 12 evidence-script suites: 16 tests passed.
- The retained pre-fix native evidence is now correctly rejected with `phase12_manifest_stale`.
- No new APK, device, Maestro, or attended Google run was performed.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Fresh-auth takeover immediately returns the device to stale-writer state

**Fix status:** Fixed (`bc21761`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:412-417`  
**Issue:** A higher remote epoch always calls `markStaleWriter`, including when `allowHigherEpochRecovery` is true. The SQLite implementation persists `authority_state = 'stale_writer'` (`automaticBackupStateRepository.ts:184-189`), but `prepareRecovery` later requires `authorityState === "quarantine"` (`automaticBackupCoordinator.ts:504-505`). A fresh replacement install therefore cannot proceed from connect/takeover into restore or merge. The existing test at `automaticBackupCoordinator.test.ts:718-752` checks only the returned status and explicitly misses the persisted state.
**Fix:** In the explicitly reauthenticated takeover path, keep the new connection generation in quarantine and record the higher remote epoch as recovery context without calling `markStaleWriter`. Add a real repository-backed test that calls `takeOver()` and then `prepareRecovery()`.

### CR-02: Restore ignores the manifest's snapshot hash and byte length

**Fix status:** Fixed (`3146e28`, `06ee3fd`, `4131ea5`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:512-515`  
**Issue:** The coordinator selects a manifest descriptor but passes only downloaded bytes to `parseSnapshot`. Production wires that to `snapshotFromDrive(value, environment)` without the descriptor (`productionAutomaticBackupRuntime.ts:198`), and `snapshotFromDrive` substitutes a hash and length computed from those same untrusted bytes when the descriptor is absent (`productionAutomaticBackupRuntime.ts:62-75`). A canonical substituted snapshot with a recomputed inner digest is therefore accepted even when it does not match the manifest's `object_sha256` or `byteLength`.
**Fix:** Make the recovery parser require the selected descriptor, download at `byteLength + 1`, and pass the manifest's exact `byteLength` and `object_sha256` into `parseDriveBackupSnapshotEnvelopeV1`. Also verify the envelope's snapshot identity, epoch, and generation against the selected manifest entry before restore/merge.

### CR-03: A crash after tombstone promotion can resurrect deleted workout data

**Fix status:** Fixed (`20190e8`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:469-482`  
**Issue:** The remote manifest becomes a deleted tombstone before local `beginDeletionSweep` is persisted. If the process dies in that gap, local state still looks active. On the next recovery, production `validateManifest` maps every deleted manifest to `null` (`productionAutomaticBackupRuntime.ts:188-194`), and `recover` treats that as a corrupt manifest and invokes reconstruction (`automaticBackupCoordinator.ts:405-410`). `reconstructManifest` then conditionally overwrites the tombstone with an active manifest assembled from remaining snapshots (`productionAutomaticBackupRuntime.ts:245-253`), undoing deletion and making old readable data authoritative again.
**Fix:** Parse manifests as the full active/deleted tagged union throughout recovery. A valid tombstone must transition local state idempotently into deletion mode and must never enter snapshot reconstruction. Persist enough pending-deletion identity before or atomically around remote promotion to recover this crash boundary.

### CR-04: A resumed deletion sweep can delete a newer writer's backups

**Fix status:** Fixed (`5e047f1`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:427-445`  
**Issue:** `finishDeletionSweep` trusts only local `authorityState === "deleted"`; it neither reauthenticates/checks `permissionId` nor rereads and verifies that the remote manifest is still the expected tombstone. An old device with locally pending deletion can therefore reconnect after another device has started a new active backup and permanently delete every snapshot returned for that environment. The sweep bypasses the ETag/writer-epoch protections used elsewhere.
**Fix:** Before every deletion batch, verify the current token identity against the persisted permission ID and reread the exact manifest ID/ETag. Continue only while it is the expected deleted tombstone and successor epoch; cancel immediately if another writer has transitioned it back to active.

### CR-05: Cloud deletion can report complete while readable snapshots remain forever

**Fix status:** Fixed (`cdb40ee`, `1f883ea`; concurrency coverage `c36a5c9`)

**Classification:** BLOCKER  
**Confidence:** 9/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:437-444`  
**Issue:** Deletion performs two immediate list calls and then marks the sweep complete. It does not cancel or await the coordinator's in-flight backup (`automaticBackupScheduler.ts:63` only clears pending work), so an already-started resumable/multipart upload can finish after the second list and remain in Drive permanently. Separately, discovery requests nine total environment objects and rejects more than eight (`driveBackupStoreAdapter.ts:119-132`); because the manifest is included, eight snapshots make every deletion retry fail before deleting anything.
**Fix:** Introduce an abort/join barrier for in-flight uploads before tombstone promotion, retain a durable sweep-pending state across later launch/foreground passes, and paginate deletion in bounded batches. Do not mark deletion complete until no pre-tombstone upload can still materialize and a tombstone-fenced paginated pass is empty.

### CR-06: Leaving deleted state creates a repository row that its own reader rejects

**Fix status:** Fixed (`7bdec36`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/platform/sqlite/repositories/automaticBackupStateRepository.ts:161-168`  
**Issue:** `beginQuarantine` changes `authority_state` to `quarantine` but leaves `deletion_progress` as `sweep_pending` or `complete`; `disconnectLocal` does the same (`automaticBackupStateRepository.ts:293-300`). The repository reader explicitly rejects any non-`none` deletion progress outside `authority_state = 'deleted'` (`automaticBackupStateRepository.ts:80-82`). Thus start-new (which calls `beginQuarantine` at `automaticBackupCoordinator.ts:485-499`) and disconnect during/after deletion make all subsequent state reads fail with `automatic_backup_state_invalid`.
**Fix:** Define valid atomic transitions out of deleted state. Start-new should require a completed sweep and reset `deletion_progress = 'none'` in the same update; disconnect during a pending sweep should either be blocked or represented by a schema-valid resumable state.

### CR-07: A clean database cannot create its first backup or restart after deletion/reconnect

**Fix status:** Fixed (`da5f472`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:209-217`  
**Issue:** The v23 migration initializes both generations to zero (`src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:47-49`), and `run` exits whenever `mutationGeneration <= backedUpGeneration`, even during first-backup bootstrapping. Existing users upgraded with unchanged source facts, users reconnecting after `disconnectLocal` (which retains backed-up generation), and users starting again from a tombstone can all reach `needs_bootstrap` but never create the promised first manifest/snapshot.
**Fix:** Treat a validated bootstrap/tombstone-to-active attempt as requiring publication even when generations are equal, or persist a distinct forced-bootstrap generation/flag. Add migration-upgrade, reconnect, and post-deletion tests with `mutationGeneration === backedUpGeneration`.

### CR-08: Non-empty recovery and explicit candidate selection are not wired to the product UI

**Fix status:** Fixed (`4552b49`, `70e7736`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:289-300`  
**Issue:** `continueRestore` hardcodes `candidate: "latest"` and deliberately throws when preflight returns `kind: "merge"`. Although the lower runtime exposes `prepareRecovery`/`commitRecovery`, the root `RuntimeValue` surface exposes only `continueAutomaticRestore` (`workoutAppRuntime.tsx:591-606`), and the recovery route only invokes that one command (`app/more/data-and-recovery.tsx:760-768`). Users with non-empty local facts cannot review/confirm merge or namespace adoption, and no UI path can explicitly choose a previous snapshot.
**Fix:** Expose typed automatic prepare/commit/cancel commands through the root facade, bind them to the current prompt candidate (`latest` or `previous`), render merge/adoption confirmation, and invalidate the attempt on account/manifest refresh.

### CR-09: Completed deletion and recovery progress states are synthetic-only and production actions are unreachable

**Fix status:** Fixed (`5664dc4`, `96bb48f`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:280-303`  
**Issue:** The production projection maps neither `checking`, `finishing`, `deleted`, `deletion_partial`, `invalid_artifacts`, nor `no_cloud`; those states exist only in development fixtures. After a completed deletion, production emits ordinary `idle` with no reason, while the settings route exposes start-new only for `reason === "restore_required" && accountLabel === null` (`app/more/automatic-backup-settings.tsx:41-43`), a state unrelated to deletion. The owner therefore cannot start a new cloud backup, and several documented recovery states/actions cannot occur outside tests.
**Fix:** Derive the full presentation model from durable `statusCode`, `authorityState`, `deletionProgress`, and coordinator recovery outcome. Gate start-new on the real completed-deletion state and expose stage-appropriate cancel/defer/finish actions.

### CR-10: The advertised 24 MiB maximum snapshot cannot be uploaded

**Fix status:** Fixed (`c9d6aca`, `930689c`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/bootstrap/productionAutomaticBackupRuntime.ts:171-181`  
**Issue:** The benchmark defines and validates a logical snapshot of exactly 24 MiB (`phase12BackupBenchmark.ts:49,448-450`), but production wraps that snapshot in an outer header and two digests before upload. The Drive adapter rejects any resumable payload over exactly 24 MiB (`driveBackupStoreAdapter.ts:212-216`). Therefore the benchmark's accepted maximum always grows beyond the transport maximum and fails in real backup.
**Fix:** Define the 24 MiB limit over the final encoded Drive object, or reserve/compute envelope overhead before accepting the logical payload. Exercise the actual production capture -> envelope -> adapter boundary at exactly-max and max-plus-one.

### CR-11: Multiple custom-exercise child collisions generate duplicate primary keys

**Fix status:** Fixed (`13986c7`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/domains/portability/mergePlan.ts:943-960`  
**Issue:** For `exercise_aliases` and `exercise_search_terms`, `nextId` is calculated once and never incremented or searched again after a collision. Two colliding archive child IDs in the same table are both remapped to the same `nextId`; separate custom-exercise aggregates also build independent occupied sets. The atomic writer then hits a uniqueness violation and rolls back a valid merge.
**Fix:** Use one plan-wide allocator per `(table,keyColumn)`, loop until an unused numeric ID is found, add it to the shared occupied set, and advance the cursor after every allocation. Add a test with at least two collisions in one aggregate and collisions across two custom exercises.

### CR-12: Response limits are checked only after the whole body is allocated

**Fix status:** Fixed (`fa2b477`)

**Classification:** BLOCKER  
**Confidence:** 9/10  
**File:** `src/platform/google/driveBackupStoreAdapter.ts:36-59`  
**Issue:** When `Content-Length` is absent, `body()` calls `response.arrayBuffer()` and checks `byteLength` only after the complete response is resident in memory. A malformed or unexpectedly large Drive object/list can exhaust the mobile process before the nominal 16 KiB/24 MiB bound is enforced.
**Fix:** Consume `response.body` incrementally, abort as soon as cumulative bytes exceed the limit, and only concatenate bounded chunks. If the runtime cannot stream reliably, reject missing/invalid `Content-Length` for these endpoints.

### CR-13: The final evidence verifier accepts stale and unbound artifacts

**Fix status:** Fixed (`6026140`)

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `scripts/verify-phase12-evidence.mjs:104-149`  
**Issue:** The verifier compares child reports only to the supplied manifest; it never compares that manifest to current `git rev-parse HEAD`, the current source-tree digest, or retained APK bytes. It also accepts Maestro entries by stage name plus any 64-hex string without hashing the referenced JUnit reports (`verify-phase12-evidence.mjs:68-70`). At requested HEAD `178f95d`, the retained manifest still names `0ee3646`, yet `npm run verify:phase12:evidence -- --manifest artifacts/native/phase12/build.json --automated-only` exits 0 and reports passed.
**Fix:** Before reading child evidence, recompute current HEAD/source digest/APK digest and require exact equality. Require each Maestro report file to exist and match its recorded hash, and bind the Maestro envelope itself to the same manifest identity.

## Warnings

### WR-01: The claimed native Drive contract is largely tautological

**Fix status:** Fixed (`cebb2ad`, `12efc0b`, `ad9cb5b`, `4dc5cf7`, `8c64e33`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/testing/contracts/googleDriveBackup.contract.ts:80-138`  
**Issue:** Most of the 30 named native cases do not execute the behavior in their names. Examples include a self-comparison for `generation-receipt-fence`, constant arithmetic for size boundaries, status-number checks for ETag conflicts, and repeated manifest-parser calls for crash, retention, and deletion cases. The generated 30/30 result therefore does not prove SQLite receipts, crash cuts, Drive retries, deletion, or restore paths on Expo SQLite.
**Fix:** Replace each label-only closure with the same repository/coordinator/adapter scenario used by host tests through real Expo SQLite ports. Make the native runner reject cases that do not execute the expected durable boundary or fault injection.

### WR-02: Persisted upload recovery state is write-only

**Fix status:** Fixed (`b1a5594`, `89c5680`, `1535616`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/domains/backup/automaticBackupCoordinator.ts:255-274`  
**Issue:** The coordinator persists a candidate before upload, but never persists the resumable session returned by `createResumableSnapshot`, loops over 308 acknowledgements, or reads a pending upload on restart. `resumable_location`, offsets, leases, `acquireLease`, and `recoverExpiredLease` exist in the repository (`automaticBackupStateRepository.ts:45-47,126-159`) but have no production caller. A partial upload is abandoned and every retry allocates a new ID/session.
**Fix:** Add a bounded pending-attempt read/update API, persist the session URL and acknowledged offset after every response, resume in a loop until completion, and recover/expire the lease on launch/foreground using the same candidate ID.

### WR-03: The global command latch swallows different commands, including cancellation

**Fix status:** Fixed (`65f284d`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `src/bootstrap/automaticBackupRuntime.ts:78-92`  
**Issue:** If any command is active, `invoke` returns that promise for every later command without checking the command key. Pressing Cancel checking, Disconnect, or another safety action during a long connect/recovery operation never invokes the requested command. The test only proves duplicate `connect` calls coalesce (`automaticBackupRuntime.test.ts:62-80`).
**Fix:** Coalesce only identical idempotent commands. Let cancellation/disconnect invalidate the active generation immediately, and serialize or reject incompatible commands explicitly instead of reporting another command's promise as their result.

### WR-04: Scheduler admission failures become unhandled promise rejections

**Fix status:** Fixed (`861ff16`)

**Classification:** WARNING  
**Confidence:** 9/10  
**File:** `src/domains/backup/automaticBackupScheduler.ts:24-55`  
**Issue:** `drain()` awaits workout, eligibility, network, and policy reads outside the only catch handler, while `schedule()` invokes it with `void drain()`. A rejected SQLite/network-classification dependency therefore becomes an unhandled promise rejection; `onError` runs only when `input.run()` rejects.
**Fix:** Wrap the entire drain body in `try/catch/finally`, preserve the pending request when admission cannot be evaluated, and report a bounded failure without leaking an unhandled rejection.

### WR-05: Wi-Fi-only confirmation is shown even while already on Wi-Fi

**Fix status:** Fixed (`6ace42b`)

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `app/more/data-and-recovery.tsx:742-745`  
**Issue:** The route opens the cellular confirmation solely because the saved policy is `wifi_only`; it never checks the current network. The production scheduler has the correct network classification but no `onCellularConfirmationRequired` callback (`productionAutomaticBackupRuntime.ts:266-279`). Thus every manual backup on Wi-Fi misleadingly asks for cellular permission, and the confirmation path bypasses the intended policy decision with `manual_cellular`.
**Fix:** Always submit a normal manual request. Have the scheduler publish a bounded `cellular_confirmation_required` state only when the current classified network is cellular/metered, and submit `manual_cellular` only after that state is confirmed.

---

_Reviewed: 2026-10-01T03:35:40Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
