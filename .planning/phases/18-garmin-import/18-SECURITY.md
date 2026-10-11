---
phase: 18-garmin-import
status: open_threats
register_authored_at_plan_time: true
threats_total: 47
threats_closed: 43
threats_open: 4
open_non_blocking: 0
accepted_risks: 0
asvs_level: 1
block_on: high
created: 2026-10-12
audited: 2026-10-12
---

# Phase 18 — Security

## OPEN_THREATS

**Phase:** 18 — Garmin Import  
**Closed:** 43/47 | **Open:** 4/47  
**ASVS Level:** 1  
**Blocking threshold:** high

All 47 plan-time threats have an explicit `mitigate` disposition. No threat was
accepted or transferred. The missing Phase 20 native execution is recorded as
pending evidence and is not itself classified as an implementation threat. Four
high-severity threats remain open because the implemented transaction/evidence
boundaries do not fully enforce their declared mitigations and can admit a false
or insufficiently bound result.

## Trust Boundaries

| Boundary | Data crossing | Required property |
|---|---|---|
| Build inputs → APK | Python source, transitive artifacts, ABI, Gradle/CNG output | Exact reviewed artifacts and fail-closed pre-build verification |
| TypeScript → Kotlin → Python | Credentials, MFA, typed operations, provider responses | Fixed authority, bounded DTOs, redaction, serialization |
| Python session → device storage | DI tokens and account namespace | Keystore confidentiality/integrity, atomic rotation/deletion, backup exclusion |
| Provider responses → canonical envelope | Activity, split, detail, route, and chart data | Strict bounds, canonical hashes, explicit fidelity |
| Canonical envelope → SQLite | Identity, date provenance, revisions, receipts | Validation and revalidation inside one authoritative transaction |
| UI/routes → runtime | Origins, local IDs, explicit user confirmation | Allowlists, opaque identities, no platform/SQL authority |
| Archive → local source graph | Owner-scoped facts, revisions, matches, receipts | Schema/reference/capacity validation, ID remap, canonical verification |
| Device reports → retained evidence | Source/APK/device/report identities and privacy results | Fresh-byte hashing, independent current-identity checks, no mock relabeling |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|---|---|---|---|---|---|---|
| T-18-01-01 | Tampering | Python dependency lock | high | mitigate | Exact runtime/package metadata in `modules/garmin-connect/python/garmin-python-lock.json:2`; package-set, commit, ABI, filename, and hash validation in `scripts/verify-garmin-python-lock.mjs:12` | closed |
| T-18-01-02 | Elevation of Privilege | native/Python dispatcher | critical | mitigate | Fixed Expo methods in `GarminConnectModule.kt:101`; Python operation allowlist and exact argument sets in `garmin_bridge.py:22` and `garmin_bridge.py:72` | closed |
| T-18-01-03 | Denial of Service | native worker | medium | mitigate | Background coroutine dispatch in `GarminConnectModule.kt:101`; serialized worker and bounded JSON in `GarminClientWorker.kt:74` and `GarminClientWorker.kt:314` | closed |
| T-18-SC | Tampering | pip/Gradle package inputs | high | mitigate | Exact local artifact-set/hash verification in `verify-garmin-python-lock.mjs:65`; `--no-deps` local installs and pre-build dependency in `withGarminConnectModule.ts:63` | closed |
| T-18-02-01 | Information Disclosure | credentials/tokens | critical | mitigate | Provider logging disabled and result keys bounded in `garmin_bridge.py:39`; credentials removed in `finally` at `garmin_bridge.py:258`; AES-GCM no-backup storage in `GarminTokenStore.kt:123` and `GarminConnectModule.kt:169` | closed |
| T-18-02-02 | Tampering | token rotation | high | mitigate | Versioned AAD record, decrypt verification, fsync, rename, and old-record-preserving replacement in `GarminTokenStore.kt:23`, `GarminTokenStore.kt:56`, and `GarminTokenStore.kt:181` | closed |
| T-18-02-03 | Tampering | stale client result | high | mitigate | Generation checks at native and TypeScript boundaries in `GarminClientWorker.kt:221`, `garminActivityAdapter.ts:225`, and `garminActivityAdapter.ts:321` | closed |
| T-18-02-04 | Elevation of Privilege | bridge methods | critical | mitigate | Exact typed Expo records/methods in `GarminConnectModule.kt:13` and `GarminConnectModule.kt:98`; exact Python argument schemas in `garmin_bridge.py:72` | closed |
| T-18-03-01 | Information Disclosure | attended auth/evidence | critical | mitigate | Dev-test-only route gate in `phase18GarminProof.ts:78`; installed-app credential form and redirect in `app/__phase18-garmin-proof.tsx:182`; process-log and backup-path privacy checks in `run-phase18-garmin-proof.mjs:536` | closed |
| T-18-03-02 | Repudiation | proof identity | high | mitigate | Standalone proof verifier recomputes source, lock, retained/installed APK, signature, device, and raw-report identities in `verify-phase18-garmin-proof.mjs:350` and `verify-phase18-garmin-proof.mjs:382` | closed |
| T-18-03-03 | Tampering | false success | high | mitigate | Exact ordered PASS/review-required validation in `verify-phase18-garmin-proof.mjs:161`; sealing requires raw report plus explicit Phase 20 authority in `verify-phase18-garmin-proof.mjs:264` and `verify-phase18-garmin-proof.mjs:396` | closed |
| T-18-04-01 | Tampering | canonical identity | high | mitigate | Strict versioned schemas and complete-component canonical hashes in `importContracts.ts:14`, `normalizeGarminActivity.ts:277`, and `normalizeGarminActivity.ts:322` | closed |
| T-18-04-02 | Denial of Service | response shapes | high | mitigate | Depth/node/key/array/string/byte limits enforced before canonical allocation in `canonicalGarminPayload.ts:3` and `canonicalGarminPayload.ts:45` | closed |
| T-18-04-03 | Tampering | sampled metric claims | high | mitigate | Per-channel sampled/source fidelity and exact-effort gate in `normalizeGarminActivity.ts:328` and `normalizeGarminActivity.ts:359` | closed |
| T-18-05-01 | Denial of Service | pagination/components | high | mitigate | Hard page/activity/cursor/retry bounds and one-operation latch in `garminSyncContracts.ts:7` and `garminSyncCoordinator.ts:242` | closed |
| T-18-05-02 | Tampering | partial activity | high | mitigate | Activity, splits, and details are all read and generation-checked before one mapper/envelope parse in `garminActivityAdapter.ts:321` | closed |
| T-18-05-03 | Tampering | stale generation | high | mitigate | Connection fence before reads, normalization/import, and shared commit in `garminSyncCoordinator.ts:197`, `garminSyncCoordinator.ts:290`, and `garminSyncCoordinator.ts:301` | closed |
| T-18-05-04 | Repudiation | partial success | medium | mitigate | Counts advance only from typed import results and committed outcomes in `garminSyncCoordinator.ts:306`; partial/failure is explicitly reduced at `garminSyncCoordinator.ts:158` | closed |
| T-18-06-01 | Information Disclosure | credential/MFA UI | critical | mitigate | Password/MFA remain in refs and are cleared on success, failure, cancel, and unmount in `useGarminConnectionController.ts:205`, `useGarminConnectionController.ts:310`, and `useGarminConnectionController.ts:359` | closed |
| T-18-06-02 | Tampering | duplicate/late UI actions | high | mitigate | Separate synchronous latches and generations fence connection and sync actions in `useGarminConnectionController.ts:208`, `useGarminConnectionController.ts:310`, and `useGarminConnectionController.ts:439` | closed |
| T-18-06-03 | Repudiation | sync success | high | mitigate | UI success/counts derive from coordinator import results and durable summary persistence in `useGarminConnectionController.ts:461` and `useGarminConnectionController.ts:468` | closed |
| T-18-07-01 | Tampering | envelope import | high | mitigate | Shared pre-transaction validation exists in `importCommands.ts:57`, and identity/revision checks exist in `importedActivityRepository.ts:186`; however the parsed nested envelope/digest/capacity is not revalidated inside the write transaction before rows are inserted at `importedActivityRepository.ts:282` | **open — blocking** |
| T-18-07-02 | Repudiation | acknowledgement/replay | high | mitigate | Request/content receipt lookup and authoritative replay read-back occur inside the writer at `importedActivityRepository.ts:187`; immutable receipt is inserted at `importedActivityRepository.ts:293` | closed |
| T-18-07-03 | Tampering | historical date/revision | high | mitigate | Explicit confirmed date provenance validation in `importCommands.ts:73`; immutable proposed payload/hash/receipt rows and revision-fenced decision in `importedActivityRepository.ts:84` and `importedActivityRepository.ts:232` | closed |
| T-18-08-01 | Tampering | detail projection | high | mitigate | Accepted digest must match strict aggregate schema; source presence, pace basis, route bounds, and fidelity gate projection in `activityDetails.ts:8`, `activityDetails.ts:130`, and `activityDetails.ts:227` | closed |
| T-18-08-02 | Spoofing | route identity | high | mitigate | Opaque local-ID grammar and no external-ID fallback in `activityDetails.ts:84` and `app/garmin/activity/[activityId].tsx:43` | closed |
| T-18-08-03 | Information Disclosure | raw provider facts | medium | mitigate | Public detail DTO contains approved display fields only and projection parses accepted normalized aggregate fields in `activityDetails.ts:61` and `activityDetails.ts:227` | closed |
| T-18-09-01 | Tampering | confirmation envelope | high | mitigate | Full payload/opportunity/schedule/day/slot/session/relation revisions are re-read and compared inside one write in `runningActivityMatchRepository.ts:216` | closed |
| T-18-09-02 | Repudiation | match changes | high | mitigate | Canonical request hash construction in `activityMatchCommands.ts:193`; immutable event and receipt writes in `runningActivityMatchRepository.ts:265` | closed |
| T-18-09-03 | Elevation of Privilege | selection UI | medium | mitigate | Selection remains component-local; only explicit Confirm invokes `onConfirm` in `ActivityMatchScreen.tsx:88` and `ActivityMatchScreen.tsx:128` | closed |
| T-18-10-01 | Spoofing | route origin/activity | high | mitigate | Four-value origin parser in `garminImportRuntime.tsx:49`; local-ID-only detail/match routes in `activityDetails.ts:84` and `app/garmin/match/[activityId].tsx:19` | closed |
| T-18-10-02 | Elevation of Privilege | screen boundaries | high | mitigate | Route consumes typed runtime facade in `app/garmin/index.tsx:31`; boundary checker bans route platform/SQL imports and route SQL execution in `check-boundaries.mjs:103` | closed |
| T-18-10-03 | Repudiation | displayed sync state | high | mitigate | Source-backed history plus durable last-success reads/writes in `garminImportRuntime.tsx:188` and committed-result UI mapping in `useGarminConnectionController.ts:461` | closed |
| T-18-11-01 | Spoofing | cross-owner external identity | high | mitigate | Owner mismatch fails closed and source identity includes kind, account namespace, and external ID in `mergePlan.ts:1686` and `mergePlan.ts:1866` | closed |
| T-18-11-02 | Tampering | archive source graph | high | mitigate | Per-identity dependency closure/remap and canonical comparison in `mergePlan.ts:1654`, `mergePlan.ts:1698`, and `mergePlan.ts:1776`; writer rejects incomplete/conflicting source aggregates in `logicalMergeRepository.ts:561` | closed |
| T-18-11-03 | Information Disclosure | token/staging backup | critical | mitigate | Token store uses `noBackupFilesDir` in `GarminConnectModule.kt:169`; generated legacy/cloud/device-transfer rules exclude Garmin session and response staging paths in `withAndroidBackupRules.ts:10` and `withAndroidBackupRules.ts:28` | closed |
| T-18-12-01 | Elevation of Privilege | guarded route | high | mitigate | Production disables native contracts in `app.config.ts:5`; exact profile/suite/confirmation guards in `phase18GarminAcceptance.ts:41`, `phase18GarminProof.ts:78`, and `phase18GarminAdversarial.ts:78` | closed |
| T-18-12-02 | Tampering | evidence manifests | high | mitigate | Proof verification is current-bound, but the adversarial CLI defines a current-identity validator at `verify-phase18-garmin-adversarial.mjs:246` and never calls it in its executable path at `verify-phase18-garmin-adversarial.mjs:286`; aggregate acceptance substitutes owner-evidence hashes as current values at `verify-phase18-garmin-acceptance.mjs:337` | **open — blocking** |
| T-18-12-03 | Information Disclosure | evidence/benchmarks | critical | mitigate | Recursive forbidden-key/value scans in `verify-phase18-garmin-acceptance.mjs:67`, `verify-phase18-garmin-adversarial.mjs:97`, and `benchmark-phase18-garmin.mjs:49`; source-owned benchmark budgets at `benchmark-phase18-garmin.mjs:105` | closed |
| T-18-12-04 | Repudiation | live-vs-mock closure | high | mitigate | Native prerequisite rows exist, but the aggregate verifier does not execute the owner verifiers against their raw/native/privacy artifacts and instead uses self-reported owner hashes at `verify-phase18-garmin-acceptance.mjs:332`; synthetic `native-exact-artifact` evidence is accepted by the adversarial CLI test at `phase18-garmin-adversarial.test.mjs:409` | **open — blocking** |
| T-18-13-01 | Tampering | stale result after logout | high | mitigate | Serialized local logout, generation advancement, adapter disconnect reconciliation, and pre-import generation fences in `GarminClientWorker.kt:155`, `garminActivityAdapter.ts:294`, and `garminSyncCoordinator.ts:290` | closed |
| T-18-13-02 | Denial of Service | 403/429/retry | high | mitigate | Distinct bounded terminal codes in `garmin_bridge.py:443` and `garminSyncCoordinator.ts:101`; exact call/retry limits in `verify-phase18-garmin-adversarial.mjs:24` and `verify-phase18-garmin-adversarial.mjs:126` | closed |
| T-18-13-03 | Information Disclosure | native reports/logcat | critical | mitigate | Native record and collected logcat pass recursive forbidden-field checks before write in `run-phase18-garmin-adversarial.mjs:69` and `run-phase18-garmin-adversarial.mjs:250`; final evidence is scanned again in `verify-phase18-garmin-adversarial.mjs:97` | closed |
| T-18-13-04 | Repudiation | injected vs unexpected failure | high | mitigate | Ordered status/provenance checks exist at `verify-phase18-garmin-adversarial.mjs:126`, but the executable verifier at `verify-phase18-garmin-adversarial.mjs:286` can seal a caller-authored all-PASS report without invoking current-identity/native-origin verification; the synthetic PASS path is exercised at `phase18-garmin-adversarial.test.mjs:409` | **open — blocking** |
| T-18-14-01 | Spoofing | route origin/local identity | high | mitigate | Origin allowlist in `garminImportRuntime.tsx:49`; opaque local identity and bounded Calendar token in `app/garmin/activity/[activityId].tsx:23` and `app/garmin/activity/[activityId].tsx:43` | closed |
| T-18-14-02 | Elevation of Privilege | root navigation | high | mitigate | Garmin screens are registered only on the root stack in `app/_layout.tsx:137`; tab list remains exactly Workout/Calendar/Library/Progress in `app/(tabs)/_layout.tsx:183` | closed |
| T-18-14-03 | Tampering | plan/source drift | high | mitigate | Deterministic 14-plan/GAR/decision/source-fact/exclusion verification and negative-family checks in `verify-phase18-plan-coverage.mjs:16`, `verify-phase18-plan-coverage.mjs:74`, and `verify-phase18-plan-coverage.mjs:211` | closed |

