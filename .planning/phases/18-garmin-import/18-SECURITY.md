---
phase: 18-garmin-import
status: secured
head: 02f17adc08ba4780cbd69d2009613d253a2814d5
register_authored_at_plan_time: true
threats_total: 47
threats_closed: 47
threats_open: 0
open_non_blocking: 0
accepted_risks: 0
asvs_level: 1
block_on: high
dependency_advisories: 0
created: 2026-10-12
audited: 2026-10-12
---

# Phase 18 — Security

## SECURED

**Phase:** 18 — Garmin Import
**Exact HEAD:** `02f17adc08ba4780cbd69d2009613d253a2814d5`
**Threats Closed:** 47/47
**ASVS Level:** 1  
**Dependency advisories:** 0

All plan-time threats are `mitigate`; none are accepted or transferred. The
delta from `c55d3770` changes only CI dependency-policy enforcement and its
regression test. It changes no application, native, dependency-lock, or
threat-mitigation source. The prior full source audit therefore remains valid,
and this audit re-ran the zero-advisory policy and the new CI-order regression.

### Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|---|---|---:|---|---|
| T-18-01-01 | Tampering | high | mitigate | `garmin-python-lock.json`; `verify-garmin-python-lock.mjs` exact metadata/hash checks |
| T-18-01-02 | Elevation of Privilege | critical | mitigate | `garmin_bridge.py` fixed dispatcher/argument validation; `GarminClientWorker.kt` sanitizer |
| T-18-01-03 | Denial of Service | medium | mitigate | `GarminClientWorker.kt` serialized worker and bounded DTO sanitizer |
| T-18-SC | Tampering | high | mitigate | `withGarminConnectModule.ts` pre-build lock/materialization gate |
| T-18-02-01 | Information Disclosure | critical | mitigate | `GarminTokenStore.kt` Keystore AES-GCM; no-backup path and native/TS redaction |
| T-18-02-02 | Tampering | high | mitigate | `GarminTokenStore.kt` verified fsync/atomic replacement/tombstones |
| T-18-02-03 | Tampering | high | mitigate | `GarminClientWorker.kt` and `garminActivityAdapter.ts` generation fences |
| T-18-02-04 | Elevation of Privilege | critical | mitigate | Typed native driver and fixed Python operation allowlist |
| T-18-03-01 | Information Disclosure | critical | mitigate | Guarded installed-app credential route and recursive proof privacy scan |
| T-18-03-02 | Repudiation | high | mitigate | `proof-verifier-evidence.mjs` recomputes source/lock/APK/signature/device identities |
| T-18-03-03 | Tampering | high | mitigate | Ordered proof verifier; review-required is distinct from PASS; write-once seal |
| T-18-04-01 | Tampering | high | mitigate | `canonicalGarminPayload.ts` and `normalizeGarminActivity.ts` canonical/versioned hashes |
| T-18-04-02 | Denial of Service | high | mitigate | Depth/node/key/array/string/byte limits before canonical allocation |
| T-18-04-03 | Tampering | high | mitigate | Explicit channel fidelity and sampled exact-effort denial |
| T-18-05-01 | Denial of Service | high | mitigate | `garminSyncCoordinator.ts` bounded serial pagination and cancellation |
| T-18-05-02 | Tampering | high | mitigate | Complete summary/splits/details triple required before normalized import |
| T-18-05-03 | Tampering | high | mitigate | Generation checked before normalization, import, and writer transaction |
| T-18-05-04 | Repudiation | medium | mitigate | Progress/counts advance only from committed import results |
| T-18-06-01 | Information Disclosure | critical | mitigate | Controller keeps password/MFA/handle in refs and clears them in `finally` |
| T-18-06-02 | Tampering | high | mitigate | UI operation latches and connection/sync generation fences |
| T-18-06-03 | Repudiation | high | mitigate | UI derives success/counts only from coordinator receipts/results |
| T-18-07-01 | Tampering | high | mitigate | `importedActivityRepository.ts` reparses, canonicalizes, and rehashes staged envelope inside `kernel.write` |
| T-18-07-02 | Repudiation | high | mitigate | Immutable receipt lookup precedes authoritative committed read-back |
| T-18-07-03 | Tampering | high | mitigate | Explicit date provenance validation and revision-fenced immutable records |
| T-18-08-01 | Tampering | high | mitigate | `activityDetails.ts` requires schema-valid accepted aggregate/digest match |
| T-18-08-02 | Spoofing | high | mitigate | Local opaque-ID route parser rejects provider/external identity fallback |
| T-18-08-03 | Information Disclosure | medium | mitigate | Detail read model exposes approved accepted facts only |
| T-18-09-01 | Tampering | high | mitigate | Match writer rechecks payload/opportunity/schedule/day/slot/session/relation revisions in one transaction |
| T-18-09-02 | Repudiation | high | mitigate | Canonical request receipts and immutable match event ledger |
| T-18-09-03 | Elevation of Privilege | medium | mitigate | Candidate selection is local; only explicit Confirm reaches writer |
| T-18-10-01 | Spoofing | high | mitigate | Closed four-origin union and opaque local activity IDs |
| T-18-10-02 | Elevation of Privilege | high | mitigate | Typed runtime facade; boundary gate rejects route/UI SQL/platform imports |
| T-18-10-03 | Repudiation | high | mitigate | Source-backed committed history and revision-review state |
| T-18-11-01 | Spoofing | high | mitigate | Owner/account-scoped source identity and portable conflict checks |
| T-18-11-02 | Tampering | high | mitigate | Canonical source-graph merge/remap/reference/capacity validation |
| T-18-11-03 | Information Disclosure | critical | mitigate | Android legacy/cloud/device-transfer exclusions for session and response staging |
| T-18-12-01 | Elevation of Privilege | high | mitigate | Exact profile/suite/confirmation guards and isolated native routes |
| T-18-12-02 | Tampering | high | mitigate | Acceptance verifier recomputes current identity and independently executes owner verifiers |
| T-18-12-03 | Information Disclosure | critical | mitigate | Recursive structured/text privacy scan before evidence acceptance |
| T-18-12-04 | Repudiation | high | mitigate | Native rows require exact owner artifacts/current identity; mocks cannot close them |
| T-18-13-01 | Tampering | high | mitigate | Logout increments generation before clear; stale results reject before import |
| T-18-13-02 | Denial of Service | high | mitigate | Distinct bounded provider failures, retry clamp, and no automatic retry loop |
| T-18-13-03 | Information Disclosure | critical | mitigate | Native report/log privacy checks before write and again at verification |
| T-18-13-04 | Repudiation | high | mitigate | Expected-injected versus unexpected provenance plus current-identity validation |
| T-18-14-01 | Spoofing | high | mitigate | Allowlisted origins, opaque local identity, bounded Calendar token |
| T-18-14-02 | Elevation of Privilege | high | mitigate | Garmin routes live only in root stack; tab roots remain fixed |
| T-18-14-03 | Tampering | high | mitigate | Deterministic 14-plan requirement/decision/exclusion source-audit gate |

### Delta Verification

- `.github/workflows/pr.yml` runs `npm run audit:dependencies` immediately after
  `npm ci` in the PR bootstrap job.
- `scripts/run-phase18-python-coverage.test.mjs` asserts that exact ordering.
- `npm run audit:dependencies` passed at this HEAD: **no npm advisories reported**.
- `node --test scripts/run-phase18-python-coverage.test.mjs` passed: **5/5**.

### Deferred Phase 20 Evidence

Real-account/device evidence remains intentionally deferred to Phase 20. Its
absence is not an open host implementation threat: the proof, adversarial, and
aggregate acceptance verifiers require explicit Phase 20 authority and fresh,
one-APK identity binding before any native PASS can be recorded.

### Unregistered Flags

None. All Phase 18 summary threat flags map to the declared register.

## Security Audit Trail

| Audit date | Exact HEAD | Threats total | Closed | Blocking open | npm advisories | Result |
|---|---|---:|---:|---:|---:|---|
| 2026-10-12 | `02f17adc08ba4780cbd69d2009613d253a2814d5` | 47 | 47 | 0 | 0 | SECURED |

**threats_open:** 0
