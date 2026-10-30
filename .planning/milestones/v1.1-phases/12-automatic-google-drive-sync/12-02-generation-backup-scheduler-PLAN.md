---
phase: 12-automatic-google-drive-sync
plan: 02
type: execute
wave: 2
depends_on: [12-01]
files_modified:
  - src/domains/backup/automaticBackupContracts.ts
  - src/domains/backup/automaticBackupContracts.test.ts
  - src/domains/backup/automaticBackupCoordinator.ts
  - src/domains/backup/automaticBackupCoordinator.test.ts
  - src/domains/backup/automaticBackupScheduler.ts
  - src/domains/backup/automaticBackupScheduler.test.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.test.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutLifecycle.ts
  - src/bootstrap/workoutLifecycle.test.ts
  - app/__native-contracts.tsx
  - scripts/run-native-sqlite-contracts.mjs
  - src/testing/contracts/googleDriveBackup.contract.ts
  - src/testing/contracts/googleDriveBackup.contract.test.ts
  - tests/sqlite-host/automaticBackupStateRepository.test.ts
  - tests/integration/automatic-drive-backup.test.ts
  - scripts/run-coverage-gate.mjs
autonomous: true
requirements: [DATA-10]
must_haves:
  truths:
    - "Every committed user-owned mutation atomically advances mutation_generation; process death cannot forget that a new canonical snapshot is owed."
    - "backed_up_generation advances only for a receipt bound to the exact captured local generation, source digest, immutable snapshot ID, accepted manifest ETag, account, environment, and current writer epoch."
    - "One active writer epoch is a semantic fence in addition to Drive If-Match; a retired writer becomes terminally stale and cannot retry under a successor epoch."
    - "A backup promotion is upload immutable candidate, bounded download and full validation, conditional manifest update, manifest reread, then conditional local acknowledgement; failure leaves latest/previous and local facts safe."
    - "Restore-first quarantine permits discovery and validation only. Local restore/merge commits before a restart-safe conditional writer claim; a non-empty merge remains dirty until its combined snapshot is promoted."
    - "Snapshot collection uses the Phase 11 coherent collector only while no workout is active, captures generation in the same short transaction, and releases SQLite before encoding, hashing, or Drive I/O."
    - "Launch and foreground guarantee retry of durable pending work; background is one abortable best-effort opportunity and never promises completion after process suspension."
    - "The scheduler is single-flight and coalescing, defaults to Wi-Fi and cellular, honors Wi-Fi-only, never blocks workout commands, and exposes a 24-hour stale condition without interrupting a workout."
  artifacts:
    - {path: src/domains/backup/automaticBackupCoordinator.ts, provides: quarantine, claim, immutable promotion, recovery scan, retention, and acknowledgement state machine}
    - {path: src/domains/backup/automaticBackupScheduler.ts, provides: idle-only single-flight coalescing and lifecycle/network retry policy}
    - {path: src/platform/sqlite/repositories/automaticBackupStateRepository.ts, provides: atomic generations, writer claims, receipts, warning age, and restart recovery}
    - {path: src/testing/contracts/googleDriveBackup.contract.ts, provides: shared host/Expo generation, crash-cut, fencing, and retention contract}
    - {path: tests/integration/automatic-drive-backup.test.ts, provides: complete fake-Drive backup and replacement-handover tracer}
  key_links:
    - {from: authoritative SQLite mutation, to: mutation_generation, via: v23 table triggers in the same transaction}
    - {from: captured canonical facts, to: Drive candidate, via: one generation and source digest captured while idle}
    - {from: verified Drive candidate, to: latest/previous, via: raw-ETag If-Match manifest promotion}
    - {from: accepted manifest receipt, to: backed_up_generation, via: conditional local acknowledgement that cannot cover a later mutation}
    - {from: replacement restore, to: successor writer authority, via: durable pending claim and conditional manifest epoch transfer}
---

<objective>Turn Wave 1's safe ports into a complete single-active-device backup engine. Replace the rejected change-log design with durable source generations, immutable latest/previous promotion, writer fencing, restart-safe handover, and a coalesced scheduler that cannot delay an active workout.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md
@.planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md
@.planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md
@.planning/phases/11-portable-history-merge-restore/11-04-SUMMARY.md

