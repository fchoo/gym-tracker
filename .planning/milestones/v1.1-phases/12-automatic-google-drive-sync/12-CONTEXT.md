# Phase 12: Automatic Google Drive Backup - Context

**Originally gathered:** 2026-09-15

**Revised:** 2026-09-26

**Status:** Approved design; ready for planning

<domain>
## Phase Boundary

Phase 12 gives the owner an optional, WhatsApp-like Google Drive backup for
replacing a phone. It is **backup and restore**, not live synchronization. Local
SQLite remains authoritative and exactly one installation is allowed to publish
at a time. A replacement phone must restore first, take over writer authority,
and only then create a new backup.

Automatic cloud snapshots are versioned, canonical, **unencrypted JSON** in
app-created Drive files accessed with `drive.file`. Their confidentiality rests
on the owner's Google account and Drive controls. SHA-256 detects corruption; it
does not provide encryption, authentication, or protection from someone who can
read the Drive files. Phase 11's manual GTBK export remains password-encrypted
and available whether Drive backup is connected or not.

The app remains fully usable offline and never requires Google sign-in to log a
workout. Backup collection and network work must not run on or delay the active
workout path.

**Explicitly out of scope:** Firestore or another hosted backend; simultaneous
multi-device reconciliation; live sync; passphrases, XChaCha, SecureStore key
custody, or any other client-side encryption for automatic snapshots; a sync
change-log/outbox; family or multi-account sharing; guaranteed execution after
the mobile OS suspends or kills the app.
</domain>

<decisions>
## Locked Implementation Decisions

### D-01 - Single-active-device backup

- One Drive manifest identifies one active `writer_epoch`. Only a device holding
  that epoch may publish or clean up objects.
- Every manifest change uses the ETag returned by the last manifest read and an
  HTTP `If-Match` precondition. An ETag conflict forces a fresh read; a changed
  epoch fences the old device permanently until an explicit handover.
- This protocol prevents stale writes. It does not attempt two-device
  convergence. A fenced phone keeps working locally and reports that backup is
  active on another phone.

### D-02 - Immutable snapshots and validated promotion

- Each backup creates a new immutable canonical JSON snapshot. Snapshot objects
  are never updated in place. `payload_sha256` hashes the canonical UTF-8 bytes
  of the exact `{header,payload}` object, excluding the digest field itself. The
  manifest descriptor separately stores `object_sha256` over the complete uploaded
  snapshot bytes.
- The mutable, versioned manifest is an exact tagged union. An `active` manifest
  references the verified `latest` and, once a predecessor exists, the verified
  `previous` snapshot. Its active metadata carries the environment namespace, owner
  namespace, writer epoch, generation, schema/protocol version, object identity, byte
  length, `object_sha256`, and creation time needed to validate those references. A
  metadata-only `deleted` tombstone carries only its protocol tag, environment,
  successor writer epoch, and deletion time: no owner/account identifier, snapshot
  reference, Drive object ID, or workout content.
- Promotion order is fixed: collect and validate locally -> upload the immutable
  candidate -> download it through the bounded read path -> verify byte length,
  `object_sha256`, inner `payload_sha256`, JSON/schema/graph, namespace, and generation -> update the manifest
  with `If-Match` -> reread/verify the promoted manifest -> acknowledge locally.
  A failure before the conditional manifest update leaves the old latest and
  previous pair authoritative.

### D-03 - Restore-first quarantine and handover

- Connecting to Drive enters **restore quarantine**. Discovery and validation are
  allowed; upload, promotion, cleanup, and deletion are forbidden. Existing but
  invalid artifacts are recovery evidence and must not be treated as an empty
  account.
- When there are no app backup artifacts, the installation may begin its first
  backup. It remains locally pending; the first manifest and writer epoch become
  authoritative only after the immutable snapshot passes round-trip validation.
