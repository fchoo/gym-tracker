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
  - src/domains/sync/googleAuthPort.ts
  - src/domains/sync/driveStorePort.ts
  - src/domains/sync/secureSyncKeyPort.ts
  - src/domains/sync/syncContracts.ts
  - src/domains/sync/syncCrypto.ts
  - src/domains/sync/syncCrypto.test.ts
  - src/domains/sync/syncCoordinator.ts
  - src/domains/sync/syncCoordinator.test.ts
  - src/platform/google/googleAuthAdapter.ts
  - src/platform/google/googleAuthAdapter.test.ts
  - src/platform/google/driveStoreAdapter.ts
  - src/platform/google/driveStoreAdapter.test.ts
  - src/platform/secureStore/expoSecureSyncKeyAdapter.ts
  - src/platform/secureStore/expoSecureSyncKeyAdapter.test.ts
  - src/platform/sqlite/migrations/0022_google_drive_sync.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/syncRepository.ts
  - src/platform/sqlite/repositories/syncRepository.test.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/testing/contracts/migrationsEffects.contract.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/syncRepository.test.ts
  - tests/integration/google-drive-sync-tracer.test.ts
  - scripts/run-coverage-gate.mjs
autonomous: false
requirements: [DATA-10]
must_haves:
  truths:
    - "D-01: a versioned Argon2id descriptor derives a 32-byte sync key from the owner passphrase with a 16-byte salt, 19,456 KiB memory, 2 iterations, and parallelism 1; only the derived key is cached in SecureStore, while the passphrase/key never reaches Drive, SQLite, logs, analytics, or exports."
    - "D-02: the native adapters use react-native-nitro-google-signin@^1.3.0 One-Tap with drive.file, Drive REST v3, @noble/ciphers@2.2.0 XChaCha20-Poly1305, and expo-secure-store@~57.0.1; no Firebase, Firestore, family sharing, appDataFolder, or custom cryptography is introduced."
    - "D-03: the tracer discovers or creates exactly one bounded app-created Gym Tracker sync file for the signed-in account, and disconnect can remove local auth/key/config without deleting local SQLite or requiring sign-in for ordinary app use."
    - "D-04: the production tracer downloads before upload, decrypts locally, invokes the execution-time Phase 11 transport-agnostic merge API for the first reconcile, conditionally writes one encrypted Drive file, and never blind-overwrites or awaits sync from the workout commit path."
    - "D-04: auth, download, decrypt, merge/conflict, local-write, and upload failures are safe/retryable and prove the authoritative local canonical dump unchanged; a hanging/rejected sync cannot delay a committed workout command."
    - "D-05: a real fail-closed dependency-advisory audit command is added to package scripts and PR CI before the new dependencies are enabled, and the locked dependency tree including the new native dependencies passes it."
    - "The next execution-time migration (expected v22 after Phase 11 v21) durably stores non-secret sync configuration/status, device identity, remote file cache/revision, and an append-only outbox/change-log while excluding tokens, passphrases, derived keys, plaintext snapshots, and sync bookkeeping from canonical backup export."
  artifacts:
    - {path: src/domains/sync/syncCoordinator.ts, provides: production encrypted single-file Drive round-trip over Phase 11 merge}
    - {path: src/domains/sync/syncCrypto.ts, provides: Argon2id-derived XChaCha20-Poly1305 authenticated envelope boundary}
    - {path: src/platform/google/driveStoreAdapter.ts, provides: bounded same-account Drive REST v3 single-file transport}
    - {path: src/platform/sqlite/migrations/0022_google_drive_sync.ts, provides: durable sync config/status/device/outbox schema}
    - {path: scripts/evaluate-npm-audit.mjs, provides: fail-closed high/critical advisory policy evaluator}
    - {path: tests/integration/google-drive-sync-tracer.test.ts, provides: non-blocking ciphertext-only success/failure tracer proof}
  key_links:
    - {from: owner passphrase, to: SecureStore key cache, via: existing Argon2id KDF with copied buffers wiped and no passphrase persistence}
    - {from: decrypted remote Phase 11 snapshot, to: authoritative SQLite, via: Phase 11 preflight/atomic merge contract rather than a Drive restore writer}
    - {from: Drive upload body, to: sync container, via: fresh 24-byte nonce plus XChaCha20-Poly1305 with canonical AAD}
    - {from: committed workout tracer mutation, to: sync coordinator, via: fire-and-forget post-commit request that is never awaited}
