# Phase 18: Standalone Garmin account import - Research

**Reconciled:** 2026-10-07
**Confidence:** HIGH for selected architecture and local project boundaries; MEDIUM until installed-APK account proof succeeds
**Primary research:** .planning/research/v1.2/GARMIN-MOBILE-FEASIBILITY.md

## Locked result

The owner selected embedded Python on Android. Plan against Python 3.13, Chaquopy 17.0, python-garminconnect 0.3.17 at commit 218e72ca5459e014435fc2d94fd18bd601fa0c14, ARM64, and bounded activity summary/split/detail JSON. Do not reopen transport selection.

The exact curl_cffi wheel is curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl with SHA-256 4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92. The package is approximately 7.2 MB compressed before Python and transitive native libraries. No x86_64 Android artifact is selected.

The technical unknown is no longer product architecture. It is whether this exact dependency set packages and whether the owner's account/network accepts authenticated activity reads. The earliest native proof must answer that immediately after the committed harness.

## User decision coverage

| Decision | Planning consequence |
|---|---|
| D-18-01 | Exact ARM64 Python/Chaquopy/client/wheel pins in 18-01 |
| D-18-02 | Shared domain contract plus local module/platform adapter paths are fixed |
| D-18-03 | Typed login/MFA and encrypted dependency-injected token lifecycle in 18-02 |
| D-18-04 | Four allowlisted read methods; no generic bridge |
| D-18-05 | Canonical JSON and exact GarminSourceEnvelope identity fields |
| D-18-06 | Missing channels absent; elapsed/timer/moving separate; fidelity explicit |
| D-18-07 | Phase 18 calls Phase 13 prepareGarminImport and confirmGarminImportDate |
| D-18-08 | Foreground bounded sync, generation fence, 403/429/offline states |
| D-18-09 | Factual outdoor/treadmill detail and Lap/Time/Pace |
| D-18-10 | Stable explicit matching only |
| D-18-11 | Earliest real account proof and TECHNICAL_REVIEW_REQUIRED failure result |
| D-18-12 | No alternative transport/decoder/runtime-agent work in milestone |

## Source methods and semantics

| Needed data | Pinned client method | Required handling |
|---|---|---|
| Recent Running identifiers and summaries | get_activities(start, limit, activitytype, activitysubtype) | Bound pages/counts; reconcile changed older activities deliberately |
| One source summary | get_activity(activity_id) | Validate units and preserve duration basis |
| Source laps/splits | get_activity_splits(activity_id) | Distinguish source laps from generated splits; retain source order |
| Route/heart-rate chart data | get_activity_details(activity_id, maxchart=2000, maxpoly=4000) | Treat samples as sampled/downsampled; parse metricDescriptors instead of assuming columns |

The pinned client tests preserve sumDuration, sumElapsedDuration, and sumMovingDuration separately and omit missing channels. The domain contract must do the same. A sampled chart can support a visual route/HR series; it cannot support exact arbitrary-distance best-effort claims.

## Authentication findings

- Current python-garminconnect uses account login/MFA and DI token serialization. Older garth token guidance is obsolete for 0.3.17.
- login may return an MFA continuation; resume_login completes it without terminal input.
- dumps/loads are the intended persistence seam, but the app must inject encrypted storage and deliberately handle refresh persistence.
- Successful login does not prove activity access. Open issue #444 documents data-request 403 after authentication.
- JWT_WEB fallback alone is not a restart contract. Cold restart evidence must show a valid encrypted DI token record is loaded and refreshed.

## Responsibility map

| Capability | Owner |
|---|---|
| Contract declarations for GarminSourceEnvelope/port and shared import signatures | Phase 13 interface-first plan |
| Python/Chaquopy packaging and Kotlin worker/token store | modules/garmin-connect in Phase 18 |
| TypeScript port implementation and canonical normalization | src/platform/garmin in Phase 18 |
| Imported aggregates, revisions, receipts, match ledger, capacity, portability | Phase 13 domain/SQLite |
| Stable Running opportunity/slot/revision identities | Phase 17 |
| Connection/sync/detail/match presentation and contextual routes | Phase 18 |
| Running progress derived from accepted evidence | Phase 19 |

## Interface contract

src/domains/activities/garminActivitySourcePort.ts is created by the Phase 13 interface-first plan so Phase 13 compiles before Phase 18. Phase 18 implements it. The file exports GarminActivitySourcePort, GarminConnectionState, and GarminSourceEnvelope. Envelope keys are the exact snake_case source/persistence contract recorded in the ADR. fit_sha256 is forbidden/absent.

The port exposes connection state, login, MFA continuation, token restore, logout, bounded activity pages, and one typed activity/ splits/details read. The adapter does not expose raw Python objects, token bytes, URLs, arbitrary method names, upload, or delete.

## Canonicalization rules

canonicalGarminPayload.ts must:

