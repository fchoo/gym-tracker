---
phase: 13
slug: multi-plan-running-foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-08
verified: 2026-10-08
register_authored_at_plan_time: true
---

# Phase 13 — Security

> ASVS L1 verification of the complete plan-time STRIDE register. The audit is bound to implementation commit `69340bdb7ab3cea0ed5516043347531c834ccbdc`, source digest `7037f6f15ef062458d010e88422f0ab5071e9575a38064926e354f446c489bc4`, and retained/installed APK SHA-256 `aebbfdf16b5b0b3488fbb5b9c4540adaa2cd57f016f9282df498ae362ad0553e`. Current descendants change planning documents only.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|---|---|---|
| Owner decisions → schema/runtime | MAP-01 and TIM-01 authorize one-way cardinality and capability changes | Approved selection, date, compatibility policy |
| Untrusted Garmin envelope → source facts | External identities and normalized facts enter authoritative SQLite | Account namespace, external ID, canonical digest, bounded activity facts |
| Commands → exclusive SQLite writer | Revision-fenced mutations become durable facts and receipts | IDs, expected revisions, request hashes, bounded payloads |
| Source graph → projections | Calendar, Progress, match, recommendation, and rebuild views remain derivative | Immutable events, lifecycle state, rebuild generations |
| Portable archive → restore/merge writer | Versioned untrusted archives may replace or merge the graph | Owner-scoped IDs, tables, receipts, bounded JSON |
| Committed source → APK/device evidence | Acceptance must prove the reviewed bytes ran | Git implementation digest, APK hashes, package, device, case registry |
| Native result → retained evidence | Machine-readable proof must remain complete and privacy-safe | Case IDs, counts, codes, hashes, versions; no personal rows |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation evidence | Status |
|---|---|---|---|---|---|---|
| T-13-01-01 | Tampering | migration 23 trigger registry | high | mitigate | Frozen registry and exact fresh/retained migration assertions in `migrations-effects.test.ts` and native migrations 14/14 | closed |
| T-13-01-02 | Repudiation | MAP-01 decision | high | mitigate | Approved `one-per-sport` owner record, retained MAP evidence, per-sport indexes, and native MAP activation case | closed |
| T-13-01-03 | Information Disclosure | migration fixture/diagnostics | medium | mitigate | Synthetic fixtures and privacy-safe codes/counts/hashes enforced by Phase 13 verifier | closed |
| T-13-02-01 | Tampering | migration 0028 | critical | mitigate | Recovery-backed migration, exact schema verification, statement/verify/commit rollback cuts | closed |
| T-13-02-02 | Tampering | readiness/activation/occurrence | high | mitigate | Running readiness, ordered slots, sport-scoped activation, stable opportunities, host/native cases | closed |
| T-13-02-03 | Information Disclosure | planned occurrence detail | medium | mitigate | Exact tuple loaders, null-on-stale coverage, frozen DTOs, no raw SQL evidence | closed |
| T-13-02-04 | Tampering | backup/restore tracer | critical | mitigate | Versioned roundtrip, clean replacement, injected rollback, canonical parity, rebuild gating | closed |
| T-13-03-01 | Tampering | Running commands | high | mitigate | Strict parsers, revisions, canonical request hashes, exclusive repository transactions | closed |
| T-13-03-02 | Repudiation | revision/slot history | medium | mitigate | Stable roots and append-only revision/slot history with portable identity tests | closed |
| T-13-03-03 | Denial of Service | nested structured steps | medium | mitigate | Bounded types/counts/ordinals and validation before writes, with complete branch coverage | closed |
| T-13-04-01 | Spoofing | external activity identity | high | mitigate | Account-scoped identity plus awaited canonical Garmin digest and tamper-before-write rejection | closed |
| T-13-04-02 | Tampering | import/remove/restore commands | high | mitigate | Revision fences, immutable events, unique receipts, exclusive writes, remove/replay/restore native proof | closed |
| T-13-04-03 | Information Disclosure | diagnostics/tests | high | mitigate | Synthetic activity data and recursive evidence privacy rejection | closed |
| T-13-04-04 | Denial of Service | activity payload/chunks | medium | mitigate | Bounded envelope/chunk fields and portability preflight limits | closed |
| T-13-05-01 | Tampering | selected occurrence/start | critical | mitigate | Complete provenance tuple and revision revalidation within exclusive start transaction | closed |
| T-13-05-02 | Repudiation | completion reconciliation | high | mitigate | Immutable workout provenance, stable receipts, plan-switch/process-replay tests | closed |
| T-13-05-04 | Information Disclosure | runtime diagnostics | medium | mitigate | Typed codes/IDs/hashes only; privacy verifier rejects rows/routes/HR/SQL parameters | closed |
| T-13-06-01 | Tampering | match command | high | mitigate | Activity/opportunity/schedule/slot/relation revisions revalidated in one transaction | closed |
| T-13-06-02 | Repudiation | unmatch/reassign | high | mitigate | Append-only match events and immutable receipts; removal invalidation proven natively | closed |
| T-13-06-03 | Tampering | current match relation | medium | mitigate | One-to-one assertions, revision fences, deterministic rebuild and parity tests | closed |
| T-13-07-01 | Spoofing | portable identities | high | mitigate | Owner namespace, portable IDs, exact reference closure, no external-ID-only joins | closed |
| T-13-07-02 | Tampering | restore writer | critical | mitigate | Whole-graph preflight, one exclusive transaction, trigger restoration, read-back, fault rollback | closed |
| T-13-07-03 | Denial of Service | archive graph | high | mitigate | Cumulative row/byte/table/string/nesting/chunk limits before mutation | closed |
| T-13-07-04 | Information Disclosure | archive diagnostics | medium | mitigate | Evidence allowlist limits output to versions/counts/hashes/codes | closed |
| T-13-08-01 | Spoofing | merge identity mapping | high | mitigate | Owner-scoped portable mapping, closure checks, deterministic conflicts | closed |
| T-13-08-02 | Tampering | merge commit | critical | mitigate | One-use state-bound token, fingerprint recheck, exclusive commit, read-back, rollback matrix | closed |
| T-13-08-03 | Repudiation | replay/idempotency | high | mitigate | Immutable receipts/events and canonical duplicate/local-won no-op validation | closed |
| T-13-08-04 | Denial of Service | graph planning | medium | mitigate | Archive limits, bounded batches, bounded digest work | closed |
| T-13-09-01 | Tampering | legacy timing facts | high | mitigate | Canonical timing assertions across migration, restore, merge, relaunch | closed |
| T-13-09-02 | Denial of Service | recovered workout lifecycle | high | mitigate | Committed sets, draft/cursor/rest state preserved across recovery matrix | closed |
| T-13-09-03 | Repudiation | TIM-01 decision | high | mitigate | Approved `retire-playback` owner record and case-level retirement evidence | closed |
| T-13-10-01 | Tampering | TIM-01 runtime branch | high | mitigate | Exhaustive command/foreground/callback/relaunch/restore/merge retirement coverage | closed |
| T-13-10-02 | Spoofing | native artifact identity | high | mitigate | Committed source digest, retained/installed APK hash, package, device, exact registry binding | closed |
| T-13-10-03 | Repudiation | native/coverage results | high | mitigate | Missing/duplicate/skipped/failed cases rejected; 131 integrity-critical files at strict 100% | closed |
| T-13-10-04 | Information Disclosure | evidence artifacts | high | mitigate | Recursive privacy validator rejects personal/source/path/credential fields | closed |
| T-13-11-01 | Tampering | bodyweight commands | high | mitigate | Canonical runtime hash before write, integer/date/revision validation, receipts, exclusive commit | closed |
| T-13-11-02 | Information Disclosure | tests/diagnostics | high | mitigate | Synthetic bodyweight values and metadata-only evidence | closed |
| T-13-12-01 | Tampering | schedule/collision commands | high | mitigate | Exact identity/revision checks, selected-only mutation, unchanged other-sport pair regression | closed |
| T-13-12-02 | Denial of Service | Calendar query | medium | mitigate | Bounded indexed ranges, grouped counts, query-plan coverage | closed |
| T-13-12-03 | Information Disclosure | planned occurrence loader | medium | mitigate | Exact occurrence ID, null-on-stale, frozen DTO, no unrelated rows | closed |
| T-13-13-01 | Tampering | derivative rebuild | high | mitigate | Source digests, dependency order, freshness checks, guarded ready transition | closed |
| T-13-13-02 | Repudiation | relaunch/retry | medium | mitigate | Durable `rebuild_pending` and deterministic repeat/fault evidence | closed |
| T-13-14-01 | Spoofing | artifact identity | high | mitigate | HEAD/source digest, APK/installed bytes, package/device, exact case registry | closed |
| T-13-14-02 | Repudiation | evidence results | high | mitigate | Verifier rejects missing/duplicate/skipped/failed IDs and contradictory owner decisions | closed |
| T-13-14-03 | Information Disclosure | evidence payload | high | mitigate | Recursive privacy validation and synthetic native cases | closed |
| T-13-15-01 | Tampering | match/removal overlays | medium | mitigate | Immutable events and deterministic one-to-one effective state | closed |
| T-13-15-02 | Repudiation | Progress evidence | medium | mitigate | Source/time-basis identity and explicit sparse/stale codes | closed |
| T-13-15-03 | Denial of Service | read/rebuild queries | medium | mitigate | Bounded indexed/grouped reads and deterministic limited rebuilds | closed |
| T-13-16-01 | Tampering | completed-set edit | high | mitigate | Full metric/subject/revision validation and atomic correction/audit/receipt write | closed |
| T-13-16-02 | Repudiation | post-commit acknowledgment | high | mitigate | Durable receipt/read-back and lost-ack replay after reconstruction | closed |

*Status: all 50 plan-authored threats are closed; `threats_open: 0`.*

---

## Accepted Risks Log

No accepted risks.

---

## Verification Evidence

- Clean standard-depth code review across 113 phase files with zero findings.
- Nyquist audit: 38/38 tasks, DOM-01 through DOM-17, zero automated/manual gaps.
- Host verifier: 209 suites, 3,539 tests, typecheck and boundary lint green.
- Integrity coverage: 131 files at 100% statements, branches, functions, and lines.
- Real Expo SQLite: migrations-effects 14/14, portable-merge 14/14, multi-plan-running 13/13.
- Schema 35; retained and installed APK hashes match exactly.
- MAP-01 is `one-per-sport`; TIM-01 is `retire-playback`; legacy compatibility is `false`.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|---|---:|---:|---:|---|
| 2026-10-08 | 50 | 50 | 0 | TRAE CLI deterministic ASVS-L1 register audit |

---

## Sign-Off

- [x] All threats have a disposition.
- [x] No accepted risks require documentation.
- [x] `threats_open: 0` confirmed.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-10-08