Read the actual Wave 1 summary and preserve these public names unless execution found a documented reason to adjust them: GoogleAuthPort, DriveBackupStorePort, DriveBackupSnapshotV1, DriveBackupManifestV1, AutomaticPortableRestorePort, AutomaticPortableMergePort, AutomaticBackupStateRepository, AutomaticBackupCoordinator, and AutomaticBackupScheduler. Do not introduce syncChangeLog, an operation outbox, conflict convergence, or a second merge engine.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Make source generations atomic and auditable</name>
  <files>src/platform/sqlite/repositories/automaticBackupStateRepository.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/platform/sqlite/repositories/logicalBackupRepository.test.ts, tests/sqlite-host/automaticBackupStateRepository.test.ts, src/testing/contracts/googleDriveBackup.contract.ts, src/testing/contracts/googleDriveBackup.contract.test.ts, app/__native-contracts.tsx, scripts/run-native-sqlite-contracts.mjs, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md, src/domains/portability/backupContracts.ts, src/platform/sqlite/migrations/0023_automatic_drive_backup.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/platform/sqlite/serializedWriter.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.ts</read_first>
  <action>Consume the immutable v23 trigger contract created in Plan 12-01; do not edit or replace migration 23. Add repository and shared-contract coverage that enumerates the explicit Phase 11 canonical user-owned table registry and proves INSERT, UPDATE, and DELETE of each authoritative fact atomically advance mutation_generation while preserving the first dirty_since value. Prove bundled catalogs, replayable derivatives, automatic-backup bookkeeping, and guarded restore/adoption internals do not self-dirty. Fail if a future canonical authoritative table lacks a v23 trigger.

Define repository transactions for connection generation, quarantine state, writer epoch, pending claim, attempt lease, captured generation/source digest, accepted manifest receipt, data-use policy, stale time, disconnect, and deletion state. Acknowledge only when account permissionId, environment, connection generation, writer epoch, snapshot ID, source digest, captured generation, manifest ID, and reread ETag all match. A mutation after capture remains dirty. A stale lease or process death can be recovered, but no claim can be stolen while valid. Add the `google-drive-backup` suite to the Phase 12 native route and runner, preserving `migrations-effects` and all earlier suite compatibility; fail closed on a manifest/suite mismatch or unknown case ID.

Extend the canonical collector input/output so mutation_generation and source rows are read under the same short repository-owned serialized `BEGIN IMMEDIATE` transaction. Return immutable facts and release the writer before canonical JSON encoding, SHA-256, upload, or download. For clean cloud restore, acknowledge the verified source only after post-restore canonical equality; non-empty merge is always dirty. Add byte-equivalent rollback assertions for every repository stage and exact 100 percent coverage.</action>
  <verify><automated>npm run test:unit -- --runInBand src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts src/testing/contracts/googleDriveBackup.contract.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/automaticBackupStateRepository.test.ts tests/sqlite-host/logicalBackupRepository.test.ts &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run typecheck</automated><native>npm run test:sqlite:device -- --suite google-drive-backup --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>Every authoritative table has tested atomic dirty coverage; rollback leaves source and generation unchanged; one capture contains exactly one source generation; a later mutation cannot be acknowledged by an earlier receipt; clean restore equality may acknowledge, merge remains dirty; and the same named generation cases pass on host and real Expo SQLite.</acceptance_criteria>
  <done>The database itself remembers exactly when a backup is owed and accepts success only for the source state actually promoted.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement quarantine, writer handover, validated promotion, and recovery</name>
  <files>src/domains/backup/automaticBackupContracts.ts, src/domains/backup/automaticBackupContracts.test.ts, src/domains/backup/automaticBackupCoordinator.ts, src/domains/backup/automaticBackupCoordinator.test.ts, src/testing/contracts/googleDriveBackup.contract.ts, tests/integration/automatic-drive-backup.test.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx</files>
  <read_first>src/domains/backup/automaticBackupContracts.ts, src/domains/backup/driveBackupStorePort.ts, src/domains/portability/automaticPortability.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.ts, src/platform/google/driveBackupStoreAdapter.ts, src/bootstrap/workoutAppRuntime.tsx</read_first>
  <action>Implement AutomaticBackupCoordinator as an explicit persisted state machine. On connect, verify permissionId/environment and enter quarantine before discovery. In quarantine no upload, manifest mutation, cleanup, or deletion is legal. Zero matching artifacts may enter first-backup initialization, but no authoritative manifest or writer epoch is created until the first immutable candidate has passed bounded round-trip validation; only then create the manifest with that candidate as latest using the persisted bootstrap file ID. A missing manifest with snapshot objects triggers a bounded exact-namespace scan, not initialization. Multiple manifest candidates remain quarantined. A valid manifest validates latest first and previous only when needed. Corrupt latest may offer dated verified previous; a future-schema latest returns update_required and never falls back or overwrites.