---

<objective>Lead Phase 12 with one production-quality vertical tracer: optional same-account Google connection, passphrase-derived secure key, one encrypted app-created Drive file, one remote-first reconcile through the Phase 11 merge engine, and a post-commit schedule request that cannot block workouts. Ship the prerequisite migration and dependency-advisory gate in this wave.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md
@.planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md
@.planning/phases/11-portable-history-merge-restore/11-01-stable-identity-merge-tracer-PLAN.md
@.planning/phases/11-portable-history-merge-restore/11-02-conflict-engine-PLAN.md
@.planning/phases/11-portable-history-merge-restore/11-04-portability-verification-PLAN.md

**Cross-phase execution contract.** This planning checkout stops at migration 18; Phase 9 v19, Phase 10 v20, and Phase 11 v21/merge modules are execution-time givens. Before editing, confirm all Phase 11 plans completed, inspect the actual migration registry and the exported transport-agnostic merge/preflight/commit API, and bind sync to that API without copying or changing conflict logic. Add the next migration after the real execution-time maximum (expected `0022_google_drive_sync.ts`); do not renumber or guess columns. Plan-time anchors are `src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:1-90`, `src/platform/sqlite/migrations/index.ts:1-37`, `src/platform/sqlite/migrationRunner.ts:220-273`, `src/platform/crypto/passwordKdf.ts:14-44,147-200`, `src/domains/portability/restoreCommands.ts:287-345`, `src/domains/portability/backupContracts.ts:22-79`, `src/bootstrap/workoutAppRuntime.tsx:2081-2108,2333-2347,3019-3050,3431-3454`, `scripts/run-coverage-gate.mjs:16-101`, `.github/workflows/pr.yml:53-70,181-186`, and `package.json:35-96`.

Reuse the sibling only as a read-only source: `/Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts:14-163`, `google-drive/drive-client.ts:1-17,73-137,215-263,266-412,572-615`, `family-sync/encrypted-envelope.ts:56-120,123-208`, and `docs/architecture/0001-encrypted-family-sync.md:6-27`. Adapt the One-Tap, REST, validation, size/origin, and cipher patterns; do not port Firestore, Firebase, X25519, family membership, recovery folders, or multi-account behavior. The sibling audit implementation at `scripts/audit-dependencies.sh:1-15` and `scripts/evaluate-npm-audit.mjs:1-201` is a pattern, not an exception list to copy blindly.
</context>

