---
phase: 12-automatic-google-drive-sync
plan: 01
type: execute
wave: 1
depends_on: [11-04]
files_modified:
  - package.json
  - package-lock.json
  - app.config.ts
  - .github/workflows/pr.yml
  - scripts/audit-dependencies.sh
  - scripts/evaluate-npm-audit.mjs
  - scripts/evaluate-npm-audit.test.mjs
  - scripts/validate-development-test-app-config.mjs
  - scripts/assert-generated-production-android.mjs
  - scripts/build-current-native-test-apk.sh
  - scripts/run-native-sqlite-contracts.mjs
  - app/__native-contracts.tsx
  - src/domains/backup/automaticBackupContracts.ts
  - src/domains/backup/automaticBackupContracts.test.ts
  - src/domains/backup/googleAuthPort.ts
  - src/domains/backup/driveBackupStorePort.ts
  - src/domains/portability/automaticPortability.ts
  - src/domains/portability/automaticPortability.test.ts
  - src/domains/portability/index.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/portability/restoreCommands.test.ts
  - src/platform/google/googleAuthAdapter.ts
  - src/platform/google/googleAuthAdapter.test.ts
  - src/platform/google/driveBackupStoreAdapter.ts
  - src/platform/google/driveBackupStoreAdapter.test.ts
  - src/platform/sqlite/migrations/0023_automatic_drive_backup.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.test.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/automaticBackupStateRepository.test.ts
  - tests/integration/automatic-portability.test.ts
  - scripts/run-coverage-gate.mjs
autonomous: false
requirements: [DATA-10]
must_haves:
  truths:
    - "Google connection requests exactly drive.file and verifies the token identity with Drive about.get; opaque permissionId is authority and email is display-only."
    - "Production and development-test use disjoint OAuth registrations and remote namespaces derived from the validated package/build profile; neither environment can discover, restore, promote, clean, or delete the other's objects."
    - "DriveBackupSnapshotV1 is bounded canonical unencrypted JSON whose payload_sha256 covers exact canonical header+payload bytes; DriveBackupManifestV1 is at most 16 KiB and stores object_sha256 for immutable latest/previous snapshots."
    - "Manifest reads return the raw HTTP ETag and every update sends the exact If-Match value; Drive version and headRevisionId are never substituted, and no update uses If-Match star."
    - "The additive execution-time next migration, expected v23 after live v22, persists non-secret backup state and a one-time namespace-adoption receipt but no token, payload, passphrase, key, or provider response."
    - "Schema-23 canonical snapshots remain accepted by restore/merge while v23 backup bookkeeping stays outside the Phase 11 logical backup graph."
    - "AutomaticPortableRestorePort and AutomaticPortableMergePort reuse Phase 11 parse, validation, candidate, planning, fingerprinted writer, and rebuild boundaries without file/password/UI semantics."
  artifacts:
    - {path: src/domains/backup/automaticBackupContracts.ts, provides: exact bounded manifest/snapshot/environment/writer-generation contracts}
    - {path: src/platform/google/driveBackupStoreAdapter.ts, provides: environment-scoped Drive REST transport with raw ETag and immutable-object operations}
    - {path: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts, provides: strict backup state, generations, claims, and guarded namespace-adoption schema}
    - {path: src/domains/portability/automaticPortability.ts, provides: transport-neutral direct-restore, merge/adoption, canonical collection, and rebuild ports}
    - {path: tests/integration/automatic-portability.test.ts, provides: schema-23, rollback, adoption, and rebuild boundary proof}
  key_links:
    - {from: GoogleAuthPort token, to: Drive account authority, via: about.get permissionId equality before discovery}
    - {from: Drive manifest read, to: conditional promotion, via: unchanged raw ETag passed as If-Match}
    - {from: verified Drive snapshot, to: SQLite, via: AutomaticPortableRestorePort or AutomaticPortableMergePort only}
    - {from: namespace mismatch, to: adopted merge, via: fresh auth plus one-use adoption receipt inside the fingerprinted writer transaction}
