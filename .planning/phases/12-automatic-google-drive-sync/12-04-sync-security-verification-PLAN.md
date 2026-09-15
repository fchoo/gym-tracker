---
phase: 12-automatic-google-drive-sync
plan: 04
type: execute
wave: 4
depends_on: [12-03]
files_modified:
  - src/domains/sync/syncCrypto.test.ts
  - src/domains/sync/syncChangeLog.test.ts
  - src/domains/sync/syncCoordinator.test.ts
  - src/domains/sync/syncScheduler.test.ts
  - src/platform/google/googleAuthAdapter.test.ts
  - src/platform/google/driveStoreAdapter.test.ts
  - src/platform/secureStore/expoSecureSyncKeyAdapter.test.ts
  - src/platform/sqlite/repositories/syncRepository.test.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - src/testing/contracts/googleDriveSync.contract.ts
  - src/testing/contracts/googleDriveSync.contract.test.ts
  - app/__native-contracts.tsx
  - scripts/run-native-sqlite-contracts.mjs
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/syncRepository.test.ts
  - tests/integration/google-drive-sync.test.ts
  - scripts/run-coverage-gate.mjs
  - scripts/evaluate-npm-audit.mjs
  - scripts/evaluate-npm-audit.test.mjs
  - scripts/phase12-evidence-scripts.test.mjs
  - scripts/run-phase12-maestro.mjs
  - maestro/phase12/google-drive-sync.yaml
  - package.json
  - .github/workflows/pr.yml
autonomous: true
requirements: [DATA-10]
must_haves:
  truths:
    - "D-01: final evidence proves exact Argon2id parameters, new-device same-passphrase derivation, SecureStore-only derived-key caching, disconnect deletion, buffer wiping, and zero passphrase/key leakage to Drive, SQLite, logs, analytics, exports, errors, snapshots, or test artifacts."
    - "D-02: auth/Drive/SecureStore are exercised behind deterministic ports; native configuration uses the pinned vetted versions and drive.file only, and dependency/source scans prove no Firestore/Firebase/family-sync transport was introduced."
    - "D-03: tests prove one app-created file per account, duplicate-file fail-closed behavior, same-account rediscovery, optional/no-account use, explicit disconnect, remote-file preservation, and retained DATA-09 fallback."
    - "D-04: every auth/network/decryption/validation/conflict/local-write/upload/acknowledgement failure class is retryable and source-safe; two-device contention converges through Phase 11; foreground/background/post-commit triggers never await sync or mutate the live workout path."
    - "D-05: CI runs the self-tested dependency-advisory gate and it passes the final lockfile/native dependency set, failing closed on any unreviewed high/critical advisory or malformed audit report."
    - "All integrity-critical sync crypto/contracts/change-log/coordinator/scheduler/ports/migration/repository modules are individually 100% statements, branches, functions, and lines through npm run test:coverage."
    - "Real Expo SQLite contracts prove migration/outbox atomicity and rollback; Maestro proves lifecycle-visible UI only, never substitutes for persistence, crypto, egress, or non-blocking evidence."
  artifacts:
    - {path: src/testing/contracts/googleDriveSync.contract.ts, provides: shared real-Expo migration/outbox/source-safety contract}
    - {path: tests/integration/google-drive-sync.test.ts, provides: exhaustive failure, two-device convergence, egress, and critical-path matrix}
    - {path: scripts/run-coverage-gate.mjs, provides: per-file 100% integrity-critical Phase 12 gate}
    - {path: scripts/phase12-evidence-scripts.test.mjs, provides: fail-closed D-01..D-05/DATA-10/roadmap evidence mapping}
  key_links:
    - {from: D-01..D-05 and DATA-10, to: named automated/native/Maestro evidence, via: phase12 evidence matrix}
    - {from: fake Drive/auth/SecureStore ports, to: security assertions, via: captured argument/body inspection and secret canaries}
    - {from: authoritative SQLite before failure, to: authoritative SQLite after failure, via: canonical byte/digest plus schema/trigger comparison}
---

<objective>Close Phase 12 with exhaustive security-boundary, fail-safe, non-blocking, convergence, migration, accessibility, native, coverage, and dependency-advisory evidence mapped to D-01..D-05, DATA-10, and all five roadmap criteria.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md
@.planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md
@.planning/phases/12-automatic-google-drive-sync/12-01-encrypted-drive-tracer-PLAN.md
@.planning/phases/12-automatic-google-drive-sync/12-02-change-log-scheduler-reconcile-PLAN.md
@.planning/phases/12-automatic-google-drive-sync/12-03-settings-sync-ux-PLAN.md