Restore/merge uses the Wave 1 automatic portability ports and defers while any workout is active. Persist a pending claim before the local transaction. After successful restore/rebuild, conditionally update the manifest to a fresh successor writer epoch using its raw ETag and reread it; only then activate this installation. Claim failure preserves local restored facts but grants no upload authority. If claim receives an ETag conflict, reenter quarantine and revalidate the new remote latest; never claim over changed content. Retry may claim directly only when the restored source still matches, otherwise it presents a fresh merge/restore decision. Clean restore may acknowledge the existing verified source after exact canonical equality. Non-empty merge remains dirty until a new combined snapshot is promoted. A prior epoch that rereads a successor becomes terminal stale_writer and never retries under it.

For backup, acquire a bounded lease, collect canonical facts plus generation while idle, release SQLite, encode the exact header+payload preimage, compute payload_sha256, serialize the complete snapshot, compute object_sha256, persist a preallocated Drive candidate ID, and use multipart upload at or below 5 MiB or a persisted resumable session above 5 MiB. Retry ambiguous creation with the same candidate ID. Download the candidate through the bounded path and validate exact complete bytes/object_sha256, inner canonical preimage/payload_sha256, environment, namespace, writer epoch, schema, graph, and generation. Then If-Match-promote a manifest whose latest is the candidate and previous is the former verified latest; reread/validate the manifest before conditionally acknowledging locally. An ETag conflict rereads state; retry is allowed only under the same writer epoch and must rebuild from current local facts. Never overwrite a snapshot.

If the manifest is absent/corrupt, scan a fixed tested maximum of exact-namespace immutable objects, validate each fully, reject ambiguous writer lineages, and conditionally reconstruct from the newest valid generation pair. A valid deleted tombstone suppresses recovery scanning and cannot be treated as empty Drive. For retention, never trash manifest-referenced objects. Only the current writer may, after a 24-hour grace period, reread the manifest and trash a still-unreferenced same-environment object under matching epoch/ETag; cleanup failure is non-fatal. Disconnect performs no cleanup. A separate delete operation requires the fresh-auth grant supplied by the UI boundary, conditionally promotes a successor-epoch deleted tombstone containing no owner/account/file identifiers or workout data, then permanently deletes only same-environment snapshot objects. Report partial failure honestly and repeat a bounded deletion sweep whenever the tombstone is discovered until no snapshot remains, covering a stale candidate upload that finishes after the first sweep. Keep the tombstone. A later new-backup flow requires fresh authentication and an explicit tombstone-to-active claim.