---

<objective>Build the safe foundation for WhatsApp-like replacement-phone backup: vetted Google authentication, strictly isolated Drive transport, versioned unencrypted snapshot and manifest contracts, additive v23 state, early Phase 12 native-harness support, and transport-neutral Phase 11 restore/merge capabilities. No scheduler or user interface may depend on an ambiguous or manual-file boundary.</objective>

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
@.planning/phases/11-portable-history-merge-restore/11-04-SUMMARY.md

Execution starts from the live Phase 11 repository. Confirm the migration registry still ends at 22, then allocate the next version rather than assuming 23. The current canonical collector records PRAGMA user_version, while restoreCommands accepts an explicit schema allowlist; update those contracts together. Preserve Phase 11 manual password-encrypted GTBK behavior exactly.

Reuse helper-payroll-app only as a read-only example for One-Tap and bounded Drive REST parsing. Do not copy its unconditional PATCH, Firestore family transport, encryption envelope, SecureStore key cache, recovery folders, or multi-account behavior. Verify current Google and Expo package documentation during implementation.
</context>

<tasks>
<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Provision the stable Google OAuth identities</name>
  <files>app.config.ts, scripts/validate-development-test-app-config.mjs, scripts/assert-generated-production-android.mjs</files>
  <read_first>app.config.ts, scripts/validate-development-test-app-config.mjs, scripts/assert-generated-production-android.mjs, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md</read_first>
  <action>Before implementing the native adapter, the owner provisions or confirms one durable Google Cloud project with Drive API enabled, one web client ID, and Android OAuth clients for both com.fchoo.gymtracker and com.fchoo.gymtracker.devtest using their actual approved signing SHA-1/SHA-256 fingerprints. Record only non-secret client identifiers and hashed certificate/config evidence; never commit credentials or OAuth tokens. The executor must not invent IDs, switch projects, or weaken package/signing checks to pass locally. Bind EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID through the documented build environment and add fail-closed config assertions for missing, placeholder, wrong-project, wrong-package, or wrong-profile values.</action>
  <verify><automated>node scripts/validate-development-test-app-config.mjs &amp;&amp; node scripts/assert-generated-production-android.mjs</automated><manual>Owner confirms the Google Cloud project, Drive API, web client, and both Android package/signing registrations exist and supplies the approved public web client ID through the build environment.</manual></verify>
  <acceptance_criteria>The executor has verified, non-secret configuration for one stable project and both package/signing identities before installing or exercising One-Tap; no placeholder or unregistered build may continue.</acceptance_criteria>
  <done>The external OAuth prerequisite is real and auditable rather than assumed by source code.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Define bounded backup contracts and the audited Google boundary</name>
  <files>package.json, package-lock.json, app.config.ts, .github/workflows/pr.yml, scripts/audit-dependencies.sh, scripts/evaluate-npm-audit.mjs, scripts/evaluate-npm-audit.test.mjs, scripts/validate-development-test-app-config.mjs, scripts/assert-generated-production-android.mjs, src/domains/backup/automaticBackupContracts.ts, src/domains/backup/automaticBackupContracts.test.ts, src/domains/backup/googleAuthPort.ts, src/domains/backup/driveBackupStorePort.ts, src/platform/google/googleAuthAdapter.ts, src/platform/google/googleAuthAdapter.test.ts, src/platform/google/driveBackupStoreAdapter.ts, src/platform/google/driveBackupStoreAdapter.test.ts</files>
  <read_first>app.config.ts, package.json, .github/workflows/pr.yml, scripts/validate-development-test-app-config.mjs, scripts/assert-generated-production-android.mjs, src/domains/portability/backupContracts.ts, /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts, /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts</read_first>
  <action>Start with failing parser and adapter tests. Define exact DriveBackupSnapshotV1 and DriveBackupManifestV1 field allowlists. Snapshot JSON contains exact `header`, `payload`, and `payload_sha256` fields. The header includes protocol, environment, package identity, snapshot ID, owner namespace, writer epoch, captured mutation generation, created time, and schema version; payload is the canonical Phase 11 logical snapshot. Compute lowercase `payload_sha256` over the canonical UTF-8 bytes of the exact `{header,payload}` object, excluding the digest field itself. Each manifest descriptor separately stores lowercase `object_sha256` over the complete uploaded snapshot bytes. DriveBackupManifestV1 is an exact tagged union: `active` has latest plus optional previous; `deleted` has a successor writer epoch and deletion time with no snapshot references or workout content. Reuse Phase 11 limits: 24 MiB canonical snapshot bytes, 100,000 total rows, 25,000 rows per table, and 64 KiB strings. Limit either manifest variant to 16 KiB. SHA-256 is corruption detection only; no copy may imply encryption, authenticity, or resistance to an account holder replacing both bytes and hashes.

