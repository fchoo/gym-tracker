---
phase: 05-recovery-distribution-and-release
slug: recovery-distribution-and-release
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-26
---

# Phase 05 — Security

> Retroactive STRIDE verification for Phase 5 recovery, distribution, and release boundaries. No formal plan-time threat register existed, so the audit derived threats from the implemented trust boundaries and verified each mitigation in source.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Backup archive | Owner data crosses from SQLite into an encrypted portable file | Password, KDF material, plaintext logical snapshot, ciphertext |
| Restore import | Untrusted archive bytes cross into authoritative SQLite state | Authenticated metadata, bounded logical rows, retained catalog references |
| Readable CSV | Sensitive owner history crosses into a plaintext cache file and OS share sheet | Workout, audit, and recommendation facts |
| Candidate automation | Workflow inputs and retained artifacts cross into signing/evidence jobs | Commit, package/profile, APK/AAB and inner hashes, run provenance |
| Human evidence | Owner-authored observations and attachments cross from a protected runner into immutable artifacts | Attended results, evidence files, approval token |
| Public promotion | Private approved bytes cross into a GitHub Release | Candidate artifacts, attended record, promotion proof |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| P5-S-01 | Spoofing | Backup archive | high | mitigate | Authenticated GTBK envelope, Argon2id, AES-256-GCM/AAD, and non-oracular authentication errors | closed |
| P5-T-01 | Tampering | Logical snapshot | high | mitigate | Exact table/key allowlists, nested-value and reference validation, and no raw database export | closed |
| P5-I-01 | Information Disclosure | Backup lifecycle | high | mitigate | Password/key/plaintext/ciphertext buffers are wiped; opaque archive handles are deleted after share, replacement, cancellation, late completion, and abandonment; cleanup failure maps to bounded `GT-BACKUP04` without exposing the private cache path | closed |
| P5-D-01 | Denial of Service | Backup/restore parsing | high | mitigate | Explicit archive, plaintext, row, string, nesting, password, and read limits | closed |
| P5-T-02 | Tampering | Restore command | critical | mitigate | Authentication precedes parse/write; commit requires exact `REPLACE` and a consumed single-use preflight token | closed |
| P5-T-03 | Tampering | SQLite replacement | critical | mitigate | One serialized transaction, allowlisted trigger handling, deferred FK verification, and rollback-safe failure | closed |
| P5-D-02 | Denial of Service | Derivative recovery | high | mitigate | Durable `rebuild_pending`, sequential rebuild/parity checks, guarded ready transition, and retry | closed |
| P5-T-04 | Tampering | CSV content | high | mitigate | Fixed schema/order, canonical serialization, RFC quoting, and formula neutralization | closed |
| P5-I-02 | Information Disclosure | CSV lifecycle | medium | mitigate | Bounded plaintext file, explicit warning, opaque handle, and cleanup after share/failure/replacement/abandonment | closed |
| P5-E-01 | Elevation of Privilege | Workflow dispatch inputs | high | mitigate | Inputs cross through environment variables and are validated before privileged use; direct expression interpolation in shell blocks is rejected | closed |
| P5-E-02 | Elevation of Privilege | CI credentials | high | mitigate | Least-privilege permissions, disabled OIDC, protected environments, step-scoped signing secrets, and unconditional signing cleanup | closed |
| P5-S-02 | Spoofing | Cross-run evidence | critical | mitigate | Candidate/human/attended runs are pinned by repository, workflow path, event, environment, commit, success, and artifact identity before candidate code executes | closed |
| P5-T-05 | Tampering | Candidate bytes | critical | mitigate | Canonical source/config/tree identity plus raw APK/AAB and inner bundle/config hashes are recomputed | closed |
| P5-T-06 | Tampering | Evidence files | high | mitigate | Canonical-root containment, recursive symlink/type/count/size checks, unique attachments, and byte-level hashes fail closed | closed |
| P5-R-01 | Repudiation | Owner approval | high | mitigate | Exact lowercase CLI token, complete passed observations, immutable source and attachment hashes, and canonical record verification | closed |
| P5-T-07 | Tampering | No-rebuild promotion | critical | mitigate | Build-once ordering, retained-byte validation, exact candidate checkout, and no post-manifest build path | closed |
| P5-E-03 | Elevation of Privilege | Release publication | critical | mitigate | Repository-wide serialization, used-run/tag refusal, draft-first upload, public-byte hash verification, then publication and immutable proof | closed |
| P5-S-03 | Spoofing | Automated evidence | high | mitigate | Producer/device/package/version/case-ledger/raw-report validation and canonical aggregate recomputation | closed |

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-26 | 18 | 18 | 0 | TRAE gsd-security-auditor |
| 2026-08-26 | 4 | 4 | 0 | TRAE gsd-security-auditor (supplemental UI lifecycle) |

The supplemental audit closed `P5-UI-I-01`, `P5-UI-T-01`, `P5-UI-I-02`,
and `P5-UI-T-02`: cancelled, late, and abandoned backup handles are discarded;
restore tokens are single-active and single-use; UI/runtime boundaries expose no
private URI or archive payload; and preview facts remain bound to authenticated,
validated snapshot bytes. Commit `d6f5cad` is test-only evidence for the existing
bounded cleanup-error mapping; it does not claim that every operating-system
deletion attempt succeeds. Commit `8ac43a9` changes only accessibility semantics
and does not alter the security verdict.

### Supplemental UI lifecycle threats

| Threat ID | Category | Severity | Mitigation | Status |
|---|---|---|---|---|
| P5-UI-I-01 | Information Disclosure | high | Abort/generation guards discard archives created after cancellation or unmount; unshared ready archives are discarded on unmount; share transfers cleanup ownership to the command. | closed |
| P5-UI-T-01 | Tampering | critical | Restore preflight tokens are opaque, single-active, and single-use; replacement, abandonment, stale completion, and commit consumption invalidate the exact token. | closed |
| P5-UI-I-02 | Information Disclosure | high | UI/runtime contracts expose only opaque archive IDs/tokens; passwords are cleared when work starts and failures use fixed safe copy without paths, URIs, payloads, or native exceptions. | closed |
| P5-UI-T-02 | Tampering | critical | Preview version, creation time, counts, and references derive only from the authenticated and validated snapshot bound to the consumed preflight token. | closed |

## Sign-Off

- [x] All threats have a disposition.
- [x] Accepted risks are documented.
- [x] `threats_open: 0` confirmed.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-08-26

This is a source-security audit only. It does not assert that the candidate, attended, promotion, or Terminal Seal gates have run.
