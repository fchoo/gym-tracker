---
phase: 17
slug: library-running-plans
status: verified
register_authored_at_plan_time: true
threats_total: 45
threats_closed: 45
threats_open: 0
accepted_risks: 2
asvs_level: 1
block_on: high
created: 2026-10-11
---

# Phase 17 — Security

All 14 plan-time threat models were audited. Forty-three mitigation dispositions have implementation or executable-test evidence. Two low-severity risks already had `accept` dispositions in the owner-approved plans and are documented below; neither bypasses Phase 20 native acceptance.

## Trust Boundaries

| Boundary | Description | Data crossing |
|---|---|---|
| Library UI → command ports | Drafts become writes only through explicit Save/confirm capabilities | Plans, sessions, custom exercises, lifecycle choices |
| Runtime → SQLite exclusive writer | Revisioned commands are acknowledged only after commit/readback | Canonical request hashes, immutable receipts, source IDs |
| Archive → local source graph | Logical restore/merge treats archive identifiers and rows as untrusted | v8 plans, sessions, collision outcomes, custom receipts |
| Native evidence → retained artifacts | Metadata is untrusted until case-bound artifacts and source probes verify | Reports, screenshots, semantic/focus traces, fixture receipts |
| Devtest fixtures → product commands | Fixture setup/action/cleanup is exact-suite gated and namespace-limited | Synthetic IDs, deterministic envelopes, expected facts |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|---|---|---|---|---|---|---|
| T-17-01-01 | Tampering | Running create/save | high | mitigate | Strict graph/revision/hash/receipt and exclusive writer | closed |
| T-17-01-02 | Repudiation | Create retry | medium | mitigate | Stable request identity/hash and durable replay | closed |
| T-17-01-03 | Information disclosure | Validation diagnostics | medium | mitigate | Bounded error codes; no payload logging | closed |
| T-17-01-04 | Denial of service | Form payloads | medium | mitigate | Strict bounded schemas before write | closed |
| T-17-02-01 | Tampering | Plan grouping | high | mitigate | Source-backed per-sport active collection | closed |
| T-17-02-02 | Denial of service | Search/rendering | medium | mitigate | Cursor paging and batched snapshots | closed |
| T-17-02-03 | Information disclosure | Refresh errors | medium | mitigate | Aggregate counts and fixed UI copy only | closed |
| T-17-02-04 | Spoofing | Disabled import action | low | accept | Inert disabled surface, no mutation capability | accepted |
| T-17-03-01 | Tampering | Owned lifecycle | high | mitigate | Preview token, ownership/revision checks, receipt | closed |
| T-17-03-02 | Repudiation | Archive/reactivate replay | medium | mitigate | Confirmation and committed replay result | closed |
| T-17-03-03 | Information disclosure | Missing/error detail | low | accept | Fixed safe copy and bounded retry state | accepted |
| T-17-04-01 | Tampering | Aggregate save | high | mitigate | Exact graph/revision validation and exclusive write | closed |
| T-17-04-02 | Elevation of privilege | Bundled/owned boundary | high | mitigate | Bundled sources rejected for owned mutation | closed |
| T-17-04-03 | Information disclosure | Save diagnostics | medium | mitigate | Stable codes, no draft serialization | closed |
| T-17-05-01 | Tampering | Schedule/impact | high | mitigate | Preview, revisions, request hash, receipt | closed |
| T-17-05-02 | Repudiation | Replacement/removal | medium | mitigate | Consequence confirmation and receipt-backed commit | closed |
| T-17-05-03 | Elevation of privilege | Active-workout guard | high | mitigate | Writer rechecks active workout | closed |
| T-17-06-01 | Elevation of privilege | Starter mutation | high | mitigate | Bundled source validation and fresh owned IDs | closed |
| T-17-06-02 | Tampering | Activation/update | high | mitigate | Source/schedule revisions and preview-confirm writer | closed |
| T-17-06-03 | Repudiation | Starter retry | medium | mitigate | Separate copy/activation receipts and readback | closed |
| T-17-07-01 | Elevation of privilege | Bundled exercise rows | high | mitigate | Repository rejects bundled mutation | closed |
| T-17-07-02 | Tampering | Metric migration | high | mitigate | Revisioned migration and idempotency receipt | closed |
| T-17-07-03 | Information disclosure | Editor errors | medium | mitigate | Stable correlation/error codes | closed |
| T-17-08-01 | Tampering | Running plan selection | high | mitigate | Typed aggregate and exact repository read | closed |
| T-17-08-02 | Repudiation | Running lifecycle | medium | mitigate | Preview token, receipt replay, committed return | closed |
| T-17-08-03 | Information disclosure | Goal/benchmark errors | medium | mitigate | Stable validation and no raw diagnostics | closed |
| T-17-09-01 | Tampering | Session variant payload | high | mitigate | Strict seven-kind discriminated union | closed |
| T-17-09-02 | Spoofing | Create identity | high | mitigate | Runtime ID plus durable command receipt | closed |
| T-17-09-03 | Information disclosure | Form errors | medium | mitigate | Focused bounded error paths | closed |
| T-17-10-01 | Tampering | Hidden fields | high | mitigate | Selected-kind schemas reject extras | closed |
| T-17-10-02 | Denial of service | Counts/cues | medium | mitigate | Safe integer/string/unit bounds | closed |
| T-17-10-03 | Repudiation | Preview versus persisted | medium | mitigate | Canonical hash and post-commit readback | closed |
| T-17-11-01 | Tampering | Reorder/delete | high | mitigate | Stable roots/revisions and complete membership | closed |
| T-17-11-02 | Tampering | Portability | high | mitigate | v8 allowlist, closure validation, ID remap | closed |
| T-17-11-03 | Repudiation | Portable retries | medium | mitigate | Durable receipts/tombstones in source graph | closed |
| T-17-12-01 | Tampering | Collision command | high | mitigate | Dual identity/revision/token revalidation | closed |
| T-17-12-02 | Repudiation | Keep both | medium | mitigate | Immutable outcome/receipt and replay hash | closed |
| T-17-12-03 | Elevation of privilege | Cross-plan mutation | high | mitigate | Exact opportunity ownership/current state checks | closed |
| T-17-13-01 | Spoofing | Evidence identity | high | mitigate | Source/commit/APK/install/device/report binding | closed |
| T-17-13-02 | Tampering | Evidence ledger | high | mitigate | Missing/duplicate/stale/unmapped rejection | closed |
| T-17-13-03 | Information disclosure | Evidence JSON/logs | high | mitigate | Traversal/symlink/hash/privacy validation | closed |
| T-17-13-04 | Repudiation | Test result | medium | mitigate | Raw-report hash and retained case artifacts | closed |
| T-17-14-01 | Spoofing | Runner identity | high | mitigate | Manifest-bound source/APK/install/device verifier | closed |
| T-17-14-02 | Tampering | Consolidated evidence | high | mitigate | Exact 39-case executed registry binding | closed |
| T-17-14-03 | Information disclosure | Native evidence | high | mitigate | Recursive artifact/privacy validation | closed |

## Accepted Risks Log

| Risk ID | Threat ref | Rationale | Accepted by | Documented |
|---|---|---|---|---|
| AR-17-01 | T-17-02-04 | Import remains visibly disabled and has no command capability; no false success or hidden mutation is possible. | Owner-approved Phase 17 plan-time register | 2026-10-11 |
| AR-17-02 | T-17-03-03 | Missing/error detail uses fixed bounded copy and retry without exposing source payloads; final native semantics remain Phase 20-gated. | Owner-approved Phase 17 plan-time register | 2026-10-11 |

## Security Audit Trail

| Audit date | Threats total | Mitigated | Accepted | Blocking open | Run by |
|---|---:|---:|---:|---:|---|
| 2026-10-11 | 45 | 43 | 2 | 0 | GSD security auditor + orchestrator reconciliation |

## Sign-Off

- [x] All threats have a disposition.
- [x] All 43 mitigations have implementation/test evidence.
- [x] Two owner-approved low risks are documented.
- [x] `threats_open: 0` at the configured high threshold.
- [x] No native execution is claimed before Phase 20.

**Approval:** verified 2026-10-11