<tasks>
<task type="checkpoint:decision" gate="blocking">
  <decision>Confirm locked one-way D-01 before publishing the passphrase-to-sync-key protocol.</decision>
  <files>src/domains/sync/syncContracts.ts, src/domains/sync/syncCrypto.ts, src/platform/secureStore/expoSecureSyncKeyAdapter.ts</files>
  <context>D-01 is LOCKED. The accepted protocol is Argon2id descriptor v1, 32-byte output, random 16-byte salt, 19,456 KiB, 2 iterations, parallelism 1; a new device signs into the same Google account and enters the same passphrase once. Only derived key bytes may be cached under an account-subject/protocol-version key in SecureStore. Changing this after ciphertext exists requires re-encrypting/re-uploading every store.</context>
  <options>
    <option id="uphold-d01"><name>Uphold D-01</name><pros>Publishes the approved cross-device decryption contract.</pros><cons>Future KDF changes require an explicit compatible key-rotation/re-encryption migration.</cons></option>
    <option id="stop-plan"><name>Stop execution</name><pros>Avoids publishing an unapproved crypto protocol.</pros><cons>DATA-10 remains incomplete; substituting device-only random keys or Drive-hosted secrets is forbidden.</cons></option>
  </options>
  <resume-signal>Select: uphold-d01 or stop-plan</resume-signal>
  <action>Record exactly one signal. Continue only for `uphold-d01`; otherwise stop before dependency, schema, key, or ciphertext changes. Do not reinterpret the locked decision.</action>
  <verify><manual>The execution record contains `uphold-d01` before Task 2 begins, or execution ends without implementation changes.</manual></verify>
  <acceptance_criteria>D-01 is explicitly accepted as the one-way sync-key compatibility contract.</acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the dependency gate, vetted native stack, ports, and additive sync migration</name>
  <files>package.json, package-lock.json, app.config.ts, .github/workflows/pr.yml, scripts/audit-dependencies.sh, scripts/evaluate-npm-audit.mjs, scripts/evaluate-npm-audit.test.mjs, src/domains/sync/googleAuthPort.ts, src/domains/sync/driveStorePort.ts, src/domains/sync/secureSyncKeyPort.ts, src/domains/sync/syncContracts.ts, src/platform/sqlite/migrations/0022_google_drive_sync.ts, src/platform/sqlite/migrations/index.ts, src/platform/sqlite/repositories/syncRepository.ts, src/platform/sqlite/repositories/syncRepository.test.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/syncRepository.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md, package.json, app.config.ts, .github/workflows/pr.yml, src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts, src/platform/sqlite/migrations/index.ts, src/platform/sqlite/migrationRunner.ts, src/domains/portability/backupContracts.ts, scripts/run-coverage-gate.mjs, /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/package.json, /Users/bytedance/Documents/personal/helper-payroll-app/scripts/audit-dependencies.sh, /Users/bytedance/Documents/personal/helper-payroll-app/scripts/evaluate-npm-audit.mjs</read_first>
  <action>First add a deterministic `audit:dependencies` script and self-tested evaluator. Run `npm audit --audit-level=high --json`; fail closed on malformed/incomplete reports, every critical advisory, and every high advisory unless its exact GHSA/package/path is recorded with a narrow rationale and tested. Do not silently inherit sibling exceptions: evaluate the actual lockfile and make any unavoidable exception explicit, exact, and removable. Wire the self-test and live audit into PR bootstrap/host gates and required-script contract. Only after the gate exists, install/configure `react-native-nitro-google-signin@^1.3.0`, `@noble/ciphers@2.2.0`, and `expo-secure-store@~57.0.1`, run Expo compatibility/CNG checks, and prove the locked tree passes the audit.

