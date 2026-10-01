# Phase 12 Validation Matrix

## Evidence Boundary

| Scope | Evidence | Required | Final status |
|---|---|---|---|
| Fresh one-device backup and replacement restore | Attended development-test emulator observation, retained APK/source identity, source/restored SHA-256 equality | Yes | Approved and passed |
| One-Tap `drive.file` consent and token refresh | Attended physical-phone auth-only observation, retained APK identity | Yes | Approved and passed |
| Adoption, stale-writer fencing, corrupt/previous/future recovery | Deterministic unit, host SQLite, native SQLite, and Maestro case IDs | Yes, never labeled live | Passed deterministically |
| Retention, tombstone deletion, late-upload sweep | Deterministic coordinator/adapter/native case IDs | Yes, never labeled live | Passed deterministically |
| Maximum 24 MiB/100,000-row atomic merge | Manifest-bound native benchmark with five real writer commits | Yes | Passed |

## Requirement Map

- `DATA-10`: satisfied only when all 30 `GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS`, all 18 distinct Maestro stages, the maximum-size benchmark, and both attended observation groups pass against one retained manifest.
- `D-01` through `D-07`: deterministic evidence owns adversarial and destructive cases.
- `D-08`: the final verifier enforces build identity, exact evidence type, zero skips, explicit approval, and recursive privacy rejection.

No deterministic result may satisfy either attended observation, and no attended narrative may satisfy a deterministic adversarial case.

## Final Closure

- The owner explicitly approved the redacted attended observations for the exact retained build.
- The retained attended record has SHA-256 `a46e8280bd42fcdd18ff11198fa868b3d2c512ce3f0e1169484a4ea0086045e5`.
- The final ledger reports `mode: final`, `status: passed`, and `approval_status: approved`.
- The final ledger reports native migrations `13/13`, Google backup cases `30/30`, Maestro stages `18/18`, and attended observations `2/2`.
- The strict final verifier passed against the unchanged retained evidence.
- Recursive privacy validation passed. No token, email, permission ID, Drive ID, workout row, or production object detail is recorded in the final closure.

`DATA-10` and decisions `D-01` through `D-08` are closed for the approved Phase 12 scope. Adversarial and destructive cases remain deterministic-only; this closure does not expand their live-observation claims.