## Open (blocking — severity ≥ high)

| Threat ID | Severity | Mitigation expected | Files searched / gap |
|---|---|---|---|
| T-18-07-01 | high | Revalidate the canonical envelope, digest, identity/revision, and capacity inside the authoritative write transaction. | `src/domains/activities/importCommands.ts`; `src/bootstrap/garminImportRuntime.tsx`; `src/platform/sqlite/repositories/importedActivityRepository.ts`; validation is completed before `kernel.write`, while the transaction consumes the mutable nested `staged.envelope` without reparsing or rehashing it. |
| T-18-12-02 | high | Every evidence verifier must recompute current source/lock/APK/signature/installed-device/report identities before accepting or sealing. | `scripts/run-phase18-garmin-{proof,adversarial,acceptance}.mjs`; `scripts/verify-phase18-garmin-{proof,adversarial,acceptance}.mjs`; adversarial current-identity validation is dead code in the CLI path, and aggregate owner-artifact validation uses self-reported hashes. |
| T-18-12-04 | high | Host/mock output must be unable to satisfy either required native artifact, including through the aggregate verifier. | `src/testing/phase18GarminAdversarial.ts`; `scripts/verify-phase18-garmin-adversarial.mjs`; `scripts/verify-phase18-garmin-acceptance.mjs`; `scripts/phase18-garmin-adversarial.test.mjs`; a synthetically constructed report labeled `native-exact-artifact` is accepted and sealable. |
| T-18-13-04 | high | Provenance must be derived from current installed execution; unexpected failures must remain review-required and must not be relabelable by artifact authors. | `app/__phase18-garmin-adversarial.tsx`; `src/testing/phase18GarminAdversarial.ts`; `scripts/run-phase18-garmin-adversarial.mjs`; `scripts/verify-phase18-garmin-adversarial.mjs`; the verifier validates self-asserted provenance fields but does not establish their origin. |