- With a valid cloud snapshot, an empty local user-owned graph uses Phase 11's
  direct, atomic restore. `Empty` means zero owner-created portable facts across
  the Phase 11 canonical graph; ignore the mandatory owner-identity singleton,
  bundled catalog rows, rebuildable derivatives, and Phase 12 bookkeeping. A
  non-empty database uses Phase 11's previewed, all-or-nothing
  merge. A namespace mismatch permits **one-time authenticated namespace
  adoption** only in this explicit non-empty handover flow, after fresh Google
  authentication and explicit owner confirmation. It is never automatic or
  repeatable.
- The sequence is immutable: restore/merge and deterministic derivative rebuild
  locally -> conditionally claim a successor writer epoch in the manifest ->
  create and validate a fresh backup. Failed claim leaves the restored local data
  intact but the device fenced from cloud writes.

### D-04 - Durable generations and coherent collection

- Planned migration v23 stores non-secret backup state. Every committed mutation
  to an authoritative, user-owned table advances `mutation_generation` in the
  same SQLite transaction. SQLite triggers provide complete writer coverage; no
  per-operation sync change-log is added.
- `backed_up_generation` advances only for the exact generation represented by a
  round-trip-validated snapshot and successfully promoted manifest whose writer
  epoch still matches. A crash or later mutation cannot acknowledge unseen work.
- The scheduler coalesces generations. It captures a full coherent Phase 11
  logical snapshot and `mutation_generation = G` in one short serialized SQLite
  transaction **only while the app is idle and no interactive workout is active**.
  JSON serialization, hashing, Drive I/O, and validation occur after that
  transaction. A mutation committed afterward becomes `G+1` and schedules a
  trailing backup.

### D-05 - Trigger, connectivity, and stale-warning policy

- Launch, foreground, a committed user mutation, manual **Back up now**, and one
  abortable best-effort background opportunity may request work. Requests are
  single-flight, debounced/coalesced, and bounded; workout commands and lifecycle
  cleanup never await them. Recovery after interruption is guaranteed by the
  next launch/foreground check, not by background execution.
- Cellular or any other available connection is allowed by default. The owner may
  enable **Wi-Fi only**; metered connectivity then leaves work pending.
- When `mutation_generation > backed_up_generation` continuously for 24 hours,
  show a non-blocking stale-backup warning with Retry. The warning clears only
  after verified promotion catches up.

### D-06 - Bounds and Drive transport

- Automatic canonical JSON is capped at **24 MiB** and **100,000 total rows**; the
  manifest is capped at **16 KiB**. Existing Phase 11 per-table, string, nesting,
  exact-field, schema, and graph checks remain in force. Oversize data pauses
  automatic backup without changing the last verified cloud state and directs the
  owner to manual GTBK recovery/export.
- Snapshot bodies at **5 MiB or less** use one bounded multipart upload so metadata
  and content are created together. Bodies over **5
  MiB** use a resumable Drive upload session with bounded chunks and restart-safe
  offsets. Downloads, redirects, response bodies, list results, and tokens remain
  bounded and Google-origin-only.

### D-07 - Recovery, retention, and deletion

- A missing or corrupt manifest starts a bounded, environment-scoped scan of
  app-created immutable snapshots. Only fully validated candidates may rebuild a
  manifest, and reconstruction itself is conditional. A corrupt latest snapshot
  is never silently used; the owner may explicitly restore the dated verified
  previous snapshot. A newer-schema snapshot means **update the app**, not
  corruption or permission to overwrite it.
- Cleanup is best-effort and cannot affect backup success. It keeps both manifest-
  referenced snapshots, considers only unreferenced objects in the same
  environment namespace that have been orphaned for at least **24 hours**, and
  moves them to Drive trash rather than permanently deleting them. Each trash
  operation rechecks the current manifest ETag and writer epoch; stale cleanup is
  fenced. Disconnect never cleans cloud data.