Add a fail-closed dependency audit before installing react-native-nitro-google-signin and its required react-native-nitro-modules peer. Do not add Noble ciphers or expo-secure-store. Configure one durable Google Cloud project/web client with separate Android OAuth registrations for com.fchoo.gymtracker and com.fchoo.gymtracker.devtest and their approved signing certificates. Validate EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID without embedding credentials. Generated production/dev-test assertions must prove distinct package identity and backup namespace.

GoogleAuthPort exposes connect, scoped token refresh, verified identity, fresh reauthentication, and disconnect. After drive.file consent, call about.get for user(permissionId,emailAddress); persist opaque permissionId only as account authority and sanitize email for display. Reject cancellation, missing scope, token/account mismatch, and late completion after connection generation changes with bounded codes.

DriveBackupStorePort deals only in bounded bytes and safe metadata. Derive exact production/development-test appProperties from validated build profile/package. Reject the opposite environment before downloading content. Implement bounded discovery; manifest read returning raw HTTP ETag; immutable snapshot creation by one multipart metadata+media request for at most 5 MiB; resumable-session create/query/resume/cancel above 5 MiB; bounded streaming download even without Content-Length; conditional manifest create/update using the exact raw ETag; generation-fenced trash for retention; and permanent delete for the separately confirmed tombstone sweep. Before either snapshot upload mode, obtain and durably record a Drive-generated candidate file ID; retry the same ID after ambiguous failure so process death cannot create duplicate candidates. For idempotent manifest bootstrap, likewise persist one Drive-generated manifest file ID before creation and retry that ID. Quarantine if discovery ever returns multiple manifest candidates; list-then-create and display-name uniqueness are not locks. Never send If-Match star or substitute Drive version/headRevisionId. Refresh before an expiring-token chunk when possible; on a 401 during a resumable session, refresh once and retry the same acknowledged offset rather than restarting or duplicating bytes. Treat redirects, non-Google origins, malformed JSON, excess list results, stale sessions, 404, 409, 412, timeouts, and partial responses explicitly.</action>
  <verify><automated>node --test scripts/evaluate-npm-audit.test.mjs &amp;&amp; npm run audit:dependencies &amp;&amp; npm run test:unit -- --runInBand src/domains/backup/automaticBackupContracts.test.ts src/platform/google/googleAuthAdapter.test.ts src/platform/google/driveBackupStoreAdapter.test.ts &amp;&amp; npx expo install --check &amp;&amp; npx expo-doctor &amp;&amp; npm run verify:cng &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated></verify>
  <acceptance_criteria>Tests cover exact and excess bounds, canonical digest, corruption, future schema classification, cross-environment rejection at list/read/write/trash, permissionId identity, account switch, raw ETag propagation, If-Match, multipart/resumable 5 MiB boundary, preallocated candidate/manifest ID retry after ambiguous failure, interrupted resume, and dependency/CNG configuration. Source scans find no automatic-backup cipher, passphrase, SecureStore, Firebase, Firestore, appDataFolder, or broad Drive scope.</acceptance_criteria>
  <done>The project has one audited, environment-isolated Google/Drive boundary and exact plaintext backup protocol with no blind-write or cross-environment path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add v23 backup state, schema compatibility, and native harness support</name>
  <files>src/platform/sqlite/migrations/0023_automatic_drive_backup.ts, src/platform/sqlite/migrations/index.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts, src/domains/portability/restoreCommands.ts, src/domains/portability/restoreCommands.test.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/automaticBackupStateRepository.test.ts, scripts/build-current-native-test-apk.sh, scripts/run-native-sqlite-contracts.mjs, app/__native-contracts.tsx, scripts/run-coverage-gate.mjs</files>
  <read_first>src/platform/sqlite/migrations/index.ts, src/platform/sqlite/migrations/0022_portable_owner_identities.ts, src/platform/sqlite/migrationRunner.ts, src/domains/portability/restoreCommands.ts, src/domains/portability/backupContracts.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, scripts/run-native-sqlite-contracts.mjs, app/__native-contracts.tsx</read_first>
  <action>After confirming the live maximum, add the next additive migration, expected 23. Create strict non-secret automatic_backup_state and automatic_backup_namespace_adoption storage. State includes one singleton, environment, validated permissionId/display metadata, connection generation, cached manifest ID/ETag, writer epoch and authority state, mutation_generation, backed_up_generation, dirty_since, last attempt/success, data-use policy, bounded status/error, and restart-safe claim identifiers. Do not store OAuth tokens, raw provider payloads, snapshot bytes, workout rows, passphrases, or keys. Keep all Phase 12 bookkeeping outside LOGICAL_BACKUP_TABLE_DEFINITIONS and retained-reference graphs.

