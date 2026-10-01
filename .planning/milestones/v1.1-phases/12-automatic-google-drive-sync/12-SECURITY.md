---
phase: 12
slug: automatic-google-drive-sync
status: verified-source-and-fake-port
threats_total: 14
threats_open: 0
asvs_level: 1
block_on: high
---

# Phase 12 — Automatic Google Drive Backup Security

Automatic Drive snapshots are canonical, bounded JSON. They are integrity checked,
not client-side encrypted: a Google-account holder who can access the app-created
`drive.file` objects can read their workout facts. SHA-256 detects accidental or
malicious byte corruption after retrieval; it is neither authentication nor encryption.
Manual encrypted GTBK remains the confidential backup option.

```text
authoritative SQLite --(bounded canonical snapshot)--> backup coordinator
       ^                                              |
       |                                              | HTTPS + drive.file token
       |                                              v
restore/merge writer <--(validated snapshot)-- Google Drive app namespace
       ^                                              |
       +-- one transaction / local receipt -- ETag + writer-epoch fence

Evidence/checklists receive only: manifest/build hashes, case IDs, counts, sizes,
timestamps, and redacted digests. Tokens, emails, permission IDs, Drive IDs, object
names, and workout rows never cross into logs or evidence.
```

## Trust Boundaries and Threat Register

| ID | Boundary / threat | Severity | Mitigation and disposition |
|---|---|---:|---|
| P12-S01 | One-Tap/token refresh spoofing | high | `GoogleAuthPort` verifies the requested `drive.file` scope and identity before discovery. Tokens stay adapter-local and are never persisted. Closed. |
| P12-S02 | `permissionId` or account changes | high | Account, connection generation, environment, and writer epoch fence every receipt, claim, acknowledgement, cleanup, and publish. Stale callbacks cannot inherit authority. Closed. |
| P12-E01 | Broad Google Drive authority | high | The sole requested Drive scope is `https://www.googleapis.com/auth/drive.file`; discovery is app-property/environment scoped. Closed. |
| P12-I01 | Readable automatic JSON | high | Accepted risk documented above: automatic backups are readable to the Google-account holder. Manual GTBK supplies encryption. No automatic cipher or passphrase claim is made. Closed/accepted. |
| P12-I02 | Production/development-test crossing | critical | Package and environment are embedded in snapshot/manifest metadata and exact discovery predicates; mismatches quarantine before download, restore, cleanup, or delete. Closed. |
| P12-T01 | Manifest lost-update/replay | critical | Raw ETag `If-Match`, reread validation, and monotonic writer epoch reject 409/412 and stale writers; immutable snapshots are never overwritten. Closed. |
| P12-T02 | Corrupt or substituted snapshot | critical | Exact-key parser, UTF-8/canonical bytes, SHA-256 payload and object digests, bounded schema/row/string limits, and graph validation precede promotion/restore. SHA-256 is integrity only, not authentication. Closed. |
| P12-T03 | Restore treated as empty or trusted early | critical | All connects begin in quarantine. Missing/corrupt/future/ambiguous artifacts never mean empty; direct restore/merge/adoption remains atomic and fenced. Closed. |
| P12-E02 | Silent namespace adoption | high | Adoption requires fresh auth plus explicit one-time confirmation in the state-bound merge transaction; background sync has no adoption capability. Closed. |
| P12-I03 | Logs or evidence leak identity/content | high | Evidence schema rejects secret/account/object/content fields and records hashes/counts/sizes/case IDs only. Real-Google recording has a dedicated redaction validator. Closed. |
| P12-T04 | Cleanup/delete touches current or foreign data | critical | Cleanup rereads matching ETag/epoch, excludes latest/previous, uses orphan grace, and stays in namespace. Delete uses a fresh-auth tombstone then bounded permanent sweeps. Closed. |
| P12-R01 | Stale phone resumes publishing | high | The successor claim advances writer epoch; old epochs may neither publish, acknowledge, clean, nor delete. Closed. |
| P12-I04 | Account or device compromise | high | Outside client-side confidentiality protection: Google-account/device compromise can expose readable automatic JSON. Limit account/device access; use encrypted GTBK where confidentiality is required. Accepted. |
| P12-E03 | New covert cloud/key path | high | Source and boundary scans prohibit Firestore, SecureStore/key custody, automatic passphrases/ciphers, and hosted sync. Closed. |

## Verification Boundaries

- Host and fake-port Expo contracts exercise the source-owned no-skip crash/fence IDs.
- The manifest-bound native/benchmark producer is credential-free and cannot claim real Google behavior.
- The blocking attended gate has exactly two live observation groups: one fresh development-test backup/replacement flow and one physical-phone One-Tap, `drive.file`, and refresh smoke.
- Adoption, stale-writer, corrupt/previous/future recovery, retention, deletion, and other adversarial behavior are deterministic host/Expo/Maestro/benchmark evidence only and must never be labeled as live Google observations.
- The physical-phone smoke never uploads, restores, clears, merges, deletes, or inspects backup data.

## Prohibited Paths Confirmed

No automatic-backup code path introduces an automatic cipher, passphrase, SecureStore
key, Firestore, hosted service, family sharing, or production namespace access from the
development-test profile. The Phase 12 source boundary is Google OAuth plus bounded
Drive REST only.