Build a deterministic crash-cut matrix after quarantine persistence, candidate upload, candidate validation, manifest promotion, manifest reread, local acknowledgement, restore/merge commit, writer claim, and cleanup selection. Reopen state and prove either the old verified pair or the new verified pair remains usable, never a mixed state. Cover 401 refresh, 404 rediscovery, timeouts, malformed/oversized data, resumable interruption, 409/412, stale writer, account switch, connection-generation cancellation, corrupt latest, future schema, missing manifest, orphan cleanup, and delete failure.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/backup/automaticBackupContracts.test.ts src/domains/backup/automaticBackupCoordinator.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/automatic-drive-backup.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run typecheck</automated><native>npm run test:sqlite:device -- --suite google-drive-backup --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>The full crash-cut and error matrix leaves local source plus latest/previous recoverable; stale epochs cannot publish/acknowledge/clean; upload is not success until round-trip validation, promotion, reread, and receipt; direct restore, merge/adoption, claim failure, fallback, future schema, manifest scan, retention, disconnect, and delete meet the binding contract.</acceptance_criteria>
  <done>One installation can safely initialize, back up, restore, take over, recover, retain, and delete without live multi-device reconciliation or blind writes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Schedule one idle, coalesced, non-blocking backup stream</name>
  <files>src/domains/backup/automaticBackupScheduler.ts, src/domains/backup/automaticBackupScheduler.test.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/bootstrap/workoutLifecycle.ts, src/bootstrap/workoutLifecycle.test.ts, tests/integration/automatic-drive-backup.test.ts</files>
  <read_first>src/domains/backup/automaticBackupCoordinator.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutLifecycle.ts, src/bootstrap/workoutLifecycle.test.ts</read_first>
  <action>Implement AutomaticBackupScheduler with one single-flight run, finite debounce, bounded exponential backoff plus deterministic-test jitter, attempt deadline, connectivity policy, and trailing-run coalescing. Requests are launch, foreground, post_commit, manual, retry, and one active-to-inactive/background opportunity. Launch and foreground guarantee recovery when mutation_generation exceeds backed_up_generation or a persisted claim/attempt needs resolution. Background starts or continues at most one abortable best-effort attempt and never claims guaranteed completion. Do not add polling, WorkManager, or another background framework.

Automatic capture is ineligible while a workout is active, while quarantine/claim/restore/delete is active, while no current writer authority exists, or while Wi-Fi-only is waiting on cellular. Manual Back up now has priority but still defers during an active workout. A one-run cellular override is call-scoped and never changes the stored policy. Every successful authoritative runtime command makes a fire-and-forget scheduler request only after its SQLite transaction returns; it never awaits Drive, and rejected/cancelled commands schedule nothing. Because dirty marking lives in SQLite triggers, a crash between source commit and runtime notification remains recoverable on foreground.

Persist dirty_since from the first unprotected generation. Failed attempts do not reset it. At 24 hours expose a bounded stale condition; clear it only after a matching receipt. Treat first-backup initialization as backup_pending with no remote manifest until validation succeeds; under Wi-Fi-only on cellular it waits safely, and Back up now may use the one-run cellular confirmation for this first snapshot. Test rapid edits, repeated lifecycle flapping, hanging/rejected coordinator calls, disconnect/reconnect, account switch, stale writer, foreground after process kill, active-workout deferral and finish release, Wi-Fi changes, first-backup Wi-Fi-only deferral, manual cellular cancel/confirm, and a mutation during upload. Prove complete, undo, finish, correction, plan/edit, and Phase 9/10 commands acknowledge without awaiting backup.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/backup/automaticBackupScheduler.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx src/bootstrap/workoutLifecycle.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/automatic-drive-backup.test.ts &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run typecheck</automated></verify>
  <acceptance_criteria>Generations G through G+n coalesce into one idle snapshot at n; a later mutation schedules a trailing run; active workouts and lifecycle acknowledgements never wait; process death recovers; background remains best effort; connectivity policy and 24-hour warning are exact; no request storm, unhandled rejection, or stale-account continuation exists.</acceptance_criteria>
  <done>Automatic backup is durable and timely without adding latency or network dependence to the workout critical path.</done>
</task>
</tasks>

<verification>Run the focused unit, component, host SQLite, integration, exact coverage, and real Expo google-drive-backup contracts. The shared contract and integration suite must include the crash-cut matrix, writer fencing, generation acknowledgement, latest/previous rotation, manifest recovery, retention, and scheduler non-blocking proofs.</verification>

<success_criteria>Wave 2 delivers the complete internal backup engine: atomic dirty generations, exact acknowledgement, one active writer, safe replacement handover, immutable verified latest/previous snapshots, restart-safe recovery, bounded cleanup, and an idle scheduler that never blocks workouts.</success_criteria>

<output>Create .planning/phases/12-automatic-google-drive-sync/12-02-SUMMARY.md when done.</output>