Define narrow injectable `GoogleAuthPort`, `DriveStorePort`, and `SecureSyncKeyPort` types. Auth exposes identity/connect/scoped token/refresh/disconnect; Drive accepts/returns bounded opaque bytes plus file ID/revision only; SecureStore accepts derived key bytes only and scopes records by validated Google subject plus protocol version. No port may accept a passphrase and no Drive port may accept a logical snapshot. Add the next additive migration after the actual maximum (expected 22) with: one singleton sync configuration row, opaque device ID, connected account subject/display metadata, cached Drive file ID/revision, safe finite status/last-attempt/last-success/error-code fields, and append-only outbox operations with unique opaque operation IDs and acknowledgement/compaction metadata. Add checks, indexes, FK/immutability guards, upgrade/rollback tests, and real Expo migration contract. Never store OAuth tokens, passphrases, key bytes, plaintext, or exception strings in SQLite. Keep these transport-local tables out of the Phase 11 backup allowlist/reference graph and prove exclusion. Register migration/repository/contract modules in the exact 100% coverage gate.</action>
  <verify><automated>npm run audit:dependencies -- --self-test &amp;&amp; npm run audit:dependencies &amp;&amp; npx expo install --check &amp;&amp; npm run typecheck &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/syncRepository.test.ts &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run verify:cng</automated><native>npm run android:devtest:fresh -- --suite phase12 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>D-02 dependencies and adapter boundaries are installed without Firestore; D-03 one-account/file metadata has a durable non-secret home; D-05 is a real CI/npm advisory gate and the installed tree passes; the execution-time next migration (expected v22) passes host and Expo SQLite and is excluded from portable user data.</acceptance_criteria>
  <done>The audited dependency/native foundation, injectable ports, and durable non-secret sync bookkeeping exist before transport enablement.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <decision>Confirm locked one-way D-04 before connecting Drive reconciliation to the merge writer and workout post-commit seam.</decision>
  <files>src/domains/sync/syncCoordinator.ts, src/bootstrap/workoutAppRuntime.tsx, src/platform/sqlite/repositories/syncRepository.ts</files>
  <context>D-04 is LOCKED. Sync must be derivative: remote-first read/decrypt/validate, Phase 11 plan/commit, then fresh encrypted conditional upload. It may never directly replace the DB, blindly overwrite remote content, run before source commit, or be awaited by workout/edit commands. Every failure remains retryable and preserves local authority.</context>
  <options>
    <option id="uphold-d04"><name>Uphold D-04</name><pros>Preserves local-first workout safety and convergent conflict handling.</pros><cons>Sync is deliberately eventual and must retry contention/failures.</cons></option>
    <option id="stop-plan"><name>Stop execution</name><pros>Prevents an unsafe replication path from shipping.</pros><cons>DATA-10 remains incomplete; weakening the contract is forbidden.</cons></option>
  </options>
  <resume-signal>Select: uphold-d04 or stop-plan</resume-signal>
  <action>Record exactly one signal. Continue only for `uphold-d04`; otherwise stop before coordinator/runtime wiring.</action>
  <verify><manual>The execution record contains `uphold-d04` before Task 4 begins, or no Drive reconcile/runtime changes are made.</manual></verify>
  <acceptance_criteria>D-04 is explicitly accepted before any network-triggered merge or post-commit scheduling path exists.</acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Complete the encrypted one-file remote-first reconciliation tracer</name>
  <files>src/domains/sync/syncContracts.ts, src/domains/sync/syncCrypto.ts, src/domains/sync/syncCrypto.test.ts, src/domains/sync/syncCoordinator.ts, src/domains/sync/syncCoordinator.test.ts, src/platform/google/googleAuthAdapter.ts, src/platform/google/googleAuthAdapter.test.ts, src/platform/google/driveStoreAdapter.ts, src/platform/google/driveStoreAdapter.test.ts, src/platform/secureStore/expoSecureSyncKeyAdapter.ts, src/platform/secureStore/expoSecureSyncKeyAdapter.test.ts, src/platform/sqlite/repositories/syncRepository.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, tests/integration/google-drive-sync-tracer.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md, .planning/phases/11-portable-history-merge-restore/11-01-stable-identity-merge-tracer-PLAN.md, .planning/phases/11-portable-history-merge-restore/11-02-conflict-engine-PLAN.md, src/platform/crypto/passwordKdf.ts, src/domains/portability/restoreCommands.ts, src/bootstrap/workoutAppRuntime.tsx, /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts, /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts, /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/family-sync/encrypted-envelope.ts, /Users/bytedance/Documents/personal/helper-payroll-app/docs/architecture/0001-encrypted-family-sync.md</read_first>
  <action>Implement native adapters by porting only the vetted sibling patterns. Configure One-Tap with the web client ID, request exactly `https://www.googleapis.com/auth/drive.file`, handle cancellation as no connection, refresh stale tokens, and map errors to bounded secret-free codes. The Drive adapter must use only `https://www.googleapis.com`, `redirect: error`, bounded token/response/file sizes, strict exact parsers, a deterministic name/MIME/appProperty query with `trashed=false` and `pageSize=2`, duplicate rejection, create-only-if-absent, media download, conditional revision/ETag update, 401 refresh, 404 rediscovery, and 409/412 contention return. It must expose only opaque bytes and safe metadata.