- Disconnect cancels local work and clears the local account/writer association but
  retains local SQLite and Drive backups. **Delete cloud backup** is a separate
  destructive flow requiring fresh Google authentication and explicit confirmation.
  It first conditionally promotes the metadata-only deleted tombstone with a successor
  writer epoch, then permanently deletes every accepted snapshot object. Partial
  deletion remains retryable under the tombstone. Each discovery of the tombstone
  repeats a bounded snapshot sweep until none remain, including candidates whose stale
  upload completed after the first sweep. The tombstone is retained so an old writer
  cannot promote or recreate deleted workout data.

### D-08 - Environment isolation and verification

- Production (`com.fchoo.gymtracker`) and development-test
  (`com.fchoo.gymtracker.devtest`) use disjoint Drive namespaces. Environment,
  package, protocol version, and app-property discriminators are validated before
  list, download, restore, promotion, recovery, or cleanup. Neither environment may
  discover or mutate the other's objects.
- CI is deterministic and credential-free: fake auth/Drive/network ports, host and
  real Expo SQLite contracts, crash-cut tests, boundary tests, coverage, CNG, and
  fake-port Maestro. Release evidence also includes an attended signed dev-test
  emulator backup/restore run against a dedicated test account, plus attended
  physical-phone proof of One-Tap identity and `drive.file` scope. Evidence records
  redacted metadata and hashes only, never tokens, account identifiers, Drive IDs,
  or workout rows.
</decisions>

<canonical_refs>
## Canonical References

Downstream planning and implementation must read:

- `.planning/REQUIREMENTS.md` - revised DATA-10 product, privacy, and recovery contract.
- `.planning/ROADMAP.md` - Phase 12 goal and success criteria.
- `.planning/design/v1.1-UX-FLOW.md` - quarantine, handover, backup state, and manual GTBK UX.
- `.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md` and
  `11-VERIFICATION.md` - the completed restore/merge rules that Phase 12 reuses.
- `src/domains/portability/backupContracts.ts` and
  `src/platform/sqlite/repositories/logicalBackupRepository.ts` - canonical logical
  snapshot bounds and coherent collector.
- `src/domains/portability/mergeCommands.ts`,
  `src/platform/sqlite/repositories/logicalMergeRepository.ts`, and
  `src/platform/sqlite/repositories/logicalRestoreRepository.ts` - validated,
  fingerprint-bound merge and atomic restore seams.
- `/Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts`
  and `google-drive/drive-client.ts` - auth and bounded REST patterns only.
</canonical_refs>

<code_context>
## Current Code Baseline

- Phase 11 is complete. The live migration registry ends at
  `0022_portable_owner_identities`; Phase 12's next migration is **v23 (planned)**.
- Logical backup format v2 already supplies canonical owner-scoped identities, a
  24 MiB plaintext ceiling, 100,000-row ceiling, strict allowlists, and graph
  validation.
- The collector already reads all logical tables through the serialized writer.
  Phase 12 must add the captured generation and idle-only admission without holding
  that writer during serialization, hashing, or network work.
- Phase 11's public secure commands are manual-file/password UI flows. Phase 12
  needs narrow programmatic `AutomaticPortableRestorePort` and
  `AutomaticPortableMergePort` capabilities that reuse the validator, full-plan
  writer, state fingerprint, and derivative rebuild without exposing the private
  writer or changing manual GTBK behavior.
- Runtime foreground and post-commit seams exist, but current lifecycle code does
  not guarantee background execution. Phase 12 must model background as best effort.
</code_context>

<deferred>
## Deferred Ideas

- Simultaneous or live multi-device sync and conflict convergence.
- Firestore, a custom backend, shared/family accounts, or non-Google transports.
- Client-side encryption of automatic Drive snapshots. If that privacy model is
  revisited, it requires a new product and migration decision; it must not reuse the
  superseded passphrase design silently.
</deferred>

---

*Phase: 12 - Automatic Google Drive Backup*

*Approved design revised: 2026-09-26*
