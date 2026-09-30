# Phase 12 Validation Matrix

## Evidence Boundary

| Scope | Evidence | Required |
|---|---|---|
| Fresh one-device backup and replacement restore | Attended development-test emulator observation, retained APK/source identity, source/restored SHA-256 equality | Yes |
| One-Tap `drive.file` consent and token refresh | Attended physical-phone auth-only observation, retained APK identity | Yes |
| Adoption, stale-writer fencing, corrupt/previous/future recovery | Deterministic unit, host SQLite, native SQLite, and Maestro case IDs | Yes, never labeled live |
| Retention, tombstone deletion, late-upload sweep | Deterministic coordinator/adapter/native case IDs | Yes, never labeled live |
| Maximum 24 MiB/100,000-row atomic merge | Manifest-bound native benchmark with five real writer commits | Yes |

## Requirement Map

- `DATA-10`: satisfied only when all 30 `GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS`, all 18 distinct Maestro stages, the maximum-size benchmark, and both attended observation groups pass against one retained manifest.
- `D-01` through `D-07`: deterministic evidence owns adversarial and destructive cases.
- `D-08`: the final verifier enforces build identity, exact evidence type, zero skips, explicit approval, and recursive privacy rejection.

No deterministic result may satisfy either attended observation, and no attended narrative may satisfy a deterministic adversarial case.
