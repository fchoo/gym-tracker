---
phase: 12-automatic-google-drive-sync
plan: 02
type: execute
wave: 2
depends_on: [12-01]
files_modified:
  - src/domains/sync/syncContracts.ts
  - src/domains/sync/syncChangeLog.ts
  - src/domains/sync/syncChangeLog.test.ts
  - src/domains/sync/syncCoordinator.ts
  - src/domains/sync/syncCoordinator.test.ts
  - src/domains/sync/syncScheduler.ts
  - src/domains/sync/syncScheduler.test.ts
  - src/platform/sqlite/repositories/syncRepository.ts
  - src/platform/sqlite/repositories/syncRepository.test.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - tests/sqlite-host/syncRepository.test.ts
  - tests/integration/google-drive-sync.test.ts
  - scripts/run-coverage-gate.mjs
autonomous: true
requirements: [DATA-10]
must_haves:
  truths:
    - "D-04: every reconcile is remote-read/decrypt/validate first, then the unchanged Phase 11 DATA-08 per-record-class merge, then fresh snapshot/log encryption and revision-conditional upload; no blind overwrite or duplicate merge engine exists."
    - "D-04: append/merge change-log operations are stable-ID deduplicated, order-independent, FK-closed, durably retryable across process death, and compact only after successful reconcile/upload acknowledgement."
    - "D-04: foreground, background/close, and every workout/edit post-commit seam enqueue into one debounced/coalesced single-flight scheduler; none of those callers awaits network/auth/crypto/merge/upload work."
    - "D-04: auth, network, download, decryption, validation, conflict, local merge/write, conditional-upload contention, and upload failure each produce bounded retryable state without corrupting or blocking local source facts."
    - "D-03: a disconnected/never-connected app schedules no network work, remains fully functional, and disconnect cancels pending/in-flight continuation, clears local credentials/config, preserves local SQLite and the remote ciphertext file, and leaves DATA-09 manual portability available."
  artifacts:
    - {path: src/domains/sync/syncChangeLog.ts, provides: versioned stable operation log merge/dedup/compaction contract}
    - {path: src/domains/sync/syncScheduler.ts, provides: deterministic debounced single-flight three-trigger scheduler}
    - {path: tests/integration/google-drive-sync.test.ts, provides: two-device convergence, contention, process-retry, and local-safety proofs}
  key_links:
    - {from: committed source mutations, to: sync outbox, via: same private-writer transaction or deterministic source-fingerprint enqueue before UI acknowledgement}
    - {from: remote and local logs, to: merge input, via: stable operation-ID set union plus Phase 11 FK-closed snapshot contract}
    - {from: AppState/post-commit events, to: coordinator, via: scheduler request returning synchronously and owning all async failure handling}
---

<objective>Expand the tracer into complete derivative replication: a durable append/merge change-log, conflict-driven two-device reconciliation through Phase 11, and one coalesced scheduler for foreground, background/close, and all workout/edit commits.</objective>

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
@.planning/phases/11-portable-history-merge-restore/11-02-conflict-engine-PLAN.md

At execution, inspect the actual Phase 11 public API and 12-01 implementation; extend them rather than forking conflict rules or crypto/transport. Plan-time anchors are `src/bootstrap/workoutAppRuntime.tsx:2081-2108,2333-2347,3019-3050,3431-3454`, `src/platform/sqlite/serializedWriter.ts:27-85`, `src/platform/sqlite/migrations/0013_history_integrity.ts:54-75`, and `src/domains/portability/backupContracts.ts:27-75`. The history audit table is not a complete sync log because it excludes settings/plans/custom exercises; use the dedicated v22 bookkeeping created in Plan 01.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Define and persist the complete versioned sync change-log</name>
  <files>src/domains/sync/syncContracts.ts, src/domains/sync/syncChangeLog.ts, src/domains/sync/syncChangeLog.test.ts, src/platform/sqlite/repositories/syncRepository.ts, src/platform/sqlite/repositories/syncRepository.test.ts, tests/sqlite-host/syncRepository.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md, .planning/phases/11-portable-history-merge-restore/11-02-conflict-engine-PLAN.md, src/platform/sqlite/serializedWriter.ts, src/platform/sqlite/migrations/0013_history_integrity.ts, src/domains/portability/backupContracts.ts, scripts/run-coverage-gate.mjs</read_first>
  <action>Define a bounded versioned encrypted-store plaintext containing the canonical Phase 11 logical snapshot plus an append/merge log. Each operation has opaque operation ID, opaque device ID, canonical authored instant, protocol version, base/snapshot identity, source fingerprint, and a reference to or embedded FK-closed aggregate delta accepted by Phase 11. Parse with exact fields/count/byte/date/identity bounds. Merge logs as a deterministic set union by operation ID; byte-different same-ID entries are a hard conflict, duplicates are idempotent, ordering is canonical, and no wall-clock alone determines identity. Compact only after remote download, successful Phase 11 reconcile, successful conditional upload, and durable acknowledgement; retain a bounded dedup watermark/set sufficient to reject replay. Never put config, account metadata, tokens, keys, outbox internals, or decrypted diagnostics into the canonical Phase 11 backup graph.

