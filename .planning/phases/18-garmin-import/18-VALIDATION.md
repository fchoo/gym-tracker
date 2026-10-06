---
phase: 18
slug: garmin-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
requirements: [GAR-01, GAR-02, GAR-03, GAR-04, GAR-05, GAR-06, GAR-07, GAR-08, GAR-09, GAR-10, GAR-11, GAR-12, GAR-13, GAR-14, GAR-15, GAR-16]
automated_gaps: 0
manual_only: 4
conditional_external: [GAR-04, GAR-05, GAR-06, GAR-07]
---

# Phase 18 — Validation Strategy

> Execution-time Nyquist contract for local original-FIT import, factual detail, identity/revision recovery and explicit Running matching. No dependency installation, test, build, native run, FIT import, owner decision, provider access, release or evidence claim was completed during planning.

## Closure Rules

- GAR-01 is split by producer/consumer ownership: Phase 18 closes Workout and Running-plan entry wiring plus the real activity route's validated `origin=calendar`/opaque-ID/return-token contract; Phase 16 Plan 16-07 depends on 18-08/18-14 and owns actual Calendar activation, Back, spatial/scroll/focus restoration and zero-mutation closure.
- GAR-02–03 and GAR-08–16 close through the local host/native task map below, subject to the explicit cross-phase GAR-01 consumer dependency above.
- GAR-04–07 are `CONDITIONAL_EXTERNAL`. Deterministic presentation tests are required, but they do not close live consent/sync/revoke behavior. Closure requires both blocking gates in Plan 18-13 plus a separately authorized architecture/implementation plan.
- Local FIT success, screenshots, a mocked capability, simulated consent and an imported Garmin-origin file cannot change GAR-04–07 to passed.
- The broker is absent from Phase 18 implementation/evidence. Its absence is a required result while the gate is closed.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Jest 29.7 projects (`unit`, `components`, `sqlite-host`, `integration`), React Native Testing Library 14.0.1, real SQLite, Maestro 2.8.0 and release Hermes/native resource collection |
| **Config files** | `jest.config.js`, `scripts/run-coverage-gate.mjs`, `maestro/phase18/garmin-import.yaml` |
| **Quick decoder command** | `npm run test:unit -- --runInBand src/platform/files/expoFitFilePort.test.ts src/platform/garmin/fitDecoderAdapter.test.ts src/domains/activities/normalizeFitActivity.test.ts` |
| **Quick transaction command** | `npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts tests/integration/running-activity-match.test.ts` |
| **Quick UI command** | `npm run test:components -- --runInBand src/ui/__tests__/GarminSyncScreen.test.tsx src/ui/__tests__/ActivityImportScreen.test.tsx src/ui/__tests__/ImportedActivityDetailScreen.test.tsx src/ui/__tests__/ActivityMatchScreen.test.tsx` |
| **Portability command** | `npm run test:integration -- --runInBand tests/integration/garmin-import-portability.test.ts tests/integration/automatic-drive-backup.test.ts` |
| **Full host command** | `npm run typecheck && npm run lint && npm run check:boundaries && npm run test:all -- --runInBand && npm run test:coverage -- --runInBand` |
| **Decoder qualification** | `npm run android:devtest:fresh -- --suite phase18-decoder && node scripts/run-phase18-fit-decoder-qualification.mjs --manifest artifacts/native/phase18-decoder/build.json --evidence artifacts/native/phase18-decoder/qualification.json && node scripts/verify-phase18-fit-decoder-qualification.mjs --manifest artifacts/native/phase18-decoder/build.json --evidence artifacts/native/phase18-decoder/qualification.json` |
| **Native runner** | `npm run android:devtest:fresh -- --suite phase18 && node scripts/run-phase18-maestro.mjs --manifest artifacts/native/phase18/build.json && node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only` |
| **Performance command** | `node scripts/benchmark-phase18-garmin.mjs --manifest artifacts/native/phase18/build.json --evidence artifacts/native/phase18/performance.json && node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only` |
| **Evidence command** | `node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only` |
| **Feedback target** | Focused host/verifier commands finish under 60 seconds. Native build/collection may run longer; their artifact verifiers remain the fast task gate. |

## Sampling Rate