Plan-time verification anchors are `scripts/run-coverage-gate.mjs:16-101`, `src/testing/contracts/migrationsEffects.contract.ts:1-40,122-130`, `tests/sqlite-host/logicalRestoreRepository.test.ts:375-405`, `tests/sqlite-host/cleanInstallRestore.test.ts:345-460`, `app/more/__tests__/data-and-recovery.test.tsx:273-429`, `maestro/phase5/data-recovery.yaml:7-26`, `.github/workflows/pr.yml:53-70,181-186`, and `package.json:35-96`. At execution read the actual Plan 01-03 summaries and use one fresh `artifacts/native/phase12/build.json`; never claim native or lifecycle proof from host mocks alone.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Complete the fail-safe, ciphertext-egress, and convergence matrix</name>
  <files>src/domains/sync/syncCrypto.test.ts, src/domains/sync/syncChangeLog.test.ts, src/domains/sync/syncCoordinator.test.ts, src/domains/sync/syncScheduler.test.ts, src/platform/google/googleAuthAdapter.test.ts, src/platform/google/driveStoreAdapter.test.ts, src/platform/secureStore/expoSecureSyncKeyAdapter.test.ts, src/platform/sqlite/repositories/syncRepository.test.ts, src/bootstrap/workoutAppRuntime.test.tsx, tests/sqlite-host/syncRepository.test.ts, tests/integration/google-drive-sync.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md, scripts/run-coverage-gate.mjs, src/bootstrap/workoutAppRuntime.tsx, src/platform/sqlite/serializedWriter.ts, tests/sqlite-host/logicalRestoreRepository.test.ts</read_first>
  <action>Audit tests against a named matrix, filling every missing branch. Crypto: independent known-answer, exact key/nonce/KDF sizes and parameters, fresh nonces, malformed/unknown/oversized envelope, wrong passphrase/key, ciphertext/tag/AAD/header substitution, generic errors, buffer wiping, new-device same-passphrase decrypt, and account/version key separation/deletion. Egress: seed unique plaintext/passphrase/key/token/row markers, capture every auth/Drive/SecureStore/log/error/export boundary, and assert Drive bodies are exact allowed envelope metadata plus ciphertext with no marker or key; Drive port accepts no logical object. Transport: exact drive.file, Google origin, token/response bounds, redirect rejection, duplicate-file rejection, create/update/download/refresh/rediscovery/contention behavior.

