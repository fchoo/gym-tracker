# Phase 12 Research: Automatic Google-Drive Sync

**Phase:** 12 — Automatic Google-Drive Sync (v1.1)  
**Requirement:** DATA-10  
**Research date:** 2026-09-15

## Research scope and execution-time baseline

Phase 12 is optional, single-owner Google Drive replication. It must use one app-created file, drive.file, client-side encryption, local SQLite authority, and the Phase 11 merge engine; foreground, background/close, and post-workout/edit commit reconciliation are required. [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md:7-20] [VERIFIED: .planning/REQUIREMENTS.md:45-49]

This worktree is pre-Phase-9/10/11. The highest migration actually on disk is v18; Phase 9/10 v19/v20 and the Phase 11 v21 identity/merge migration/module are execution-time dependencies, not existing code. Phase 11 requires a transport-agnostic API operating on a decrypted snapshot plus local DB. [VERIFIED: src/platform/sqlite/migrations/index.ts:1-37] [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-RESEARCH.md:7-11] [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:105-109]

## Standard stack and reusable patterns

| Concern | Required/reusable choice | Evidence |
|---|---|---|
| Google sign-in | react-native-nitro-google-signin@^1.3.0, One-Tap, then request drive.file scope | [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/package.json:42-45] [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts:1-15] |
| Drive transport | REST v3 through https://www.googleapis.com; /drive/v3/files, /upload/drive/v3/files, /drive/v3/about | [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts:1-17] |
| Payload encryption | @noble/ciphers@2.2.0, XChaCha20-Poly1305, fresh 24-byte nonce and 32-byte key | [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/package.json:7-11] [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/family-sync/encrypted-envelope.ts:1-9] |
| Key derivation | Existing native Argon2id family: descriptor v1, 32-byte output, 16-byte salt, 19,456 KiB / 2 iterations / parallelism 1 | [VERIFIED: src/platform/crypto/passwordKdf.ts:14-44] |
| Key cache | expo-secure-store@~57.0.1 / Android Keystore; new dependency for Gym Tracker; cache derived key only | [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/package.json:29-32] [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md:26-34] |
| Curves | @noble/curves@2.2.0 is in helper-payroll-app for family key wrapping, not required by this single-owner passphrase-derived scheme | [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/docs/architecture/0001-encrypted-family-sync.md:14-27] [ASSUMED: no Phase-12 use] |

Helper Payroll chose Firestore only because different family accounts could not discover one another's app-created Drive files: “each account's app token discovered only files created under its own grant.” Gym Tracker uses the same account on every device, so do not plan Firestore, Firebase, sharing, or appDataFolder. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/docs/architecture/0001-encrypted-family-sync.md:6-11] [VERIFIED: .planning/REQUIREMENTS.md:49-49]

## Decisions D-01 through D-05

### D-01 — passphrase-derived key

Create a versioned sync key descriptor using the exact current Argon2id parameters. Generate a random 16-byte salt on first initialization and store the non-secret descriptor/salt inside the encrypted-store envelope header. A new device signs into Google and enters the same passphrase to derive the identical 32-byte key. Cache only derived bytes in SecureStore, scoped by Google identity and protocol/key version; Disconnect clears the cache. Do not cache the passphrase. The KDF implementation already copies and wipes password, salt, and native output buffers. [VERIFIED: src/platform/crypto/passwordKdf.ts:147-190] [VERIFIED: src/domains/portability/restoreCommands.ts:287-303] [ASSUMED: sync header and SecureStore key names]

GTBK uses Argon2id with AES-256-GCM; sync must use the locked XChaCha20-Poly1305 cipher. Reuse GTBK's non-oracular handling: wrong passphrase, tampering, ciphertext, nonce, and tag errors must map to safe generic decryption failure. [VERIFIED: src/domains/portability/backupFormat.ts:84-100] [VERIFIED: src/domains/portability/restoreCommands.ts:332-344] [VERIFIED: .planning/REQUIREMENTS.md:47-47]