- **After every task commit:** Run the exact task `<automated>` command and record the result in its plan summary.
- **After Wave 0:** Confirm 18-01 records an explicit decoder accept/reject decision and 18-13 records provider/broker gates as passed or `CONDITIONAL_EXTERNAL`; no install is permitted yet.
- **After Wave 1:** Build/install the exact `phase18-decoder` APK, run the qualification producer, then validate its identity-bound evidence and proposed limits; host-only qualification is invalid.
- **After Wave 2:** Confirm 18-03 records the exact accepted limits/evidence hash or blocks all later plans.
- **After Waves 3–4:** Run the full decoder/normalizer/import transaction/time-zone/recovery matrices and exact integrity coverage for those files.
- **After Waves 5–6:** Run all import/detail/dedupe/revision/restore/match/root/route component and SQLite suites together; plans sharing no files may execute in parallel as listed below.
- **After Wave 7:** Run latest-format backup/clean restore/merge/capacity/dirty-generation/Android exclusion matrices with the full imported graph.
- **Before native collection:** Freeze source, run the full host gate, build one development-test release artifact, and bind source/APK/package/profile/signature/device/fixture identities.
- **Phase local gate:** NV-IMP-01..10 pass with complete raw evidence and accepted limits; NV-IMP-11..13 are explicitly external-blocked unless real separately authorized provider work exists.
- **Watch mode:** Prohibited for acceptance evidence.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Threat Ref | Secure behavior | Test type | Automated command / gate | File exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 18-01-01 | 01 | 0 | GAR-08,09 | T-18-01-01..03, T-18-SC | No manifest change before human package/licence/fixture acceptance | blocking-human | `git diff --exit-code -- package.json package-lock.json`; exact accept/reject signal | external refs ✅; decision ❌ | ⬜ pending |
| 18-02-01 | 02 | 1 | GAR-08,09 | T-18-02-01..03, T-18-SC | Exact accepted package; release Hermes; corrupt/trailing rejection; no Node polyfill | unit + native tracer | `npm run test:unit -- --runInBand src/testing/phase18FitDecoderQualification.test.ts && npm run typecheck && npm run check:boundaries` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 1 | GAR-08,09 | T-18-02-02..04 | Build/install exact decoder APK, produce identity-bound raw samples, then validate proposed limits | node + native evidence | `node --test scripts/phase18-fit-decoder-qualification.test.mjs`; native: `npm run android:devtest:fresh -- --suite phase18-decoder && node scripts/run-phase18-fit-decoder-qualification.mjs --manifest artifacts/native/phase18-decoder/build.json --evidence artifacts/native/phase18-decoder/qualification.json && node scripts/verify-phase18-fit-decoder-qualification.mjs --manifest artifacts/native/phase18-decoder/build.json --evidence artifacts/native/phase18-decoder/qualification.json` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | GAR-08,09 | T-18-03-01..03 | Exact native/runtime/limit evidence accepted before production code | blocking-human | Qualification verifier passes; exact limit object/evidence hash accepted | evidence ❌ W1; decision ❌ | ⬜ pending |
| 18-04-01 | 04 | 3 | GAR-08,10–12 | T-18-04-01..04 | Strict envelope/CRC/zero-errors/bounds before normalized draft | unit | `npm run test:unit -- --runInBand src/platform/garmin/fitDecoderAdapter.test.ts src/domains/activities/normalizeFitActivity.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 18-04-02 | 04 | 3 | GAR-08,09 | T-18-04-02,03 | Read-only one-file port, actual limit+1, cleanup, URI isolation | unit + boundary | `npm run test:unit -- --runInBand src/platform/files/expoFitFilePort.test.ts && npm run typecheck && npm run check:boundaries` | ❌ W0 | ⬜ pending |
| 18-04-03 | 04 | 3 | GAR-09–12 | T-18-04-01..04 | All corrupt/resource/subtype/time/lap/route branches; 100% coverage | unit + coverage | `npm run test:unit -- --runInBand src/domains/activities/importContracts.test.ts src/domains/activities/normalizeFitActivity.test.ts src/platform/garmin/fitDecoderAdapter.test.ts && npm run test:coverage -- --runInBand` | Phase 13 contracts ✅ extend; others ❌ | ⬜ pending |
| 18-05-01 | 05 | 4 | GAR-08,09 | T-18-05-01,02,05 | Portability capacity limit-1/limit/limit+1 before commit; commit-after-ack, rollback/replay, workout digest unchanged | unit + SQLite | `npm run test:unit -- --runInBand src/domains/activities/importCommands.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/importedActivityRepository.test.ts && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | Phase 13 source/capacity estimator ✅ extend; tests ❌ | ⬜ pending |
| 18-05-02 | 05 | 4 | GAR-08,09 | T-18-05-01,03 | Ambiguous zone/date and over-capacity confirmation are zero-write until a valid explicit commit | unit + SQLite | `npm run test:unit -- --runInBand src/domains/activities/importCommands.test.ts && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | mixed | ⬜ pending |
| 18-05-03 | 05 | 4 | GAR-09 | T-18-05-02,04 | Opaque attempt, transient cleanup, pre/post-commit process recovery | unit + migration + integration | `npm run test:unit -- --runInBand src/platform/sqlite/repositories/fitImportAttemptRepository.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | migration harness ✅ extend; other tests ❌ | ⬜ pending |
| 18-06-01 | 06 | 5 | GAR-08,09,15 | T-18-06-01..04 | Real picker→decode→commit→detail over one kernel; no early success | unit + component + SQLite | `npm run test:unit -- --runInBand src/bootstrap/garminImportRuntime.test.tsx && npm run test:components -- --runInBand src/ui/__tests__/ActivityImportScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | ❌ W0 | ⬜ pending |
| 18-06-02 | 06 | 5 | GAR-09,15 | T-18-06-02,03 | Exact zero-write/error/interruption/lost-ack states, retry keeps source | unit + component + SQLite | same focused runtime/screen/import command as 18-06-01 | ❌ W0 | ⬜ pending |
| 18-06-03 | 06 | 5 | GAR-08,09,15,16 | T-18-06-01..04 | Route allowlist, shared theme, 200%/landscape/focus/Back | component + type/boundary | `npm run test:components -- --runInBand src/ui/__tests__/ActivityImportScreen.test.tsx app/__tests__/garmin-import-route.test.tsx && npm run typecheck && npm run check:boundaries` | ❌ W0 | ⬜ pending |
| 18-07-01 | 07 | 6 | GAR-09 | T-18-07-01,03,04 | Exact replay/alias plus revision acceptance and separate import are revision/receipt-fenced, exclusively committed and fault-tested; prior match stays pinned | unit + SQLite | `npm run test:unit -- --runInBand src/domains/activities/importCommands.test.ts && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | Phase 13 source ✅ extend; tests ❌ | ⬜ pending |
| 18-07-02 | 07 | 6 | GAR-09,15 | T-18-07-01..04 | UI consumes the completed revision/source/split outcomes; only named confirmations mutate | component + SQLite | `npm run test:components -- --runInBand src/ui/__tests__/ActivityImportScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | mixed | ⬜ pending |
| 18-07-03 | 07 | 6 | GAR-09,15 | T-18-07-02..04 | Tombstone preserved; route consumes Phase 13 audited restore capability; no duplicate command or auto-match | component + route + SQLite | `npm run test:components -- --runInBand src/ui/__tests__/RemovedActivityRestoreScreen.test.tsx app/__tests__/garmin-restore-route.test.tsx && npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | Phase 13 restore ✅; UI/route ❌ | ⬜ pending |
| 18-08-01 | 08 | 5 | GAR-10–12,15 | T-18-08-01..04 | Accepted-payload facts and actual segmented route; read-only | unit + component | `npm run test:unit -- --runInBand src/domains/activities/activityDetails.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ImportedActivityDetailScreen.test.tsx src/ui/__tests__/GarminRoutePreview.test.tsx` | ❌ W0 | ⬜ pending |
| 18-08-02 | 08 | 5 | GAR-10–12,15 | T-18-08-01..03 | Distinct subtypes/missing facts/laps and source-backed recovery states | unit + component | same focused detail/route-preview command as 18-08-01 | ❌ W0 | ⬜ pending |
| 18-08-03 | 08 | 5 | GAR-01 producer contract, GAR-10–12,15,16 | T-18-08-01,02,04 | Validated Calendar-origin local-ID/return token, theme/reflow and structural zero mutation; Phase 16-07 owns consumer activation/Back/focus | component + route + boundary | `npm run test:components -- --runInBand app/__tests__/garmin-activity-route.test.tsx src/ui/__tests__/ImportedActivityDetailScreen.test.tsx src/ui/__tests__/GarminRoutePreview.test.tsx && npm run typecheck && npm run check:boundaries` | ❌ W0 | ⬜ pending |
| 18-09-01 | 09 | 6 | GAR-13,14 | T-18-09-01..04 | Stable candidate selection zero-write; exact explicit confirm once | unit + component + SQLite | `npm run test:unit -- --runInBand src/domains/running/activityMatchCommands.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ActivityMatchScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/running-activity-match.test.ts` | Phase 13 source ✅ extend; UI ❌ | ⬜ pending |
| 18-09-02 | 09 | 6 | GAR-13,14 | T-18-09-01..03 | Back/leave/failure/stale zero-write; audited unmatch/reassign | unit + component + SQLite | same focused match command/screen/integration gate as 18-09-01 | mixed | ⬜ pending |
| 18-09-03 | 09 | 6 | GAR-13,14 | T-18-09-01,04 | Exact alternate payload, opaque route, 200%/keyboard/focus | component + route + boundary | `npm run test:components -- --runInBand app/__tests__/garmin-match-route.test.tsx src/ui/__tests__/ActivityMatchScreen.test.tsx && npm run typecheck && npm run check:boundaries` | ❌ W0 | ⬜ pending |
| 18-10-01 | 10 | 6 | GAR-01,03,05,06 | T-18-10-01..04 | Production closed capability; local import/history remains usable | unit + component | `npm run test:unit -- --runInBand src/domains/activities/garminActivitySourcePort.test.ts src/bootstrap/garminImportRuntime.test.tsx && npm run test:components -- --runInBand src/ui/__tests__/GarminSyncScreen.test.tsx` | ❌ W0 | ⬜ pending |
| 18-10-02 | 10 | 6 | GAR-03,05,06,07,16 | T-18-10-01,03,04 | Complete conditional presentation; fixtures cannot alter production/close live rows | unit + component + boundary | `npm run test:unit -- --runInBand src/domains/activities/garminActivitySourcePort.test.ts src/bootstrap/garminImportRuntime.test.tsx && npm run test:components -- --runInBand src/ui/__tests__/GarminSyncScreen.test.tsx && npm run check:boundaries` | ❌ W0 | ⬜ pending |
| 18-11-01 | 11 | 7 | GAR-08,09,14 | T-18-11-01..05 | Latest-format source graph roundtrip; old formats read; no auth/transient/derivative | unit + integration | `npm run test:unit -- --runInBand src/domains/portability/backupContracts.test.ts && npm run test:integration -- --runInBand tests/integration/garmin-import-portability.test.ts` | Phase 13 source ✅ extend; test ❌ | ⬜ pending |
| 18-11-02 | 11 | 7 | GAR-09,14 | T-18-11-01..05 | Owner-safe remap/conflict/tombstone/match rebuild/capacity preflight | unit + contract + integration | `npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts src/testing/contracts/portableMerge.contract.test.ts && npm run test:integration -- --runInBand tests/integration/garmin-import-portability.test.ts` | mixed | ⬜ pending |
| 18-11-03 | 11 | 7 | GAR-08,09,14 | T-18-11-04 | Exact dirty generation and Android cloud/device-transfer exclusions | integration + plugin | `npm run test:integration -- --runInBand tests/integration/automatic-drive-backup.test.ts tests/integration/garmin-import-portability.test.ts && npm run test:unit -- --runInBand plugins/withAndroidBackupRules.test.ts` | plugin test ❌ | ⬜ pending |
| 18-12-01 | 12 | 8 | GAR-01 producer contract, GAR-02–03,08–16 | T-18-12-01..04 | Guarded contract/route/journey schema only; producer claim deferred to Task 18-12-02 | unit contract | `npm run test:unit -- --runInBand src/testing/contracts/garminImport.contract.test.ts src/testing/phase18GarminImport.test.ts` | ❌ W0 | ⬜ pending |
| 18-12-02 | 12 | 8 | GAR-01 producer contract, GAR-02–16 | T-18-12-01..04 | Build/install exact artifact, run full Maestro producer, then fail-closed identity/config/privacy validation; external rows blocked | node + native evidence | `node --test scripts/phase18-evidence-scripts.test.mjs`; native: `npm run android:devtest:fresh -- --suite phase18 && node scripts/run-phase18-maestro.mjs --manifest artifacts/native/phase18/build.json && node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only` | ❌ W0 | ⬜ pending |
| 18-12-03 | 12 | 8 | GAR-08–16 | T-18-12-02..05 | Produce raw benchmark evidence, then validate accepted bounds, workout/backup regressions and exact 100% coverage | benchmark + coverage + evidence | `node --test scripts/benchmark-phase18-garmin.test.mjs scripts/phase18-evidence-scripts.test.mjs && npm run test:coverage -- --runInBand`; native: `node scripts/benchmark-phase18-garmin.mjs --manifest artifacts/native/phase18/build.json --evidence artifacts/native/phase18/performance.json && node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only` | ❌ W0 | ⬜ pending |
| 18-13-01 | 13 | 0 | GAR-04–07 | T-18-13-01..05 | Actual program access/current full partner contract or explicit external block | blocking-human | Review access/agreement/API/OAuth/delivery/rate/release evidence; no local substitute | external evidence ❌ | ⬜ CONDITIONAL_EXTERNAL |
| 18-13-02 | 13 | 0 | GAR-04–07 | T-18-13-01..05 | Separate confidential topology/security/deployment approval; no secret in app | blocking-human | Review separate architecture/threat model/authorization; no broker code here | separate ADR/authorization ❌ | ⬜ CONDITIONAL_EXTERNAL |
| 18-14-01 | 14 | 7 | GAR-01,02,16 | T-18-14-01..03 | Workout origin, explicit root stack, exact Back state and four tabs only | component + route + boundary | `npm run test:components -- --runInBand src/ui/__tests__/TodayScreen.test.tsx 'app/(tabs)/__tests__/index.test.tsx' app/__tests__/garmin-index-route.test.tsx && npm run typecheck && npm run check:boundaries` | upstream mixed; Garmin route ❌ | ⬜ pending |
| 18-14-02 | 14 | 7 | GAR-01 producer contract, GAR-16 | T-18-14-01..03 | Running origin is integrated; changed activity route/test publish validated Calendar-origin local-ID/return contract without Phase 16 dependency | component + route + boundary | `npm run test:components -- --runInBand src/ui/__tests__/RunningPlanDetailScreen.test.tsx app/__tests__/running-plan-route.test.tsx app/__tests__/garmin-activity-route.test.tsx && npm run typecheck && npm run check:boundaries` | upstream mixed; activity/Running tests ❌ | ⬜ pending |

