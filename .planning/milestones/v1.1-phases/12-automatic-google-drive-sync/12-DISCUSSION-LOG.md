# Phase 12: Automatic Google Drive Backup - Discussion Log

> **Audit trail only.** The binding contract is in `12-CONTEXT.md`.

**Original discussion:** 2026-09-15

**Architecture revision approved:** 2026-09-26

**Phase:** 12 - Automatic Google Drive Backup

## Why the design changed

The original proposal treated Drive as an encrypted replication channel between
simultaneously active devices. Architecture review found that this added key
distribution, change-log convergence, bootstrap races, and namespace problems to
what the owner actually needed: reliable replacement-phone recovery. The approved
pivot is a single-active-device snapshot backup with explicit restore and writer
handover.

## Settled decisions

| Area | Approved decision | Consequence |
|---|---|---|
| Product model | Automatic backup and replacement restore; one active writer, no concurrent/live multi-device sync. | A second phone restores and takes over; it never background-merges with the old phone. |
| Privacy model | Automatic snapshots are canonical unencrypted JSON under Google-account trust. SHA-256 detects accidental corruption only. | Anyone with Drive/account access can read them; explain this in discoverable help. Manual GTBK remains password-encrypted. |
| Cloud state | New immutable object per snapshot; an ETag-protected manifest points to verified latest and, once available, previous. | No snapshot overwrite and no blind manifest update. |
| Promotion | Upload candidate, bounded download, verify bytes/hash/schema/graph/namespace/generation, `If-Match` manifest promotion, reread manifest, then local acknowledgement. | A crash never creates a half-promoted authoritative backup. |
| Writer fencing | Manifest and local state carry an opaque `writer_epoch`; every publish, acknowledgement, and cleanup checks it as well as the manifest ETag. | An old phone or stale process cannot regain write authority by retrying. |
| First connect | Always enter restore-first quarantine; discovery/validation only. With no app backup artifacts, remain pending until the first snapshot is round-trip validated, then create the first manifest/writer epoch. | Invalid or corrupt cloud artifacts are preserved for recovery, and an empty manifest is never presented as a verified backup. |
| Restore routing | Empty local database uses direct Phase 11 restore; non-empty uses Phase 11 previewed all-or-nothing merge. | Restore/merge remains authenticated, bounded, atomic, and followed by deterministic rebuild. |
| Namespace mismatch | Allow one-time authenticated namespace adoption only during an explicit non-empty replacement-phone merge, after fresh auth and confirmation. | Phase 11's random per-install namespace no longer blocks handover, without enabling silent adoption. |
| Handover order | Complete local restore/merge and rebuild, then conditionally claim a successor writer epoch, then create a fresh backup. | Claim failure cannot erase the restored local facts and grants no cloud write permission. |
| Dirty tracking | Every committed authoritative user mutation increments `mutation_generation` in the same transaction; use SQLite trigger coverage, not an operation log. | Process death cannot lose dirty intent and Phase 12 does not need a change-log/outbox. |
| Acknowledgement | Advance `backed_up_generation` only for the exact generation round-trip-validated and promoted under the same writer epoch. | Upload success alone never reports data as safe. |
| Snapshot capture | Capture one coherent snapshot plus generation in a short serialized transaction only while idle and outside an interactive workout; serialize/hash/upload afterward. | The workout path stays responsive and mutations during upload remain pending for a trailing run. |
| Scheduling | Launch, foreground, post-commit request, manual action, and one abortable background opportunity; single-flight, coalesced, bounded retries. | No polling or promised upload-on-close; next launch/foreground is the recovery guarantee. |
| Network | Any available connection, including cellular, by default; optional Wi-Fi-only policy. | Metered users can opt out without changing correctness. |
| Staleness | Warn non-blockingly after `mutation_generation > backed_up_generation` for 24 hours; offer Retry. | Backup failure stays visible without blocking workout logging. |
| Limits | Snapshot <= 24 MiB and <= 100,000 rows; manifest <= 16 KiB. Use one bounded multipart upload at <= 5 MiB and resumable upload above 5 MiB. | Oversize or malformed inputs pause safely and preserve the last verified manifest. |
| Recovery | Missing/corrupt manifest triggers bounded environment-scoped snapshot scan and conditional reconstruction; corrupt latest may fall back only by explicit choice to verified dated previous. | Recovery never guesses from timestamps or restores corrupt/newer-schema data silently. |
| Retention | Preserve both referenced snapshots. After 24 hours, a current-epoch/ETag-fenced cleanup may trash only unreferenced same-environment orphans. | Cleanup cannot delete latest/previous; disconnect does not delete remote data. |
| Cloud deletion | After fresh auth and exact destructive confirmation, conditionally publish a metadata-only successor-epoch tombstone, then permanently delete workout snapshots and retain the tombstone. | Workout data is removed while retired phones remain unable to resurrect it; starting again requires fresh auth and explicit confirmation. |
| Environment | Production and development-test packages use disjoint remote namespaces and validate environment metadata/app properties on every operation. | Test evidence and cleanup cannot touch production backup objects. |
| Verification | Deterministic fake-port CI plus host/real-Expo crash and persistence contracts; attended signed dev-test emulator backup/restore; attended physical-phone One-Tap and `drive.file` proof. | CI needs no credentials, while native Google behavior still has explicit release evidence. |

## Superseded decisions

The 2026-09-15 choices below are intentionally revoked for DATA-10:

- Passphrase-derived automatic-backup keys and cross-device passphrase entry.
- XChaCha20-Poly1305 automatic payload encryption.
- `expo-secure-store` storage for a derived automatic-backup key.
- Encrypted snapshot plus append/merge change-log and two-device convergence.
- Firestore, Firebase, family sharing, `appDataFolder`, or a managed sync service.

These removals do not change Phase 11: manually exported GTBK files remain
password-encrypted and retain their existing restore-clean and merge flows.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Keep both phones active and merge every change | Expands the feature into distributed conflict resolution and violates the approved replacement-phone scope. |
| Encrypt automatic snapshots with a passphrase or recovery key | Adds key-distribution and lockout UX the owner did not choose; Google-account trust is the approved boundary. |
| Treat a missing/corrupt manifest as an empty Drive | Could overwrite the only recoverable snapshots. |
| Upload first from the replacement phone, then restore | Risks replacing a good cloud backup with incomplete local state. |
| Rely on ETag alone | Prevents simultaneous writes from one manifest version but does not fence a superseded device after handover. |
| Delete old snapshots immediately after promotion | A crash or stale cleanup could remove the sole usable predecessor. |
| Promise background completion | Android may suspend or kill the process; durable generations and foreground recovery are the truthful guarantee. |

## Remaining implementation discretion

- Exact debounce, jitter, retry count, resumable chunk size, and measured
  writer-occupancy/serialization budgets, provided all runs remain bounded and
  meet the locked idle-only/non-blocking behavior.
- Exact safe UI copy and styling for quarantine, fenced writer, stale backup,
  previous-snapshot recovery, and Wi-Fi-only states.
- Exact bounded count for manifest-recovery discovery, provided it is tested and
  cannot cross the environment namespace.

No product or architecture decision remains open in this discussion record.
