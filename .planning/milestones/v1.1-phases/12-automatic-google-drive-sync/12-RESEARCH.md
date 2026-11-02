# Phase 12 Research: Automatic Google Drive Backup

**Phase:** 12 - Automatic Google Drive Backup (v1.1)

**Requirement:** DATA-10

**Original research:** 2026-09-15

**Rewritten for approved architecture:** 2026-09-26

## Research conclusion

Implement DATA-10 as single-active-device snapshot backup and replacement-phone
restore. Do not implement a replication log or concurrent device convergence. The
safe core is a small ETag-protected manifest pointing to immutable, round-trip-
validated canonical JSON snapshots, with a semantic `writer_epoch` fence and local
generation accounting.

Automatic snapshots are deliberately **unencrypted**. SHA-256 detects corruption
but does not make data secret or prove who produced it. The Google account and
Drive authorization are the confidentiality boundary. Manual GTBK export remains
the encrypted option and must retain the Phase 11 Argon2id/AES-GCM behavior. No
Phase 12 passphrase, XChaCha cipher, derived-key cache, or SecureStore dependency is
needed.

## Verified execution baseline

| Fact | Evidence | Planning impact |
|---|---|---|
| The live migration registry ends at v22, `portable-owner-identities`. | `src/platform/sqlite/migrations/index.ts:1-45`; `src/platform/sqlite/migrations/0022_portable_owner_identities.ts:211-226` | The Phase 12 migration is **v23 planned**, not v19 or an unspecified future version. |
| Logical backup format v2 is implemented with a strict allowlist and limits of 24 MiB plaintext, 100,000 total rows, 25,000 rows/table, 64 KiB/string, and depth 16. | `src/domains/portability/backupContracts.ts:1-11,31-101,402-468` | Automatic snapshots should reuse this canonical logical payload and its parser rather than define another user-data schema. |
| The collector reads schema, every allowlisted table, references, and manifest counts in one serialized SQLite write transaction. | `src/platform/sqlite/repositories/logicalBackupRepository.ts:200-239` | Extend collection to capture `mutation_generation` coherently, but release the writer before JSON serialization, hashing, or Drive I/O. |
| Phase 11 merge rejects owner-namespace mismatch and binds commit to a canonical local fingerprint. | `src/domains/portability/mergeCommands.ts:415-453`; `src/platform/sqlite/repositories/logicalMergeRepository.ts:1018-1068` | Replacement restore needs an explicit, one-time namespace-adoption capability; background sync must not bypass the guard. |
| The full-plan merge writer and direct logical restore writer exist, but the public secure commands are file/password/confirmation oriented. | `src/domains/portability/mergeCommands.ts:98-130,398-475`; `src/platform/sqlite/repositories/logicalMergeRepository.ts:1150-1179`; `src/platform/sqlite/repositories/logicalRestoreRepository.ts:358-418` | Add narrow programmatic automatic-restore/merge ports that reuse validation, planning, atomic writers, and rebuild without exposing private writer APIs or altering GTBK. |
| The runtime already has foreground and post-commit reconciliation seams; lifecycle completion cannot guarantee network work after backgrounding. | `src/bootstrap/workoutLifecycle.ts:559-568`; `src/bootstrap/workoutAppRuntime.tsx:3036-3057,3572-3847` | Schedule asynchronously and treat background as one abortable opportunity; next launch/foreground is the recovery guarantee. |
| Production and development-test packages differ. | `app.config.ts:21-27`; `scripts/build-current-native-test-apk.sh:9` | Remote object namespaces and manifest validation must encode the environment; package naming alone is not enough. |
| Existing sibling code contains useful One-Tap and bounded Drive REST patterns. | `/Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts`; `.../google-drive/drive-client.ts` | Reuse authentication, scope, token refresh, response parsing, origin, and size guards only. Do not port Firestore, family sync, key distribution, or encrypted envelopes. |

## Target protocol

```text
authoritative local mutation
  -> same SQLite transaction increments mutation_generation
  -> idle scheduler coalesces pending generations
  -> one short transaction captures canonical snapshot + generation G
  -> canonical JSON + SHA-256 outside writer
  -> upload new immutable snapshot
  -> bounded download and full validation of uploaded bytes
  -> If-Match manifest promotion under matching writer_epoch
  -> reread and verify manifest
  -> local receipt conditionally advances backed_up_generation to G
  -> later G+1 mutation remains pending for a trailing backup
```

The manifest is the only mutable Drive object. Snapshot objects are immutable. A
manifest promotion retains two valid recovery points: `latest` and `previous`. A
candidate is not a backup merely because Drive accepted the upload; it becomes
authoritative only after download validation and conditional manifest promotion.

### Manifest and snapshot contract