## Wave 0 Requirements

- [ ] Human accepts or rejects the exact `@garmin/fitsdk@21.217.0` package identity, SUS status, FIT Protocol License, required qualification/measurement use and fixture provenance before any manifest edit.
- [ ] If accepted, a fresh release Expo 57 / React Native 0.86 Hermes artifact proves root package resolution, TextDecoder, BigInt DataView, known valid decode, CRC/trailing/partial-output rejection and no Node Buffer/fs dependency.
- [ ] Raw native measurements produce explicit accepted numeric limits for input bytes, definitions/messages, sessions, laps, samples, normalized output/chunks, display route points, decode time, memory, bundle and responsiveness; no borrowed or invented threshold is allowed.
- [ ] Human accepts those exact native results/limits in `18-03-SUMMARY.md` before production adapter/picker work.
- [ ] Phase 13 exports the imported aggregate/two-index identity/receipt/portability graph and match ledger; Phase 17 exports stable Running session-slot/revision identity. Missing upstream artifacts halt rather than create parallel stores.
- [ ] Both FIT commit paths call and recheck the Phase 13 portability-capacity estimator; limit-1/limit commit and limit+1 leaves all source/receipt rows unchanged.
- [ ] Phase 14 shared shell/header/appearance/focus primitives and Phase 15/16/17 contextual entry/destination contracts exist before Garmin UI integration.
- [ ] Create RED-first tests in their owning plans for file/decoder/normalizer/import/attempt/detail/dedupe/restore/match/root/portability/native/evidence/benchmark contracts.
- [ ] Restore the authorized Android SDK/adb/emulator or device and Maestro before decoder/native evidence. Host tests do not close picker, Hermes, lifecycle, focus/geometry or performance rows.
- [ ] Record Garmin access and broker gates as passed with actual evidence or `CONDITIONAL_EXTERNAL`. A missing gate does not block local FIT execution.

