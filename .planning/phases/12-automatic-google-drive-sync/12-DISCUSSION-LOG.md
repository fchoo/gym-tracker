# Phase 12: Automatic Google-Drive Sync - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-09-15
**Phase:** 12-Automatic Google-Drive Sync
**Areas discussed:** Sync key distribution across devices

---

## Sync key distribution

| Option | Description | Selected |
|--------|-------------|----------|
| Passphrase-derived key | One sync passphrase → Argon2id-derived key (GTBK crypto family); new device = Google sign-in + passphrase once; nothing on Drive. | ✓ |
| Random key + recovery code | App generates random key + one-time recovery code entered per device; strong but lose-the-code = unrecoverable. | |
| Wrapped key in Drive appDataFolder | Data key stored wrapped in Drive, protected by a passphrase; fewer prompts but more moving parts. | |

**User's choice:** Passphrase-derived key (Recommended)
**Notes:** Reuses v1.0 backup password crypto; simple mental model; zero key material on Drive.

## Carried from earlier owner decisions (REQUIREMENTS.md, not re-asked)

- Own Google Drive backend (not managed/self-host); reuse helper-payroll-app Google One-Tap + Drive REST + Noble ciphers; do NOT adopt its Firestore transport; sync derivative + non-blocking + retryable; client-side XChaCha20-Poly1305; sign-in optional/reversible.

## Claude's Discretion

- Change-log format/chunking, debounce/coalesce of the three triggers, sync conflict-preview surfacing, sync-status indicator styling.

## Deferred Ideas

- Multi-account/shared sync, millisecond-live sync, non-Google transports → backlog / out of scope.