Use exact-key parsing and a versioned tagged union. The manifest must fit within 16
KiB. Its `active` variant contains only the metadata needed to validate ownership and
locate recovery objects: protocol version, environment/package discriminator, owner namespace,
writer epoch, promoted generation, and `latest`/optional `previous` descriptors. Its
`deleted` variant contains only its protocol tag, environment, successor writer epoch,
and deletion time, with no owner/account identifier, snapshot reference, Drive object
ID, or workout content. A
descriptor includes immutable object identity, snapshot/schema version, byte length,
`object_sha256`, generation, and creation time. The Drive ETag is transport metadata returned
with a manifest read, not a trusted field copied into its JSON body.

The snapshot is exact canonical JSON with `header`, `payload`, and
`payload_sha256`. The header binds protocol, environment, package, owner namespace,
writer epoch, generation, schema, snapshot ID, and creation time; payload is the Phase
11 logical snapshot. Compute `payload_sha256` over the canonical UTF-8 bytes of the
exact `{header,payload}` object, excluding the digest field itself. The manifest
descriptor independently stores `object_sha256` over the complete uploaded snapshot
bytes. This avoids a self-referential digest and lets a manifest-recovery scan verify
candidate payload integrity before reconstructing descriptors. The snapshot is limited
to 24 MiB and 100,000 rows, with the stricter existing per-table/string/depth limits
still applied. Reject unknown fields, invalid UTF-8,
noncanonical JSON, wrong byte length/payload/object hash, unsupported schema/protocol, graph errors,
and environment/namespace/generation mismatches before restore or promotion.

### Drive transport

- Request only `https://www.googleapis.com/auth/drive.file` after optional One-Tap
  sign-in. Verify the scoped token belongs to the intended Google identity before
  discovery. OAuth setup must register stable production and development-test
  package/signing identities.
- Use Drive REST v3 with Google-origin-only requests, redirect rejection, bounded
  tokens/list/response bodies, strict metadata parsing, `trashed=false`, and exact
  environment app properties. File IDs are caches, never authority.
- Snapshot size <= 5 MiB uses one bounded multipart upload. Snapshot size > 5 MiB uses a
  resumable upload session with bounded chunks, validated offsets/ranges, and safe
  restart after interruption. The 24 MiB snapshot limit always applies.
- Every manifest mutation sends `If-Match` with the ETag from its exact read. HTTP
  409/412 causes a bounded reread. If the remote writer epoch changed, transition to
  terminal `stale_writer`; do not retry the upload under the new epoch.

## Restore-first quarantine and claim state machine

All connects enter quarantine before any mutation of Drive state:

1. Authenticate, verify identity/scope, and discover only this environment's app
   artifacts.
2. If no app backup artifacts exist, remain locally backup-pending, create and
   round-trip validate the first immutable snapshot, then create the first manifest
   and writer epoch. A missing manifest is not proof of an
   empty account when snapshot artifacts exist.
3. If a manifest is valid, validate `latest`; if needed, validate `previous`. If the
   manifest is missing/corrupt, use the bounded recovery scan described below.
4. If the local user-owned graph is empty, direct-restore the selected verified
   snapshot in one Phase 11 transaction and rebuild derivatives. Define empty as
   zero owner-created portable facts across the Phase 11 canonical graph, excluding
   the mandatory owner-identity singleton, bundled catalog rows, replayable
   derivatives, and Phase 12 bookkeeping.
5. If local user data is non-empty, create the Phase 11 merge preview and require
   explicit confirmation. When namespaces differ, fresh Google authentication and a
   separate explicit confirmation may authorize one-time adoption of the cloud owner
   namespace inside the same state-bound merge transaction. No silent, repeat, or
   background adoption is allowed.
6. After restore/merge and rebuild succeed locally, issue a conditional manifest
   claim that creates a successor `writer_epoch`. Only after rereading and validating
   that claim may the installation leave quarantine and make a fresh backup.

Restore failure rolls back source facts, namespace changes, and local generation
state together. Claim failure leaves the valid restored/merged local facts in place
but does not confer cloud write authority. The first later authoritative mutation
increments from the restored generation.

## Local persistence: planned migration v23

The additive v23 schema should keep one strict singleton containing non-secret
connection and backup state: validated Drive permissionId/display metadata, environment,
cached manifest file ID/ETag, writer epoch/state, `mutation_generation`,
`backed_up_generation`, last attempt/success timestamps, stale-since timestamp,
network preference, safe finite status/error code, and bounded claim/lease data.
Tokens, snapshot bodies, raw provider responses, and workout rows do not belong there.