## Manual-Only and External Verifications

| Behavior | Requirement | Why manual/external | Test instructions |
|---|---|---|---|
| Decoder package/licence legitimacy | GAR-08,09 | Licence applicability and acceptance of SUS package provenance require owner/legal judgment | Review exact package/tag/registry/licence/fixture provenance; use the exact accept or reject signal in 18-01. |
| Release-Hermes and measured resource limits | GAR-08,09 | Native evidence and chosen device-safe limits require human acceptance after automated validation | Verify artifact identities/raw samples/all bounds and accept/reject in 18-03. |
| Garmin program/current partner contract | GAR-04–07 | Access, private documentation and entitlement are external facts no local test can create | Provide actual accepted access/current complete contract or record `CONDITIONAL_EXTERNAL`. |
| Confidential broker/security/deployment authorization | GAR-04–07 | The local-only app cannot assume a new server/secret/operations boundary | Review a separate architecture/threat model and explicit implementation/deployment authorization; otherwise retain the closed capability. |

## Native Evidence Ownership and Handoff

Phase 18 owns these exact later-execution artifacts:

- Contract: `src/testing/contracts/garminImport.contract.ts`
- Contract tests: `src/testing/contracts/garminImport.contract.test.ts`
- Native controller: `src/testing/phase18GarminImport.ts`
- Native controller tests: `src/testing/phase18GarminImport.test.ts`
- Guarded route: `app/__phase18-garmin-import.tsx`
- FIT fixture manifest: `tests/fixtures/garmin/fixture-manifest.ts`
- Maestro flow: `maestro/phase18/garmin-import.yaml`
- Runner: `scripts/run-phase18-maestro.mjs`
- Evidence verifier: `scripts/verify-phase18-evidence.mjs`
- Verifier tests: `scripts/phase18-evidence-scripts.test.mjs`
- Performance collector: `scripts/benchmark-phase18-garmin.mjs`
- Performance tests: `scripts/benchmark-phase18-garmin.test.mjs`