Extend `syncRepository` so every authoritative mutation category introduced through Phases 1-11 records a durable outbox operation in the same private-writer transaction as its source commit wherever the Phase 11 identity/change primitive supports that directly. Where Phase 11 provides a canonical post-commit source fingerprint rather than a same-transaction hook, durably enqueue that fingerprint before UI acknowledgement and prove no source mutation can be acknowledged without a corresponding pending reconcile marker. Enumerate workout set complete/undo/finish, history correction/void, plan/settings/custom-exercise edits, and Phase 9 composition/write-back mutations from the actual execution-time repositories; fail tests if a registered authoritative writer lacks replication bookkeeping. Cover process death, retry, duplicate operation, malformed log, collision, compaction interruption, rollback, and backup exclusion in host SQLite. Keep change-log/repository modules at exact 100%.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/sync/syncChangeLog.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/syncRepository.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-04 has a deterministic append/merge log and complete durable source-change capture without changing Phase 11 winner rules; retries/process death cannot lose or duplicate acknowledged source changes.</acceptance_criteria>
  <done>All authoritative edit classes produce safe durable replication work and the encrypted-store log can merge/dedup/compact deterministically.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Reconcile two devices without blind writes or local-path coupling</name>
  <files>src/domains/sync/syncCoordinator.ts, src/domains/sync/syncCoordinator.test.ts, src/platform/sqlite/repositories/syncRepository.ts, src/platform/sqlite/repositories/syncRepository.test.ts, tests/integration/google-drive-sync.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md, .planning/phases/11-portable-history-merge-restore/11-02-conflict-engine-PLAN.md, src/domains/portability/backupContracts.ts, src/platform/sqlite/serializedWriter.ts</read_first>
  <action>Expand the coordinator from one tracer entry to all Phase 11 record classes. Every run snapshots pending operation IDs, authenticates, downloads and validates the current encrypted file/revision (or creates only when absent), decrypts locally, merges remote/local logs, and passes the resulting logical snapshot into the unchanged Phase 11 read-only preflight and one-transaction commit. After verified local derivative parity, regenerate a canonical merged snapshot/log, encrypt with a fresh nonce, and conditional-upload against the downloaded revision. A 409/412/changed revision must re-download and recompute; never retry the old body blindly. Mark only the operations represented by the accepted uploaded revision as acknowledged.

Build deterministic two-device fake tests for disjoint changes, same-identity newest-wins session/correction/void, local-wins settings, identity-deduped keep-both plans/exercises, reversed arrival order, duplicate delivery, stale file-ID rediscovery, conditional contention, and eventual convergence to byte-equivalent canonical plaintext before encryption. Inject every auth/token, list, duplicate-file, download, decrypt, parse, conflict, Phase 11 preflight, local merge/write, derivative verification, encrypt, upload, acknowledgement, and compaction failure. For failures before a valid Phase 11 commit assert canonical local source bytes unchanged; after a valid merge but failed upload/ack assert source remains valid, pending work remains retryable, and retry converges without duplicate facts. Errors/status are bounded codes with no rows, tokens, keys, passphrases, ciphertext, or Drive bodies.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/sync/syncCoordinator.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/google-drive-sync.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-04 uses Phase 11 for every conflict class, never blind-overwrites, handles contention by re-reading, converges deterministically, and makes every failure safe and retryable with accurate pre/post-commit semantics.</acceptance_criteria>
  <done>Two same-account devices converge through one encrypted file without a second merge engine or unsafe overwrite.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire all three triggers through a non-blocking coalesced scheduler</name>
  <files>src/domains/sync/syncScheduler.ts, src/domains/sync/syncScheduler.test.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, tests/integration/google-drive-sync.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/bootstrap/workoutLifecycle.ts, src/bootstrap/workoutLifecycle.test.ts, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md</read_first>
  <action>Create a clock-injected scheduler with synchronous `request(reason): void`, one in-flight reconcile, a short documented debounce for post-commit bursts, trailing coalescing, bounded backoff, connectivity/auth pause, explicit manual bypass, and clean disposal. Persist pending intent so process death/background interruption retries later. Foreground requests immediate reconcile when connected; background/close requests a best-effort bounded handoff without blocking lifecycle acknowledgement; all actual workout/edit commits request only after durable success. Locate every execution-time authoritative command added through Phase 9/10/11 and wire the shared post-commit seam, not UI buttons. Failed/rejected/cancelled source commands must not schedule. Never call interactive sign-in from automatic triggers. Disconnect/dispose prevents late completions from updating current-account state.

Use fake clock/lifecycle/coordinator tests for burst coalescing, foreground/background overlap, one-in-flight, trailing rerun, retry/backoff, process restart, disconnect during flight, no connection, and manual request. Add runtime tests where sync never settles or rejects while complete/undo/finish and representative edit commands still return committed normal results within the existing local timing contract. Assert coordinator invocation occurs after commit and all network work is owned/caught by the scheduler.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/sync/syncScheduler.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run test:integration -- --runInBand tests/integration/google-drive-sync.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-04 reconciles on foreground, background/close, and every workout/edit commit through one non-awaited coalesced scheduler; D-03 never-connected/disconnected use stays entirely local and disconnect stops continuation without touching local or remote data.</acceptance_criteria>
  <done>All DATA-10 automatic triggers are durable, coalesced, lifecycle-safe, and absent from the critical path.</done>
</task>
</tasks>

<verification>Run full change-log/coordinator/scheduler unit, host SQLite, runtime, integration, and exact coverage gates. The two-device fake must demonstrate order-independent convergence and conditional-update retry; the deferred coordinator must demonstrate command/lifecycle completion without waiting.</verification>

<success_criteria>Roadmap criteria 2 and 4 are complete: the one app-created file reconciles on all three triggers, Phase 11 owns every conflict decision, no remote revision is overwritten unseen, and all failures preserve a usable authoritative local database with retryable durable work.</success_criteria>