SQLite triggers on every authoritative user-owned table must increment
`mutation_generation` in the source mutation's transaction. This is coverage for
*whether* a new full snapshot is needed, not a change-log of operations. Trigger
registration should be derived from or checked against the explicit Phase 11 backup
ownership allowlist so a new authoritative table cannot silently escape backup.
Transport metadata and generation rows stay outside the logical backup graph.

An acknowledgement must be a conditional local transaction: update
`backed_up_generation` only when the current account/environment, writer epoch,
manifest identity, snapshot identity, and captured generation still match the
accepted receipt. A later `mutation_generation` remains dirty. Expired in-flight
claims are recovered on launch/foreground.

## Scheduling and performance

- Admit automatic snapshot collection only while idle and with no interactive
  workout active. Manual **Back up now** may request priority but still cannot block
  a workout mutation.
- Coalesce many mutation generations into one run and allow one run at a time. A
  mutation after capture schedules a trailing run rather than altering or falsely
  acknowledging the in-flight snapshot.
- Trigger on launch, foreground, post-commit request, manual retry/back up, and one
  bounded `active -> inactive/background` opportunity. No polling or new background
  execution framework is needed.
- Network/auth/Drive work is never awaited by mutation or lifecycle acknowledgement.
  Use finite debounce, attempt, backoff, jitter, byte, and time budgets.
- Allow any available connection, including cellular, by default. With Wi-Fi-only
  enabled, leave dirty state pending until an allowed connection or manual policy
  change.
- Persist when dirty time begins. At 24 hours without a matching verified promotion,
  expose a non-blocking stale warning and Retry; do not reset the timer on a failed
  attempt.
- Add measured gates for SQLite writer occupancy, command latency during capture,
  JSON serialization, peak memory at the size cap, and resumable transfer behavior.

## Recovery, cleanup, and destructive actions

### Manifest recovery scan

When a manifest is absent or invalid, list a bounded number of immutable snapshots
from the exact environment namespace. Validate each candidate completely, group by
owner namespace/writer lineage, and select the newest internally consistent latest
and previous pair by generation only after validation. Reconstruct the manifest with
a conditional create/update. Ambiguous lineages remain quarantined for owner action;
never choose by Drive modified time alone. A future-schema snapshot produces an
update-required state and must not be replaced by an older candidate.

### Retention and cleanup

Never overwrite snapshots and never delete either manifest-referenced object. After
successful promotion and reread, a best-effort cleanup may inspect only unreferenced
objects in the same environment namespace that are at least 24 hours old. Before each
trash call, re-read the manifest and require both its ETag and writer epoch to match
the cleanup claim. Move eligible objects to Drive trash; do not permanently delete.
Cleanup failure does not fail the backup. Disconnect performs no cleanup.

Deleting cloud backup data is a separate destructive workflow requiring fresh Google
authentication, exact environment/account checks, and explicit confirmation. First
conditionally promote a metadata-only `deleted` tombstone under a successor writer
epoch; then permanently delete all accepted snapshot objects, retrying partial cleanup
without ever reconstructing those snapshots. On every tombstone discovery, repeat a
bounded sweep until no matching snapshot objects remain so a stale upload that completed
after the first sweep is also removed. Retain the tombstone so a retired phone cannot
see an empty namespace and recreate deleted workout data. A later intentional
new backup requires fresh authentication and an explicit tombstone-to-active claim. It
is not part of automatic retention.

## Environment isolation

Derive a fixed remote namespace from the build profile/package and encode it in app
properties plus manifest/snapshot metadata. Production and development-test must have
separate OAuth Android registrations and disjoint object discovery predicates. Reject
cross-environment objects before download; recovery and cleanup must use the same
predicate. Live tests should use a dedicated test account and prove production objects
are absent without recording account details or Drive IDs.

## Required ports and reuse boundary

- `GoogleAuthPort`: connect, verified identity, scoped token, refresh, disconnect.
- `DriveBackupStorePort`: bounded environment-scoped discovery; manifest read with
  ETag; conditional manifest create/update; immutable snapshot upload/download;
  resumable session operations; fenced trash. It deals in bytes and safe metadata,
  not logical rows.
- `AutomaticPortableRestorePort`: validate and atomically direct-restore a canonical
  snapshot, then drive deterministic rebuild.
- `AutomaticPortableMergePort`: collect local facts, build preview, enforce optional
  one-time namespace adoption, fingerprint and atomically commit the complete Phase 11
  plan, then drive deterministic rebuild.
- `BackupRepository`/scheduler ports: generation, epoch, claim, connection, stale-state,
  clock, lifecycle, connectivity, and cancellation abstractions for deterministic tests.

The automatic ports must reuse Phase 11's parser, candidate validation, merge planner,
private full-plan capability, logical restore writer, and reconciliation logic. They
must not call the manual password/file UI commands, expose the private writer, or alter
manual GTBK serialization.