Exact execution-time producer chains:

- Decoder qualification: `npm run android:devtest:fresh -- --suite phase18-decoder && node scripts/run-phase18-fit-decoder-qualification.mjs --manifest artifacts/native/phase18-decoder/build.json --evidence artifacts/native/phase18-decoder/qualification.json && node scripts/verify-phase18-fit-decoder-qualification.mjs --manifest artifacts/native/phase18-decoder/build.json --evidence artifacts/native/phase18-decoder/qualification.json`
- Local native matrix: `npm run android:devtest:fresh -- --suite phase18 && node scripts/run-phase18-maestro.mjs --manifest artifacts/native/phase18/build.json && node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only`
- Performance: `node scripts/benchmark-phase18-garmin.mjs --manifest artifacts/native/phase18/build.json --evidence artifacts/native/phase18/performance.json && node scripts/verify-phase18-evidence.mjs --manifest artifacts/native/phase18/build.json --automated-only`

Phase 20 consumes their verified manifests/reports for final milestone acceptance; it must not recreate, rename or replace them with generic final screenshots. Phase 18 Plan 12 is the final local evidence producer.

## Multi-Source Coverage Audit

| Source | ID | Feature / Constraint | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Import actual original FIT locally, inspect truthful detail, explicitly match one scheduled Running occurrence and publish the real Calendar-origin activity-route contract; official sync only after external security gates | 01–14 | COVERED | Phase 18 completes the local producer surface; Phase 16 Plan 16-07 consumes the route and closes actual Calendar activation/Back/focus. |
| REQ | GAR-01 | Contextual Workout/Running-plan entry plus real Calendar-origin route contract; four roots only | 10,12,14 | COVERED | Phase 18 publishes the exact route contract; Phase 16 Plan 16-07 performs Calendar activation/Back integration after Phase 18. |
| REQ | GAR-02 | One-line Garmin Sync stable three-column header | 10,12,14 | COVERED | Exact root slot/header and native geometry. |
| REQ | GAR-03 | Truthful not-connected/unavailable plus FIT fallback | 10,12 | COVERED | Production defaults closed; local operations remain. |
| REQ | GAR-04 | Approved consented OAuth2 PKCE and recovery | 10,12,13 | CONDITIONAL_EXTERNAL | Presentation contract tested; live closure requires actual access and separately reviewed confidential topology. |
| REQ | GAR-05 | Connected facts/list/receipts/actions | 10,12,13 | CONDITIONAL_EXTERNAL | Durable local activity/receipt list and state rendering covered; provider facts remain external. |
| REQ | GAR-06 | Syncing/import/no-new/error preserving facts | 10,12,13 | CONDITIONAL_EXTERNAL | Deterministic states/retention covered; real delivery result remains external. |
| REQ | GAR-07 | Real revoke/disconnect while retaining history | 10,12,13 | CONDITIONAL_EXTERNAL | UI/local retention covered; real provider result remains external. |
| REQ | GAR-08 | Native picker and actual local FIT parse/preview | 01–06,12 | COVERED | Two human/native gates then complete offline path. |
| REQ | GAR-09 | All file/duplicate/interruption failures without partial/lost facts | 04–07,11,12 | COVERED | Strict envelope, transactions, explicit decisions, recovery and native faults. |
| REQ | GAR-10 | Outdoor factual time/distance/pace/route/HR | 04,08,12 | COVERED | Source-present read model and actual route fixture. |
| REQ | GAR-11 | Treadmill No route and factual totals | 04,08,12 | COVERED | Explicit subtype independent from GPS. |
| REQ | GAR-12 | Accessible Lap/Time/Pace with honest missing values | 04,08,12 | COVERED | Source order plus 200% labelled reflow. |
| REQ | GAR-13 | Stable match candidates; selection writes nothing | 09,12 | COVERED | Phase 17 exact identities and radio-only selection. |
| REQ | GAR-14 | Confirm exact selection; Back/Leave/failure preserves activity | 09,11,12 | COVERED | Receipt-fenced explicit command and portability. |
| REQ | GAR-15 | Loading/missing/parse/projection/retry and correct Back | 06–08,12 | COVERED | Complete import/detail decision states. |
| REQ | GAR-16 | Shared Light/Dark/System and focus restoration | 06,08,10,12 | COVERED | Shared Phase 14 state and native matrix. |
| CONTEXT | D18-01 | Independently usable offline bounded read-only import; cancel zero-write | 04–06,12 | COVERED | Exact local vertical slice. |
| CONTEXT | D18-02 | Exact hash, header/length/CRC/resource bounds, unsupported/corrupt zero-write | 01–05,12 | COVERED | Blocking measured limits plus strict adapter. |
| CONTEXT | D18-03 | Independent identities, revisions, no fuzzy auto-merge | 05,07,11,12 | COVERED | Full identity/decision/portability matrix. |
| CONTEXT | D18-04 | Factual subtype/detail/route/HR/time/pace/laps | 04,08,12 | COVERED | Exact source presence and copy. |
| CONTEXT | D18-05 | Stable candidate/revision, confirm one, explicit audited relation changes | 09,11,12 | COVERED | Exact payload/opportunity and event ledger. |
| CONTEXT | D18-06 | Activity API/PKCE only with real access/current docs | 10,12,13 | COVERED | Closed capability plus blocking external gate. |
| CONTEXT | D18-07 | Client secret never in app; broker separate decision | 10,12,13 | COVERED | No provider adapter/broker implementation. |
| CONTEXT | D18-08 | Truthful unavailable UI; mocks cannot close live rows | 10,12,13 | COVERED | Production-closed port and verifier rejection. |
| RESEARCH | R18-01 | Phase 13/17 preflight; no duplicate domain/store | 05,09,11 | COVERED | Hard preconditions and in-place extension. |
| RESEARCH | R18-02 | SUS decoder licence/legitimacy before install | 01,02 | COVERED | Blocking-human gate before manifest edit. |
| RESEARCH | R18-03 | Release Hermes/Metro compatibility and measured limits | 02,03,12 | COVERED | Native qualification, acceptance and regression. |
| RESEARCH | R18-04 | Strict exact envelope plus zero decoder partials | 04,12 | COVERED | Independent length + integrity/errors/bounds. |
| RESEARCH | R18-05 | Decode DTO then pure normalize with subtype/time/pace provenance | 04 | COVERED | SDK isolation and pure domain transform. |
| RESEARCH | R18-06 | Immutable aggregate/revision/receipt and recoverable attempt | 05,07 | COVERED | Commit/replay/interruption/decision matrices. |
| RESEARCH | R18-07 | Source-present detail and static local SVG | 08 | COVERED | No map/network/location/canned curve. |
| RESEARCH | R18-08 | Stable matching as separate command | 09 | COVERED | Selection zero-write, explicit commit. |
| RESEARCH | R18-09 | Shared runtime/contextual routes; no second kernel/fifth root | 06,10,14 | COVERED | Existing lifecycle and exact stack. |
| RESEARCH | R18-10 | Versioned portability, pre-commit import capacity preflight, dirty triggers/exclusions | 05,11 | COVERED | Both commit paths gate limit-1/limit/limit+1 before source writes; full graph recovery remains Plan 11. |
| RESEARCH | R18-11 | Privacy-safe diagnostics/evidence | 04–12 | COVERED | Fixed codes/counters/hashes, forbidden-field verifiers. |
| RESEARCH | R18-12 | Official provider remains external-blocked; no live stub | 10,12,13 | COVERED | Conditional status and no provider file. |
| RESEARCH | R18-13 | Integrity-critical exact 100% coverage | 04,12 | COVERED | Registry and full gate. |
| RESEARCH | R18-14 | Native picker/Hermes/lifecycle/performance evidence | 02,12 | COVERED | Two exact-artifact evidence stages. |
| RESEARCH | R18-15 | Temporary raw FIT retention and startup cleanup | 05,11,12 | COVERED | Operational marker, exclusions and process proof. |
| EXCLUDED | Deferred | In-app recording, unofficial Connect scraping, Training API push | — | EXCLUDED | Explicit deferred ideas; absent from all plans. |
| EXCLUDED | Deferred | Broker implementation/deployment | — | EXCLUDED | Separate owner/security decision required; Plan 13 only records gate status. |