Coordinator/repository: inject auth, token, list, create, duplicate, download, decrypt, parse, log collision, every Phase 11 conflict/preflight/write/rebuild stage, encrypt/randomness, conditional upload, acknowledgement, compaction, cancellation, disconnect, and process death. Before any valid merge commit compare canonical authoritative row bytes/digest plus schema/triggers; after a committed merge/upload failure prove the valid merge stays intact, pending work remains, and retry is idempotent. Run two-device equivalent-order/reversed-order/contention cases over every Phase 11 record class. Runtime: use never-settling/rejecting fakes for foreground, background, complete, undo, finish, and representative Phase 9/10/11 edit commits; assert each local operation acknowledges without awaiting sync and failed/cancelled source commands schedule nothing. Scan status/errors/log spies/snapshots/artifacts for secrets. Register every integrity-critical production file from Plans 01-03 in the per-file exact 100% gate and prove `npm run test:coverage` invokes it.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/sync src/platform/google src/platform/secureStore &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/syncRepository.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/google-drive-sync.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-01 has zero secret egress and compatible derivation proof; D-02/D-03 have strict same-account one-file adapter proof; D-04 has exhaustive local-safe retry/non-blocking/two-device convergence proof; every Phase 12 integrity module is exactly 100% covered.</acceptance_criteria>
  <done>The host/unit/integration matrix closes every security, transport, merge, failure, and critical-path branch.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Prove migration and retry semantics on real Expo SQLite</name>
  <files>src/testing/contracts/googleDriveSync.contract.ts, src/testing/contracts/googleDriveSync.contract.test.ts, src/testing/contracts/migrationsEffects.contract.ts, app/__native-contracts.tsx, scripts/run-native-sqlite-contracts.mjs, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/syncRepository.test.ts, package.json</files>
  <read_first>src/testing/contracts/migrationsEffects.contract.ts, app/__native-contracts.tsx, scripts/run-native-sqlite-contracts.mjs, tests/sqlite-host/migrations-effects.test.ts, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md</read_first>
  <action>Add a host/device-shared `google-drive-sync` contract and register it in the native harness. Starting from a populated execution-time schema-21 database, upgrade to the actual next migration (expected 22), verify exact tables/indexes/triggers/checks, stable opaque device identity, no secret columns, and backup-graph exclusion. Exercise source mutation plus outbox atomicity, rollback/fault injection, operation idempotency, acknowledgement/compaction interruption, process-close/reopen pending recovery, disconnect cleanup with source preservation, and migration verification/recovery behavior. Run the same named contract cases on host and real Expo SQLite. Do not make network calls in the device contract; use deterministic ports and inspect persisted state. Update suite argument/expected assertion counts fail-closed rather than silently skipping new cases.</action>
  <verify><automated>npm run test:unit -- --runInBand src/testing/contracts/googleDriveSync.contract.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/syncRepository.test.ts &amp;&amp; npm run typecheck</automated><native>npm run android:devtest:fresh -- --suite phase12 &amp;&amp; npm run test:sqlite:device -- --suite google-drive-sync --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>D-03 configuration/disconnect and D-04 outbox/rollback/retry guarantees pass the same contract on host and real Expo SQLite at the actual next schema version.</acceptance_criteria>
  <done>Persistence-changing DATA-10 behavior is proven on the shipped SQLite runtime, including rollback and process-death retry.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Lock dependency, accessibility, Maestro, and evidence gates into CI</name>
  <files>scripts/evaluate-npm-audit.mjs, scripts/evaluate-npm-audit.test.mjs, scripts/phase12-evidence-scripts.test.mjs, scripts/run-phase12-maestro.mjs, maestro/phase12/google-drive-sync.yaml, app/more/__tests__/data-and-recovery.test.tsx, package.json, .github/workflows/pr.yml</files>
  <read_first>.github/workflows/pr.yml, package.json, scripts/run-phase5-maestro.mjs, maestro/phase5/data-recovery.yaml, app/more/__tests__/data-and-recovery.test.tsx, /Users/bytedance/Documents/personal/helper-payroll-app/scripts/evaluate-npm-audit.mjs</read_first>
  <action>Re-run and harden the dependency evaluator against missing metadata, unexpected schemas, advisory aliases, severity drift, changed dependency path/package, expired/removed exceptions, and new high/critical findings. Ensure PR CI runs evaluator self-tests, live `audit:dependencies`, Expo install check/doctor, reproducible CNG, type/lint/boundaries, all host suites, exact coverage, and the Phase 12 native/allowlisted Maestro commands as appropriate to the repo's existing CI split. The required-suite contract must reject missing Phase 12 scripts. Verify the final lock contains exact approved versions and source scan rejects Firebase/Firestore and broader Drive scopes.

Complete component checks for exact accessible names/states, 48dp targets, focus, keyboard/D-pad, non-color status, System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion. Run the final fake-port Maestro lifecycle from one fresh manifest-bound APK. Add an evidence contract mapping each D-01..D-05, DATA-10 clause, and Roadmap Phase 12 criterion 1..5 to named passing unit/component/host/real-Expo/Maestro/audit assertions; fail on missing IDs, stale manifests, skipped cases, or secret markers in text artifacts. Explicitly label Maestro as UI/lifecycle evidence and host/device contracts as crypto/persistence/egress evidence.</action>
  <verify><automated>node --test scripts/evaluate-npm-audit.test.mjs scripts/phase12-evidence-scripts.test.mjs &amp;&amp; npm run audit:dependencies &amp;&amp; npx expo install --check &amp;&amp; npx expo-doctor &amp;&amp; npm run verify:cng &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; npm run test:all</automated><native>npm run test:sqlite:device -- --suite google-drive-sync --manifest artifacts/native/phase12/build.json &amp;&amp; npm run test:maestro:phase12 -- --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>D-05 runs and passes in CI for the final dependency tree; D-01..D-04 and all DATA-10/roadmap clauses map to non-skipped evidence; accessibility and lifecycle-visible behavior pass without using Maestro as crypto/persistence proof.</acceptance_criteria>
  <done>The final repository gates fail closed on dependency, security, coverage, native persistence, accessibility, lifecycle, or traceability regression.</done>
</task>
</tasks>

<verification>Run the exact commands from all tasks against one fresh Phase 12 development-test build. Inspect the evidence map for D-01..D-05, DATA-10, and roadmap criteria 1..5; require ciphertext-only fake-port captures, source-byte failure comparisons, real Expo migration/outbox results, and a passing advisory report.</verification>

<success_criteria>All five Roadmap Phase 12 criteria pass: optional reversible One-Tap connection; one same-account app-created file and all three triggers; XChaCha client-side encryption with device-only key custody; Phase 11 conflict-driven non-blocking fail-safe replication; and an enforced dependency-advisory gate with no Firestore transport.</success_criteria>