## Open (non-blocking — severity below high)

None.

Only the four blocking-open threats above count toward `threats_open`.

## Pending Phase 20 Evidence (not implementation threats)

The following owner-authorized native artifacts are absent and remain pending the
single Phase 20 native checkpoint:

- `artifacts/native/phase18-garmin-proof/final-evidence.json`
- `artifacts/native/phase18-garmin-adversarial/final-evidence.json`
- `artifacts/native/phase18-garmin-acceptance/final-evidence.json`

Their absence is not counted as an open implementation threat. The runners are
inert without paired `--execute` and `--phase20-native-checkpoint` authority, and
no APK build/install, device access, live Garmin request, or native evidence run
was performed by this audit. The evidence verifier gaps above are blocking
because they can permit false closure when Phase 20 does run.

## Unregistered Flags

None. Every `## Threat Flags` section present in the Phase 18 summaries reports
no unregistered surface; summaries without that heading declare no additional
flag elsewhere in the phase threat register.

## Accepted Risks Log

No accepted risks. All 47 plan-time dispositions are `mitigate`.

## Verification Performed

- Static verification of every plan-time threat against the cited implementation boundary.
- 54 focused Node evidence/lock/manifest/benchmark/coverage tests passed.
- 201 focused Jest tests passed across transport, token-adapter, canonicalization,
  sync, import repository, match repository, controller, and backup-rule files.
- 12 focused Python bridge tests passed.
- No global suite, coverage suite, APK build, device/native action, live account
  action, implementation edit, release, commit, or push was performed.

Passing tests do not close the four findings: the adversarial test suite itself
demonstrates acceptance and sealing of a synthetic all-PASS evidence object, and
the repository tests do not place envelope capacity/digest validation inside the
write transaction.

## Security Audit Trail

| Audit date | Threats total | Closed | Blocking open | Non-blocking open | Run by |
|---|---:|---:|---:|---:|---|
| 2026-10-12 | 47 | 43 | 4 | 0 | TRAE security auditor + orchestrator reconciliation |

## Sign-Off

- [x] All threats have an exact disposition.
- [x] All SUMMARY threat flags were incorporated.
- [x] No accepted or transferred risk was inferred.
- [x] Missing authorized Phase 20 execution is recorded as pending evidence, not an implementation threat.
- [ ] `threats_open: 0` confirmed.
- [ ] `status: verified` set.

**Approval:** blocked pending remediation and re-audit

**threats_open:** 4