Reusable Noble pattern: validate 32-byte key/24-byte nonce, serialize bounded JSON, authenticate canonical metadata as AAD, encrypt before returning an envelope, validate exact fields before decrypt, and base64-encode nonce/ciphertext. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/family-sync/encrypted-envelope.ts:56-120] [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/family-sync/encrypted-envelope.ts:123-163]

### D-02/D-03 — One-Tap and one Drive file

Port helper One-Tap: configure web client ID; check Play Services; try signIn, createAccount, then presentExplicitSignIn; cancellation returns no identity. getTokens returns an existing scoped token or requestScopes grants Drive; refresh clears a stale token then gets a fresh one; Disconnect calls native signOut. Retain error-code mapping while changing family-vault copy. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts:37-115] [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts:118-163]

Adapt Drive client from named recovery folder/archive to one deterministic app-created root file. Query files with strict appProperty/mime/name plus trashed=false and pageSize=2; reject duplicate files; multipart POST only if no match; GET file media to download; PATCH upload media to update. Persist file ID only as a cache and rediscover on absence/staleness for another same-account device. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts:215-263] [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts:266-412] [ASSUMED: Gym Tracker root predicate, mime/name/appProperty]

Retain Drive defenses: exact parseDriveFile/parseDriveFileList, list bound 500, bounded response/archive size, DriveApiError status, Google-origin-only fetch, max 8192 token, redirect error, and bearer token contained by the adapter. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts:73-137] [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts:572-615]

### D-04 — derivative replication over Phase 11

Phase 11 locks authenticate/decrypt → parse → duplicate identity detection → per-record-class rules → preview → one all-or-nothing commit. Rules: newest timestamp wins for sessions/set corrections/void; local existing wins settings; distinct custom exercises/plans keep both by stable identity. Sync feeds its decrypted remote snapshot/change-log into that transport-agnostic merge primitive; it never remote-restores or direct-writes live workout tables. [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:24-49] [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:105-109]

Recommended container: encrypted/versioned canonical Phase-11 logical snapshot plus an append/merge change-log. Each delta has opaque operation ID, device ID, authored timestamp, version, base/snapshot identity, and FK-closed aggregate delta/reference. Authenticate header metadata as AAD; compact only after successful reconciliation into a fresh canonical snapshot plus deduplicated operation IDs. Before upload always download/decrypt/validate/merge remote state; use Drive revision/ETag conditional update when adapter exposes it, and re-download/retry contention. [ASSUMED: exact log schema, compaction, ETag implementation]

history_audit_events is an immutable append-only model (id, session, revision, event type, before/after JSON, timestamp), but it is history-specific and cannot represent plans/settings/custom exercises. Prefer a separate sync outbox/change-log or Phase-11 snapshot derivation. [VERIFIED: src/platform/sqlite/migrations/0013_history_integrity.ts:54-75] [VERIFIED: src/domains/portability/backupContracts.ts:27-75] [ASSUMED: separate table preferred]

### D-05 — dependency audit

New native dependencies must use config/plugin/prebuild verification. Existing CI runs npm ci, expo install --check, expo-doctor, and reproducible CNG; app config has a deliberate plugin list. [VERIFIED: .github/workflows/pr.yml:53-70] [VERIFIED: .github/workflows/pr.yml:181-186] [VERIFIED: app.config.ts:41-65]

**Finding:** no npm audit, dependency-audit script, or CI audit command exists in the current checked-in worktree, despite D-05 saying one exists. Plan an explicit audit script/package command and CI invocation before enablement, with documented severity and exception policy. Expo doctor is not an advisory audit. [VERIFIED: package.json:35-96] [VERIFIED: .github/workflows/pr.yml:53-70] [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md:57-58]

## Architecture and runtime integration