Create the complete v23 trigger contract in this wave; later plans must not rewrite an already-applied migration. Drive the mutation-generation triggers from the explicit Phase 11 canonical user-owned table registry rather than a hand-maintained UI command list. INSERT, UPDATE, and DELETE of authoritative user facts atomically advance mutation_generation and preserve the first dirty_since value; exclude bundled catalogs, replayable derivatives, backup bookkeeping, and guarded restore/adoption internals. Add a fail-closed mapping test so a future canonical authoritative table cannot silently escape backup.

Preserve ordinary owner_namespace immutability. Amend the v23 trigger contract only enough for a private one-use adoption transaction: a matching unconsumed receipt binds account permissionId, environment, old namespace, new namespace, local fingerprint, remote snapshot digest, and expiry. The owner update is permitted only while that receipt is present in the same transaction; the writer consumes it before commit and verifies triggers/FKs/schema. No public repository method may perform an arbitrary namespace update.

Extend the supported logical snapshot schema set through the actual new version while retaining explicit compatibility. Prove a schema-23 snapshot with the unchanged canonical table graph parses, restores, merges, and rebuilds, while backup-state tables never appear in it. Register Phase 12 in build-current-native-test-apk.sh, app/__native-contracts.tsx, and run-native-sqlite-contracts.mjs now, so this wave can run migrations-effects against artifacts/native/phase12/build.json instead of deferring harness support to Plan 04. Preserve earlier phase suite compatibility.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/restoreCommands.test.ts src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/automaticBackupStateRepository.test.ts &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run typecheck</automated><native>npm run android:devtest:fresh -- --suite phase12 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>Populated v22 upgrades to strict v23 on host and real Expo SQLite; rollback and verify failures preserve the prior database; schema 23 is explicitly compatible; every canonical authoritative table has tested atomic generation coverage; bookkeeping is excluded from backups; arbitrary namespace updates still fail; and the Phase 12 manifest can run migrations-effects in Wave 1.</acceptance_criteria>
  <done>The live database can persist backup/claim state safely and read its own schema-23 canonical snapshots before later waves use either capability.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Publish narrow automatic restore, merge, adoption, and snapshot ports</name>
  <files>src/domains/portability/automaticPortability.ts, src/domains/portability/automaticPortability.test.ts, src/domains/portability/index.ts, src/platform/sqlite/repositories/logicalMergeRepository.ts, src/platform/sqlite/repositories/logicalMergeRepository.test.ts, tests/integration/automatic-portability.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/portability/restoreCommands.ts, src/domains/portability/mergeCommands.ts, src/domains/portability/mergePlan.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/platform/sqlite/repositories/logicalRestoreRepository.ts, src/platform/sqlite/repositories/logicalMergeRepository.ts, src/platform/sqlite/repositories/restorePreflightAdapters.ts, src/platform/sqlite/repositories/restoreReconciliationRepository.ts</read_first>
  <action>Create transport-neutral AutomaticPortableRestorePort and AutomaticPortableMergePort plus a canonical snapshot collector port. They accept already parsed/bounded logical snapshots and no Drive, OAuth, file-picker, password, or confirmation-string types. Internally preserve this order: parseLogicalBackupSnapshot; validateLogicalRestoreSnapshot with live schema and retained references; candidate probe; owner/adoption decision; buildPortableMergePlan where applicable; live fingerprint recheck inside the one private writer transaction; commit full graph; mark rebuild pending; reconcileAndRebuild; then return ready only after parity.