## Verification strategy

### Deterministic CI

1. **Contracts and parser:** exact manifest/snapshot fields, 16 KiB/24 MiB/100,000-
   row limits, 5 MiB upload boundary, canonical serialization, SHA-256 mismatch,
   unsupported/newer schema, environment and namespace rejection.
2. **Drive/auth adapters:** cancellation, identity/scope mismatch, refresh, bounded
   list/download, redirect/origin rejection, multipart/resumable upload, ETag conflict,
   missing/stale file cache, and trash fencing.
3. **SQLite v23:** populated-v22 upgrade on host and real Expo SQLite; exact strict
   tables/indexes/triggers; mutation and generation atomicity; trigger coverage for
   every authoritative table; rollback and reopen recovery; backup-graph exclusion.
4. **Backup coordinator:** mutations `G..G+n` coalesce; coherent capture at `G`;
   round-trip validation precedes promotion; exact receipt acknowledgement; later
   mutation remains dirty; stale writer and stale ETag cannot promote or acknowledge.
5. **Restore/handover:** quarantine forbids cloud mutation; empty direct restore;
   non-empty merge preview/commit; one-time authenticated namespace adoption; local
   restore then conditional epoch claim then backup; claim failure preserves local data.
6. **Crash-cut matrix:** cut after candidate upload, download validation, manifest
   promotion, manifest reread, local acknowledgement, quarantine creation, restore/
   merge commit, epoch claim, and cleanup eligibility. Reopen and prove old or new
   complete state, never a mixed state.
7. **Recovery/retention:** missing/corrupt manifest scan; corrupt latest and valid
   previous; future schema; orphan grace period; latest/previous deletion immunity;
   stale-epoch and stale-ETag cleanup rejection.
8. **Runtime/UI:** no awaited backup on complete/edit/undo/finish/lifecycle paths; idle-
   only capture; foreground recovery; best-effort background cancellation; any-network
   default, Wi-Fi-only behavior, 24-hour warning, quarantine/fenced/retry/disconnect/
   delete states, accessibility, and manual GTBK controls always present.
9. **Security/privacy:** scans prove no Firestore, automatic encryption/passphrase/
   SecureStore key path, broad Drive scope, token/account/Drive-ID leakage, or production
   namespace access from development-test evidence.

Integrity-critical backup contracts, coordinator, scheduler, ports, v23 migration,
repository, and automatic portability adapters should join the repository's exact 100%
statement/branch/function/line gate. Fake-port Maestro covers visible state transitions;
it is not persistence or Drive proof.

### Attended native evidence

- **Signed development-test emulator:** with a dedicated test Google account, perform
  first backup, second backup with latest/previous retention, destructive local reset,
  restore-first quarantine, direct restore and non-empty merge/adoption cases, writer
  transfer/stale-writer rejection, manifest recovery, and fenced trash cleanup.
- **Physical phone:** prove One-Tap identity, registered signing/package configuration,
  `drive.file` consent, token refresh, and environment isolation only. Do not upload,
  download, or destructively restore Gym Tracker backup data on the personal phone.
- Evidence contains only build identity, case IDs, pass/fail, redacted object counts,
  sizes, timestamps, and hashes. Never retain OAuth tokens, emails, Google subjects,
  Drive file IDs, or workout content.

## Failure rules

1. Never use Drive upload success as proof of a backup; require bounded download, full
   validation, conditional promotion, manifest reread, and matching local receipt.
2. Never upload, promote, clean, or delete during restore quarantine.
3. Never retry under a different writer epoch or silently reclaim authority.
4. Never treat corrupt/missing manifest, invalid artifacts, or future schema as empty
   Drive.
5. Never hold the SQLite writer during serialization, hashing, or network I/O, and
   never start automatic capture while an interactive workout is active.
6. Never let cleanup touch current latest/previous, another environment, or an object
   younger than 24 hours.
7. Never claim automatic snapshots are encrypted. Keep manual encrypted GTBK distinct.
8. Never add Firestore, live multi-device sync, operation change-log convergence, or a
   Phase 12 passphrase/SecureStore key path.

## Confidence and remaining planner choices

| Topic | Confidence |
|---|---|
| Live v22 baseline, Phase 11 snapshot/merge/restore anchors, v23 next migration | High |
| Single-writer epoch + ETag manifest protocol, validated promotion, generation acknowledgement | High; approved design |
| Quarantine, restore routing, namespace adoption, retention, recovery, environment isolation | High; approved design |
| Exact Google REST request syntax and resumable-session details | Verify against current official Drive API documentation during implementation |
| Exact debounce/backoff/chunk size/performance thresholds and recovery-scan count | Planner discretion within the locked bounded behavior |

## RESEARCH COMPLETE