## Dependency and Wave Audit

| Wave | Plans | Independence / Gate |
|---:|---|---|
| 0 | 18-01, 18-13 | Disjoint human gates: decoder package/licence and official external/broker authorization. No code, install or provider implementation. |
| 1 | 18-02 | Exact accepted decoder installation plus release-Hermes/resource qualification only. |
| 2 | 18-03 | Blocking acceptance of the native runtime and numeric resource envelope. |
| 3 | 18-04 | Production file/decoder/normalizer boundary after accepted limits. |
| 4 | 18-05 | Committed import/date/attempt recovery over Phase 13 source graph. |
| 5 | 18-06, 18-08 | Import UI/runtime and factual detail route have disjoint files; both consume the committed import boundary. |
| 6 | 18-07, 18-09, 18-10 | Dedupe/revision/restore, matching, and contextual root/capability own disjoint files at this wave and consume completed local UI/detail. |
| 7 | 18-11, 18-14 | Portability/recovery and Workout/Running wiring plus Calendar-origin route-contract publication are file-disjoint and consume the completed local product without depending on Phase 16 execution. |
| 8 | 18-12 | One exact artifact proves the complete local phase and carries explicit external-blocked rows. |

No same-wave plans share a `files_modified` path. Cross-phase dependencies are task preconditions because `depends_on` is phase-local.