Direct restore is allowed only when the local user-owned graph is empty and the current backup restore claim remains valid. Define empty as zero owner-created portable facts across the Phase 11 canonical graph, excluding portable_owner_identity, bundled catalog rows, rebuildable derivatives, and Phase 12 bookkeeping; test every included aggregate class so a partial local history cannot be misclassified. Non-empty restore always returns a bounded preview and requires the Phase 11 confirmation token. Namespace match uses normal merge. Namespace mismatch returns an adoption-required preview; after fresh Google authentication is represented by a short-lived receipt, commit namespace adoption, the complete planned merge, generation state, and adoption consumption inside one serialized transaction. Validate all portable-ID collisions before mutation. A stale fingerprint, receipt, claim, connection generation, account, environment, active workout, writer error, or rebuild error cannot report success. Rebuild failure remains durably pending and is retryable after restart.

Expose canonical collection through the existing logicalBackupRepository only. Capture snapshot rows, schema version, owner namespace, and mutation generation in one short repository-owned serialized `BEGIN IMMEDIATE` transaction; do not substitute a reader/WAL snapshot or direct `withExclusiveTransactionAsync` call. Return plain facts so encoding, hashing, and Drive work happen after commit and release. Do not clone the backup allowlist or expose the private full-plan writer. Add every new integrity-critical module to the exact 100 percent coverage gate.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/automaticPortability.test.ts src/domains/portability/mergeCommands.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/automaticBackupStateRepository.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/automatic-portability.test.ts &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run typecheck</automated></verify>
  <acceptance_criteria>Tests prove schema-23 direct restore, normal merge, one-time adoption, collision rejection, retained-reference failure, candidate failure, stale fingerprint/receipt/claim/account/environment, writer rollback, rebuild retry, active-workout refusal, and canonical collection at one captured generation. Every precommit failure leaves authoritative rows, namespace, generations, schema, and triggers byte-equivalent.</acceptance_criteria>
  <done>Later Drive/UI work has one explicit, verified Phase 11 boundary for replacement recovery and one canonical snapshot source, without abusing the manual GTBK commands.</done>
</task>
</tasks>

<verification>Run the complete focused unit, host SQLite, integration, exact coverage, dependency, Expo/CNG, and Phase 12 migrations-effects native gates. Review generated Android identities for both profiles and inspect adapter requests to prove drive.file, Google origins, raw ETag/If-Match, and environment isolation.</verification>

<success_criteria>Wave 1 ends with executable Google and Drive boundaries, exact bounded unencrypted backup contracts, strict v23 state and schema compatibility, early native-harness support, and narrow automatic portability ports whose rollback/rebuild guarantees match Phase 11.</success_criteria>

<output>Create .planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md when done.</output>