1. **Connect:** explicit Data & recovery control invokes auth port, requests drive.file, prompts for sync passphrase, derives/caches key, discovers/creates store, queues first reconciliation. Offline remains fully usable if never connected/cancelled. [VERIFIED: .planning/design/v1.1-UX-FLOW.md:129-142]
2. **Download/preflight:** coordinator gets token, downloads bounded ciphertext, authenticates/decrypts locally, validates container and Phase-11 snapshot/log, then gets a read-only Phase-11 merge plan. [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:43-49] [ASSUMED: coordinator composition]
3. **Atomic reconcile:** Phase 11 applies complete plan via FIFO BEGIN IMMEDIATE / commit / rollback writer, then derivative rebuild. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-85] [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-RESEARCH.md:131-137]
4. **Encrypt/upload:** locally create merged snapshot + deduped log, encrypt with fresh nonce/AAD, then invoke Drive port. Failure only publishes retryable/paused status. [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md:49-65] [ASSUMED: status storage]
5. **Disconnect:** stop queued work, delete local auth/key/file-ID/status credentials, sign out, retain remote ciphertext and local SQLite. Manual Phase-11 import/export remains. [VERIFIED: .planning/design/v1.1-UX-FLOW.md:124-142] [ASSUMED: remote preservation]

### Non-blocking trigger seam

Runtime already subscribes to foreground lifecycle and disposes subscription on close. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2081-2108] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2333-2347] Its reconcileAfterCommit invokes an async IIFE using void, catches errors, and completeWorkoutSet uses it through drainEffects. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3019-3050] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3431-3454]

Add a runtime-owned SyncScheduler that coalesces foreground, background/close, and post_commit requests behind one in-flight job/debounce. Call scheduler.request only after durable command result; never await it in workout/edit/complete/undo/finish/lifecycle acknowledgement. Scheduler catches failures and updates safe state. [ASSUMED: scheduler API]

## Schema and backup graph

Recommend durable sync configuration/status plus append-only sync outbox/change-log so process death does not lose a requested reconcile and a source command can atomically record replication needed. Under v19/v20/v21 dependency order it is v22. Additive tables/indexes should suffice; a reconstructive alternative must be destructive so migration runner makes validated recovery backup. [VERIFIED: src/platform/sqlite/migrationRunner.ts:220-273] [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-RESEARCH.md:99-105] [ASSUMED: v22/additive design]

Replication bookkeeping is transport-local, not canonical user-owned backup facts, and should normally be excluded from Phase-11 logical backup graph. Do not export queued ciphertext, tokens, or keys. Existing backup registry is explicit allowlist, not all-table copy. [VERIFIED: src/domains/portability/backupContracts.ts:22-79] [ASSUMED: config/backups policy]

## Settings UI

Current Settings has Data and recovery card/route. Phase 11 extends destination; Phase 12 places Cross-device sync above manual backup/restore: Not connected + Connect Google Drive; Synced + last synced/account + Sync now/Disconnect; Paused offline/auth expired + Retry. Status line is only workout-path surface; no spinner/modal blocks logging. [VERIFIED: src/ui/screens/SettingsScreen.tsx:328-345] [VERIFIED: .planning/design/v1.1-UX-FLOW.md:129-143]

## Ports, test, coverage, and Maestro surface

Create injectable ports:

- GoogleAuthPort: identity, interactive connect, access token, refresh, disconnect. Native adapter wraps One-Tap. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts:32-93]
- DriveStorePort: discover/create-one, bounded ciphertext download, conditional ciphertext upload. It accepts bytes only, never snapshot/passphrase/key. [ASSUMED: signature]
- SecureSyncKeyPort: read/write/delete derived key bytes only, backed by SecureStore; fake proves passphrase is never persisted. [ASSUMED: signature]
- SyncSchedulerPort/clock/lifecycle: deterministic trigger coalescing. This follows narrow existing ports like RestNotificationPort, HapticsPort and RestCountdownCuePort. [VERIFIED: src/domains/rest/restNotificationPort.ts:37-50] [VERIFIED: src/domains/workout/hapticsPort.ts:1-3] [VERIFIED: src/domains/rest/restCountdownCuePort.ts:1-4]

Required tests:

1. Unit: sign-in cancellation/scope/refresh/error map; Drive duplicate/limits/origin errors; XChaCha known-answer, fresh nonce, wrong key/tamper/AAD substitution; ciphertext-only egress; no secret in status/errors/logs.
2. Coordinator integration with fakes: trigger coalescing, remote-first merge, every auth/network/download/decrypt/parse/conflict/merge/write/upload failure leaves local source byte-equivalent and retryable; retry succeeds; no blind overwrite.
3. Non-blocking: fake sync hangs/rejects while workout/edit commands still return committed normal results; scheduler begins only after source commit. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3019-3050]
4. Host/native SQLite: v22 migration upgrade/verify/rollback/integrity; outbox atomically follows source command; injected merge/write failure preserves facts. [VERIFIED: src/platform/sqlite/migrationRunner.ts:242-268]
5. Coverage: add all sync domain/coordinator/crypto/port/migration/repository modules to the explicit 100% integrity gate. [VERIFIED: scripts/run-coverage-gate.mjs:16-101]
6. Maestro: Phase-12 runner/flow modeled on Phase 5 that visits Settings/Data recovery and exercises fake-adapter Not connected, Synced, Paused, Retry and Disconnect states plus lifecycle-visible refresh. OAuth/network remains faked; host/unit/native tests prove egress and rollback. [VERIFIED: maestro/phase5/data-recovery.yaml:7-26] [VERIFIED: scripts/run-phase5-maestro.mjs:21-49]

## Reusable assets

| Path and lines | Reuse |
|---|---|
| /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts:14-115 | One-Tap/scope/token/refresh/signout/error template. Quote: “export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';” [VERIFIED] |
| /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts:1-17,73-137,266-412,572-615 | Drive paths, multipart, parsing/limits/error/origin guards. Quote: “const DRIVE_UPLOAD_PATH = '/upload/drive/v3/files';” [VERIFIED] |
| /Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/family-sync/encrypted-envelope.ts:56-120,152-208 | XChaCha/AAD/envelope model. Quote: “const NONCE_BYTES = 24;” [VERIFIED] |
| /Users/bytedance/Documents/personal/helper-payroll-app/docs/architecture/0001-encrypted-family-sync.md:8-27 | Negative Firestore reuse constraint. Quote: “Firestore is therefore the encrypted transport.” [VERIFIED] |
| src/platform/crypto/passwordKdf.ts:14-44,77-102,147-200 | D-01 Argon2 descriptor/wipe. |
| src/domains/portability/restoreCommands.ts:287-345 | KDF and generic decrypt failure handling. |
| .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:24-49,105-109 | Contract-only merge seam, not code yet. |
| src/bootstrap/workoutAppRuntime.tsx:2333-2347,3019-3050,3431-3454 | Lifecycle and post-commit non-blocking seam. |

## Pitfalls

1. Never await network/auth/crypto/merge in workout critical path. [VERIFIED: .planning/REQUIREMENTS.md:64-72]
2. Never egress plaintext, passphrase, derived key, decrypted snapshot, tokens, or secret-containing diagnostics. Assert fake Drive bodies/arguments are ciphertext only. [VERIFIED: .planning/REQUIREMENTS.md:70-72]
3. Never blind-overwrite: remote-read/decrypt/merge/re-encrypt/conditional update, retry contention. [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md:49-56] [ASSUMED: conditional header]
4. Never make Drive authoritative; all failure classes preserve local data and retry. [VERIFIED: .planning/REQUIREMENTS.md:47-47]
5. Do not adopt helper Firestore/Firebase/X25519/family/recovery-folder behavior. [VERIFIED: /Users/bytedance/Documents/personal/helper-payroll-app/docs/architecture/0001-encrypted-family-sync.md:8-27]
6. SecureStore is absent today and must be added/configured/tested. [VERIFIED: package.json:1-96] [VERIFIED: app.config.ts:41-65]
7. Implement missing dependency-audit gate before D-05 is called complete. [VERIFIED: .github/workflows/pr.yml:53-70]

## Confidence

| Topic | Confidence |
|---|---|
| D-01..D-04, helper auth/Drive reuse, same-account/no-Firestore rationale | High |
| Argon2 params, lifecycle seam, settings location, test/coverage patterns | High |
| Missing dependency audit in current source/CI | High |
| v22 outbox/config and encrypted snapshot+log model | Medium; planner choice after Phase 11 lands |
| Exact Phase-11 API/module, v19/v20/v21 graph, Drive ETag approach | Low until dependency work executes |

## RESEARCH COMPLETE