## Cohesion and Split Rationale

| Plan(s) | Cohesive execution boundary | Split decision |
|---|---|---|
| 18-01, 18-03, 18-13 | Human/legal/native/external facts that automation cannot establish | Intentionally single-purpose checkpoint plans; adding filler tasks would weaken the gates. |
| 18-02 | Exact decoder pin → guarded build/install/run → qualification evidence/validation | Licence and final acceptance are already split out; producer and validator stay together to prevent artifact drift. |
| 18-04 | Hostile bytes → strict decoder DTO → pure normalization | One bounded intake pipeline; file-port expansion remains a separate task inside the plan. |
| 18-05 | Portability capacity/time provenance → exclusive import/receipt → interruption recovery | One mutation boundary and one fault matrix; estimator or attempt-state separation would make commit proof incomplete. |
| 18-06 | Runtime controller → import screen/route → accessibility/focus recovery | One user-visible offline import slice. |
| 18-07 | Identity/revision commands → exact decision UI; Phase 13 restore consumed separately | Domain decisions precede UI, while restore implementation is correctly split upstream into Phase 13. |
| 18-08 | Accepted payload projection → factual route/lap detail → producer-side origin contract | One read-only detail capability; Phase 16 consumer activation is split into 16-07. |
| 18-09 | Candidate read → explicit match writer → match route/recovery | One confirmation-only capability sharing exact stable identities. |
| 18-10 | Closed capability contract → truthful Garmin root/presentation | No provider transport is mixed into the local surface. |
| 18-11 | One portable imported/match graph across backup, merge, dirty generation and Android exclusions | These checks share the same source closure and maximum-capacity fixture. |
| 18-12 | Guarded contract → one build/install/Maestro producer → benchmark producer → final validator | Split by task but not plan so every report stays bound to one immutable artifact. |
| 18-14 | Workout/Running entries plus activity-route producer contract | Actual Calendar activation is the only cross-phase piece and is split into Phase 16 Plan 16-07. |