1. accept only plain JSON containers, strings, booleans, null, and finite safe numbers;
2. reject excessive nesting, keys, arrays, strings, or total canonical bytes;
3. sort object keys by binary code-unit order and preserve array order;
4. omit absent optional fields and never invent numeric zero;
5. exclude attempt/fetch time, retry/error/UI state, tokens, and connection metadata;
6. independently hash each pre-normalization activity/splits/details component;
7. hash normalized canonical content together with normalization_version.

raw_component_sha256 is a three-key component map. normalized_json_sha256 is the immutable semantic payload digest. Both are lower-case SHA-256 hex.

## Failure semantics

| Failure | Required state | Source effect |
|---|---|---|
| Invalid credentials | authentication_failed | no token/source write |
| MFA required | mfa_required with opaque handle | no password persistence |
| MFA cancel/invalid | disconnected or recoverable mfa error | no token/source write |
| Encrypted token missing/corrupt | sign_in_required | prior activities retained |
| Refresh rotation interruption | prior valid encrypted record retained | no partial token record |
| 403 after login/read | data_access_denied; technical evidence includes issue-#444 class | no new activity, prior facts retained |
| 429 | rate_limited with validated retry-after when present | no spin/retry loop |
| Offline/timeout/5xx | offline/temporary_failure/partial_failure | committed earlier page facts retained |
| Malformed/oversized JSON | invalid_source_response | no partial activity commit |
| Logout during work | generation invalidated before token clear | late result discarded |
| Same external ID/digest | exact replay | existing receipt/activity returned |
| Same external ID/new digest | source_revision_review | accepted facts/matches unchanged |

## Package legitimacy audit

The authoritative audit is in .planning/research/v1.2/STACK.md. Direct artifacts are VERIFIED with exact source/version/hash. Transitive artifacts must be fully locked and automatically provenance/licence/hash checked in 18-01 before packaging. There is no human licence checkpoint and no alternate dependency selection.

## Planning sequence

1. 18-01 packages the exact runtime and validates the shared contract/harness schema.
2. 18-02 implements typed auth/MFA, encrypted DI restore/refresh, and one activity read.
3. 18-03 performs the earliest ARM64 installed-APK real-account proof.
4. 18-04 canonicalizes/normalizes JSON into GarminSourceEnvelope.
5. 18-05 bounds foreground pagination and sync orchestration.
6. 18-06 implements connection/login/MFA/logout state and UI.
7. 18-07 integrates the shared Phase 13 import/revision/date commands.
8. 18-08 renders factual detail.
9. 18-09 implements explicit matching.
10. 18-10 completes account/history/sync routes and error states.
11. 18-11 proves portability and secret exclusions.
12. 18-12 closes deterministic host/SQLite/component coverage and native evidence harness.
13. 18-13 runs token/logout/403/429 adversarial native proof.
14. 18-14 wires contextual entries and seals source coverage.

## Validation architecture

| Boundary | Required proof |
|---|---|
| Build/package | Exact plugin/Python/client/ABI/wheel/hash/notices; generated APK contains expected native/Python files |
| Kotlin/Python bridge | Fixed method list, typed DTOs, background serialization, cancellation/generation |
| Token store | encryption, atomic rotation, corrupt/old record, restart, backup exclusion, redaction |
| Canonicalization | key order, absent channels, non-finite/bounds rejection, stable hashes, fetch-time exclusion |
| Import | shared commands, exact replay, changed revision, date confirmation, rollback/receipt replay |
| Detail | outdoor/treadmill, no-route, optional HR/route/laps, duration basis, fidelity disclosure |
| Match | stable candidate identity, zero-write selection/back, explicit confirm, stale/replay/unmatch |
| Native proof | installed ARM64 APK, real login/MFA/read/restart; later 403/429/logout/process/rate/error cases |

All new integrity-critical domain, adapter, token, canonicalization, and command modules require exact branch coverage. Native proof is additive to deterministic tests, never a substitute.

## Security controls

- Keystore non-exportable key and AES-GCM token ciphertext.
- Secret fields never cross to React state, logs, evidence, SQLite, archive, or Drive.
- Fixed Kotlin/Python method dispatcher and exact DTO schemas.
- One serialized worker/client and connection generation fence.
- Per-page/component/count/nesting/string/time bounds.
- Opaque local route IDs and four-value origin allowlist.
- No arbitrary-distance exact claim from sampled data.
- Exact dependency commit/version/ABI/hash verification.

## Research sources

- .planning/research/v1.2/GARMIN-MOBILE-FEASIBILITY.md
- https://github.com/cyberjunky/python-garminconnect/tree/218e72ca5459e014435fc2d94fd18bd601fa0c14
- https://pypi.org/project/curl-cffi/0.15.0/
- https://chaquo.com/chaquopy/doc/current/android.html
- https://github.com/cyberjunky/python-garminconnect/issues/444
- Existing local module analogs modules/argon2-kdf and modules/network-classifier
- Existing credential/generation/evidence analogs src/platform/google/googleAuthAdapter.ts and Phase 12 testing scripts
