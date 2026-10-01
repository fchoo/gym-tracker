---
phase: 11
slug: portable-history-merge-restore
status: verified
threats_open: 0
threats_total: 12
asvs_level: 1
block_on: high
register_origin: retroactive-stride
created: 2026-09-23
verified: 2026-09-23
---

# Phase 11 — Security

> Retroactive STRIDE verification for manual encrypted backup, restore-clean, and local merge. Phase 12 account, Drive, network, and sync behavior is excluded.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| External backup file → app | User-selected GTBK bytes enter the app as untrusted encrypted input | Envelope header, ciphertext, salt, nonce, tag |
| Password UI → crypto boundary | User password derives an archive key and must not persist beyond the operation | Password string and mutable UTF-8 bytes |
| Authenticated snapshot → planner | Only authenticated, bounded, schema-validated logical rows may become a merge plan | Owner namespace, source rows, graph references |
| Preview token → writer | A one-use token carries the authenticated plan and local fingerprint into commit | Archive digest, local fingerprint, immutable plan |
| Planner → SQLite writer | Untrusted archive intent reaches authoritative local facts | Classed operations, mappings, aggregate rows |
| Development-test fixtures → runtime | App-owned fixture selectors must never become a production file-read bypass | Allowlisted encrypted fixture names and bytes |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| P11-T01 | Tampering | GTBK format/open | critical | mitigate | AES-GCM authenticates ciphertext and canonical bounded header AAD before logical payload parsing. | closed |
| P11-I01 | Information Disclosure | Password and archive lifecycle | high | mitigate | Mutable password/key/plaintext/ciphertext/tag/nonce/salt/archive buffers are owned and wiped in `finally`; UI password state clears before async preflight. | closed |
| P11-D01 | Denial of Service | File picker and parser | high | mitigate | Capped reads plus archive/header/plaintext/row/string/nesting limits reject oversized or malformed input. | closed |
| P11-I02 | Information Disclosure | File and error surfaces | medium | mitigate | URIs stay in the adapter; UI receives opaque archive metadata; failures map to bounded codes without paths, rows, passwords, or native details. | closed |
| P11-S01 | Spoofing | Owner identity | high | mitigate | Schema 22 requires one opaque owner namespace; archive/local namespaces must match before plan or token issuance. | closed |
| P11-R01 | Repudiation / Replay | Preflight token | high | mitigate | One active opaque token is consumed exactly once; reuse, cancellation, back navigation, and unmount invalidate it. | closed |
| P11-T02 | Tampering / TOCTOU | Preview-to-commit state | high | mitigate | Canonical local fingerprint is captured at preview and recomputed inside the serialized writer transaction before mutation or no-op success. | closed |
| P11-E01 | Elevation of Privilege | Writer capability | critical | mitigate | Production receives only frozen `commitFullPlan`; kernel/internal repository and legacy tracer `commit` are not exposed through secure merge wiring. | closed |
| P11-T03 | Tampering | Atomic writer | critical | mitigate | Full plan applies under one `BEGIN IMMEDIATE`; command/commit failures roll back; verification, FK checks, trigger restoration, and rebuild state occur before commit. | closed |
| P11-E02 | Elevation of Privilege | Dynamic SQL | high | mitigate | Table inputs come from static sets; identifiers match a strict grammar and are quoted; values are parameterized. | closed |
| P11-T04 | Tampering | Snapshot and graph validation | high | mitigate | Parser rejects unknown/extra/missing fields and duplicates; planner/writer enforce declared classes, FK-closed aggregates, references, mappings, and live-state consistency. | closed |
| P11-E03 | Elevation of Privilege | Native fixture selector | high | mitigate | Fixture access requires development-test profile, native contracts enabled, exact Phase 11 suite, distinct package identity, and allowlisted encrypted filenames. | closed |

## Verification Evidence

- `backupFormat.test.ts`, `mergeCommands.test.ts`, `mergePlan.test.ts`, and `expoBackupFilePort.test.ts`: 4 suites, 157 tests passed.
- `logicalMergeRepository.test.ts`: 97 tests passed, including stale fingerprint, capability isolation, malformed graph/SQL input rejection, and canonical-state rollback.
- `phase11-evidence-scripts.test.mjs`: 7/7 passed and proves generated fixtures do not expose raw logical rows.
- Final native migrations-effects 13/13, portable merge 13/13, and Maestro 4/4 are bound to evidence head `4173c72`.

## Accepted Risks Log

No security-gate exception is required.

JavaScript password inputs necessarily exist briefly as immutable strings at the UI/API boundary and cannot be guaranteed zeroized by application code. Controlled UI state clears before awaiting preflight, all mutable byte representations are wiped, and no password is stored in a token, archive handle, metadata record, error, or log. This is an inherent runtime characteristic with exposure minimization, not an open Phase 11 threat.

## Unregistered Threat Flags

None. No Phase 11 summary declared a separate `## Threat Flags` entry, and the retroactive implementation scan found no additional in-scope attack surface.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-23 | 12 | 12 | 0 | GSD security auditor, retroactive STRIDE, ASVS L1 |

## Sign-Off

- [x] All threats have a disposition.
- [x] No accepted-risk exception is required.
- [x] `threats_open: 0` confirmed.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-09-23