Further splits are reserved for genuinely independent capabilities; trivial file-count splits that separate a producer from its receipt, manifest or validator are prohibited.

## Rollback and Reversibility Audit

| Door | Rating | Gate / Recovery |
|---|---|---|
| Decoder package/licence | costly | Blocking-human before install; exact pin behind stable port; rejection stops without product/migration work. |
| Measured limit object | reversible | Blocking-human before production; centralized constants can tighten with new native evidence and full boundary tests. |
| Imported payload/receipt decisions | one-way | Immutable portable history; correction/removal/acceptance appends events/revisions. |
| Match/unmatch/reassign decisions | one-way | Immutable portable events; current relation is rebuilt. |
| Logical archive format | one-way | Additive versioned reader/migration required; v1/v2 readers retained. |
| File/decoder/runtime/UI implementations | reversible | Stable ports/read models isolate implementation and presentation replacements. |
| Native evidence schemas | reversible | Versioned private artifacts; verifier rejects incompatible/stale results without product mutation. |
| Official provider/broker boundary | one-way external | No door is crossed in this phase; separate access/security/architecture authorization is mandatory. |

## Pre-Mortem and Reachability Audit

| Likely failure | Early detector / mitigation |
|---|---|
| Decoder looks official but licence/runtime is unacceptable | 18-01 blocks install; 18-02/03 require exact release-Hermes and owner acceptance before production. |
| Small hostile FIT exhausts JS or leaks partial facts | Independent envelope/CRC/error/counter/output limits, native max-fixture evidence and full rollback tests in 18-04/05/12. |
| Import/revision/match appears successful before durable commit | Receipt replay, settlement-after-COMMIT tests and native process-death cuts in 18-05/12. |
| Historical day/subtype/pace changes after travel/parser update | Persisted time/subtype/pace provenance and explicit owner/date/revision decisions in 18-04/05/07. |
| Restore loses or cross-links imported evidence | Whole-graph latest-format roundtrip/remap/conflict/capacity tests in 18-11. |
| Mocked provider UI is reported as official sync | Production closed port, Plan 13 gates and evidence verifier reject simulated live closure. |

Every must-have is reachable: Workout/Running navigate to declared routes; Phase 18 publishes the real Calendar-origin activity-route contract consumed by Phase 16 Plan 16-07; native picker feeds the strict port; import commands reach the existing writer; committed local IDs reach detail/match; source graphs reach logical backup/restore/merge; guarded native routes reach real production ports under test controls; no config flag or provider success exists without its consumer and gate.

## Validation Sign-Off

- [ ] All 34 task IDs have an automated gate or one of four explicit blocking-human/external gates.
- [ ] GAR-01–03/08–16, D18-01–08 and every in-scope research constraint map to plans with no deferred idea implemented.
- [ ] Decoder installation follows—not precedes—the exact 18-01 acceptance signal.
- [ ] Release-Hermes qualification and accepted numeric limits exist before production parser/picker work.
- [ ] Phase 13/14/15/16/17 preconditions pass; no duplicate store, second kernel, fifth root, date-only match or route-local theme exists.
- [ ] Every code-producing task starts RED/tracer-first and focused commands stay under the fast-feedback target.
- [ ] Integrity-critical Phase 18 files reach exact 100% statements/branches/functions/lines.
- [ ] No screen/route imports platform/SQLite; no private FIT/name/path/coordinate/HR/subject/token/serial enters diagnostics/evidence.
- [ ] Native NV-IMP-01..10 and accepted performance/resource bounds pass on one exact artifact; provider rows remain `CONDITIONAL_EXTERNAL` without actual authorization.
- [ ] Portability, merge, tombstone, match rebuild, dirty generation and Android backup exclusions pass with maximum bounded fixtures.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after the execution-time audit, not during planning.

**Approval:** pending decoder/package/native decisions, execution, local evidence and separate external Garmin gates.
