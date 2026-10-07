# Phase 18 Validation Strategy

**Reconciled:** 2026-10-07

## Nyquist rule

Every behavior-adding task creates or updates its focused automated test before implementation. Host tests prove deterministic behavior; installed-APK proof is required for Python/native packaging, real account authentication, encrypted token restart, and later adversarial native cases.

## Wave gates

| After plan | Required gate |
|---:|---|
| 18-01 | Gradle/module/plugin/unit checks verify exact Python/client/ABI/wheel/hash/contract schema |
| 18-02 | Kotlin/Python/TypeScript tests prove login/MFA/token rotation/restore and one allowlisted read with injected drivers |
| 18-03 | Installed ARM64 APK real-account login/MFA/read/restart proof or TECHNICAL_REVIEW_REQUIRED |
| 18-04 | Canonicalization/normalization exact branch coverage and golden envelope hashes |
| 18-05 | Bounded pagination/generation/failure sync matrix |
| 18-06 | Connection/login/MFA/logout component/controller matrix |
| 18-07 | Real SQLite shared import/revision/date/receipt/rollback matrix |
| 18-08 | Outdoor/treadmill/lap/fidelity/detail component matrix |
| 18-09 | Stable candidate/confirm/zero-write/stale/replay match matrix |
| 18-10 | Contextual Garmin root/history/sync/error/appearance route matrix |
| 18-11 | Backup/restore/merge/dirty-generation/Android exclusion matrix |
| 18-12 | Full Phase 18 host suites, exact integrity coverage, native harness/verifier |
| 18-13 | Token/logout/403/429/offline/malformed/partial/stale-generation native adversarial proof |
| 18-14 | Contextual origins, four-root invariant, Calendar producer contract, source audit |

## Deterministic commands

- npm run typecheck
- npm run lint
- npm run check:boundaries
- npm run test:unit -- --runInBand
- npm run test:components -- --runInBand
- npm run test:sqlite:host -- --runInBand
- npm run test:integration -- --runInBand
- npm run test:coverage -- --runInBand
- node --test scripts/phase18-*.test.mjs

Plans use narrower file-qualified forms of these commands so each task completes in under 60 seconds where possible. Full suites are wave/phase gates.

## Native proof contract

Evidence binds source commit/tree, Garmin Python lock digest, APK SHA-256/signature/package/profile, ARM64 device hash, ordered case IDs, report hashes, and pass/failure classifications. It excludes email, password, MFA code, token/ciphertext, account namespace, external activity ID, raw JSON, coordinates, heart rate, filenames, and device serial.

Earliest proof cases:

1. packaged runtime starts without external Python/terminal/Metro/server;
2. login and MFA when required;
3. one get_activities page and one activity read;
4. process stop/restart and encrypted DI token restore;
5. forced refresh persists rotated token atomically;
6. no forbidden fields in logcat/evidence/backup locations.

Adversarial cases:

- local logout clears tokens, invalidates generation, retains history;
- late result after logout/reconnect is discarded;
- injected issue-#444-style 403 after login maps to data_access_denied;
- injected 429 maps to rate_limited and does not spin;
- offline, timeout, 5xx, malformed/oversized JSON, missing channels, partial page, and token-rotation interruption preserve prior facts;
- same response replay is idempotent; changed canonical digest stages review;
- failure evidence is accepted as TECHNICAL_REVIEW_REQUIRED only, never as feature pass.

## Multi-source coverage audit

| Source | Item | Plans | Status |
|---|---|---|---|
| GOAL | Standalone account sync, factual detail, explicit matching | 18-01..18-14 | COVERED |
| REQ | GAR-01..GAR-16 | 18-COVERAGE.md mapping | COVERED |
| RESEARCH | Exact ARM64 Python/Chaquopy/client/wheel stack | 18-01..18-03 | COVERED |
| RESEARCH | Bounded JSON and sampled-data honesty | 18-04, 18-05, 18-08 | COVERED |
| RESEARCH | Encrypted DI token restore/refresh | 18-02, 18-03, 18-13 | COVERED |
| CONTEXT | D-18-01..D-18-12 | cited throughout plans | COVERED |

Deferred alternatives listed in D-18-12 are exclusions, not gaps.

## Reachability

- Garmin root is reachable from Workout and Running plan; Calendar receives a typed detail producer contract.
- Every source read reaches normalizeGarminActivity, GarminSourceEnvelope, shared import commands, committed local activity, detail, and optional explicit match.
- Light/Dark/System controls are consumed by all three Garmin routes.
- Token state has a producer, encrypted consumer, restart path, logout path, and explicit backup exclusion.
- Every planned artifact path is a concrete repository path; no conceptual file path is used.

## Threat verification

- Secret redaction tests scan structured logs and evidence objects.
- Bridge allowlist tests reject method/URL/eval/upload/delete requests.
- Dependency tests compare commit/version/ABI/wheel filename/SHA-256.
- Generation tests cover logout/reconnect races.
- Resource tests cover page/component/count/nesting/string/time limits.
- Fidelity tests prevent sampled data from producing exact best efforts.
- SQLite tests prove zero partial facts and receipt replay.