Implement sync envelope v1 with exact field allowlists, a fresh 24-byte nonce per write, XChaCha20-Poly1305, canonical authenticated metadata, bounded UTF-8/JSON, a generic decrypt failure for wrong passphrase/tamper/AAD/ciphertext/tag errors, and copied secret-buffer wiping. The public header may contain only protocol/KDF descriptor+salt and opaque version identifiers required for derivation; all Phase 11 snapshot/change content is ciphertext. Derive using the locked Argon2id parameters, cache only derived bytes in SecureStore, and clear them on disconnect. Unit tests include a known-answer vector, independent nonce generation, wrong key, tamper, AAD substitution, malformed/oversized data, key/passphrase absence from serialized envelopes/errors/logs/SQLite, and account-scoped SecureStore deletion.

Build a production tracer coordinator accepting only ports plus the actual Phase 11 snapshot/merge API. Connect is optional: establish same-account identity/scope, discover/download an existing store or initialize one, obtain/derive/cache a key, decrypt/validate remote state, ask Phase 11 for a read-only merge plan, atomically commit only that plan, build a fresh canonical logical snapshot with the first append/merge log entry, encrypt, and conditionally upload. On contention re-download/replan with a bounded retry; never PATCH unread remote state. On any auth/network/decrypt/parse/conflict/merge/local-write/upload error publish a safe retryable state. Capture canonical local source before/after injected failures; pre-commit failures must be byte-identical, while post-local-merge upload failure may retain the valid merge but must keep the outbox retryable and never roll back/alter unrelated workout facts. Add one representative post-workout-commit `void coordinator.request('post_commit')` only after the source transaction resolves; do not await it, and catch every rejection. Prove with a deferred/hanging fake that the workout result returns normally before sync resolves, and with fake Drive arguments that every egress body is encrypted envelope bytes containing no source marker, passphrase, key, token, or decrypted row. Add all integrity-critical sync modules to the exact 100% gate.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/sync/syncCrypto.test.ts src/domains/sync/syncCoordinator.test.ts src/platform/google/googleAuthAdapter.test.ts src/platform/google/driveStoreAdapter.test.ts src/platform/secureStore/expoSecureSyncKeyAdapter.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run test:integration -- --runInBand tests/integration/google-drive-sync-tracer.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run audit:dependencies</automated></verify>
  <acceptance_criteria>D-01 derives/caches only the approved key and never egresses secrets; D-02 uses the exact vetted One-Tap/Drive/Noble/SecureStore stack without Firestore; D-03 produces/discovers one app-created file; D-04 proves remote-first merge, conditional ciphertext-only upload, local-safe retryable failures, and a workout path that never awaits sync; D-05 remains passing.</acceptance_criteria>
  <reversibility rating="one-way">D-01 fixes decryptability of uploaded envelope v1, and D-04 fixes the non-authoritative replication contract. Any future change requires compatible envelope/key migration and must never introduce a blocking or blind-write path.</reversibility>
  <done>A production service can optionally connect, round-trip one encrypted Drive file, perform its first Phase 11 reconcile, and be requested after a committed workout without delaying it.</done>
</task>
</tasks>

<verification>Run the named unit/component/host/integration/real-Expo/audit/CNG checks. Review captured fake-port calls to establish ciphertext-only egress and canonical source comparisons to establish fail-safe behavior; do not treat mocked screenshots as persistence or crypto proof.</verification>

<success_criteria>Roadmap criteria 1, 3, 4, and 5 have a working vertical proof: connection is optional; the same-account app-created file is encrypted before Drive; reconciliation uses Phase 11 and never blocks the workout; dependencies pass a newly implemented advisory gate. Criterion 2 is intentionally only one post-commit tracer trigger here and expands in Plan 02.</success_criteria>
