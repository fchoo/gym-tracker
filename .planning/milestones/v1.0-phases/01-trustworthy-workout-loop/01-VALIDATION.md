---
phase: 01
slug: trustworthy-workout-loop
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for continuous feedback from toolchain bootstrap through the final digest-bound Android workout loop.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7, jest-expo 57.0.4, RNTL 14.0.1, Node 24 `node:sqlite`, actual Expo SQLite runner, Maestro 2.8.0 |
| **Config file** | `jest.config.js`, `eslint.config.js`, `.github/workflows/pr.yml` — created in Wave 0/1 |
| **Quick run command** | `npm run typecheck && npm run test:unit -- --runInBand` |
| **Full host command** | `npm run lint && npm run check:boundaries && npm run test:unit -- --runInBand && npm run test:components -- --runInBand && npm run test:sqlite:host -- --runInBand && npm run test:integration -- --runInBand && npm run test:coverage` |
| **Full native command** | `npm run android:devtest:fresh -- --suite phase1 && npm run test:sqlite:device -- --manifest artifacts/native/phase1/build.json && maestro test maestro/smoke maestro/lifecycle` |
| **Final PR command** | `npm run ci:pr` |
| **Estimated runtime** | targeted checks under 60 seconds; full native/E2E gate is CI/device-bound |

---

## Sampling Rate

- **After every code-producing task:** Run that task's targeted automated command before proceeding.
- **After every plan:** Run `npm run typecheck && npm run lint && npm run test:unit -- --runInBand`; after 01-04, also rerun the applicable host SQLite contract.
- **After every wave:** Run the full host command. Waves 2, 3, 6, and 7 additionally clean-prebuild/build/hash/install current HEAD and run their native suite against that exact APK.
- **After native-sensitive changes:** Never reuse a prior APK. Run `npm run android:devtest:fresh -- --suite <suite>`, pass its build manifest to the test runner, and verify result/HEAD/APK/package/device identity with `node scripts/verify-native-evidence.mjs`.
- **Before `/gsd-verify-work`:** `npm run ci:pr`, all Maestro suites, artifact upload/download digest equality, and the 01-10 physical-device checkpoint must pass.
- **Sampling continuity:** No three consecutive implementation tasks may complete without an automated test command; this map has automated verification for every implementation task.
- **Max fast-feedback latency:** 60 seconds for targeted host checks. Native and E2E checks are explicit wave/final gates rather than skipped for latency.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Test Creation | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|---------------|--------|
| 01-01-01 | 01 | 0 | REL-01 | T-01-01 / T-01-SC | Package names and sources are approved before install | supply-chain gate | `npm view expo expo-router expo-notifications expo-file-system expo-sharing @tanstack/react-query jest-expo lucide-react-native @expo-google-fonts/source-sans-3 @expo-google-fonts/ibm-plex-mono repository.url version --json` | Wave 0 records registry evidence; human approval remains blocking | ⬜ pending |
| 01-01-02 | 01 | 0 | REL-01 | T-01-01 / T-01-02 | Pinned toolchain, lock replay, backup exclusions, and committed bootstrap scripts | config/build | `sh scripts/doctor-android.sh && npm ci && npx expo install --check && npx expo-doctor && npm run typecheck` | Creates scaffold, CNG assertions, source-digest bootstrap build/verifier scripts, and CI skeleton | ⬜ pending |
| 01-01-03 | 01 | 0 | REL-01 | T-01-03 / T-01-04 | Clean CNG, base-HEAD plus source-tree-digest APK identity, and no tracked native tree | native build | `npm run verify:cng && npm run android:bootstrap:fresh -- --suite bootstrap && node scripts/verify-bootstrap-native-evidence.mjs artifacts/native/bootstrap/result.json && git ls-files android ios \| test "$(wc -l \| tr -d ' ')" = "0"` | Consumes committed Task 2 scripts and creates ignored artifact outputs only | ⬜ pending |
| 01-02-01 | 02 | 1 | FOUND-07, FOUND-08, FOUND-09 | T-01-02-02 / T-01-02-03 | Tokens, adaptive layout, large text, focus, and semantics | component | `npm run test:components -- foundation --runInBand && npm run typecheck` | Creates `foundation.test.tsx` before implementation | ⬜ pending |
| 01-02-02 | 02 | 1 | FOUND-02 | T-01-02-01 | Locked roots and focused workout navigation | component | `npm run test:components -- foundation --runInBand && npm run lint` | Extends shell/navigation cases first | ⬜ pending |
| 01-03-01 | 03 | 1 | FOUND-06 | T-01-03-01 / T-01-03-02 | Version validation and privacy-safe errors/diagnostics | unit | `npm run test:unit -- contracts errors diagnostics clock --runInBand` | Creates schema/error/redaction tables first | ⬜ pending |
| 01-03-02 | 03 | 1 | FOUND-06 | T-01-03-03 | Import boundaries and host test infrastructure | static/host | `npm run lint && npm run check:boundaries && npm run test:unit -- --runInBand && npm run test:sqlite:host -- --runInBand` | Creates Jest, boundary, and host SQLite scaffolds | ⬜ pending |
| 01-04-01 | 04 | 2 | FOUND-03 | T-01-04-01 / T-01-04-03 | FIFO private writer, rollback, FK, cleanup, commit latch | host SQLite | `npm run test:sqlite:host -- sqliteKernel --runInBand && npm run check:boundaries` | Expands shared ten-case kernel contract first | ⬜ pending |
| 01-04-02 | 04 | 2 | FOUND-03 | T-01-04-02 / T-01-04-04 | Actual Expo SQLite proof plus shared native evidence scripts | native SQLite | `npm run test:sqlite:host && npm run android:devtest:fresh -- --suite sqlite-kernel && npm run test:sqlite:device -- --manifest artifacts/native/sqlite-kernel/build.json --assert-all=10 && node scripts/verify-native-evidence.mjs artifacts/native/sqlite-kernel/result.json` | Creates native contract route/exporter and the generic build/evidence scripts consumed unchanged later | ⬜ pending |
| 01-05-01 | 05 | 3 | Supporting D-33 | T-01-05-01..04 | Bounded Argon2 KAT, background execution, redaction, current APK | native/unit | `npx expo prebuild --clean --platform android && ./android/gradlew --no-daemon :argon2-kdf:testDebugUnitTest && npm run android:devtest:fresh -- --suite argon2 && node scripts/run-argon2-feasibility.mjs --device=emulator --manifest artifacts/native/argon2/build.json --assert-kat --assert-responsive --assert-cng --assert-page-size && node scripts/verify-native-evidence.mjs artifacts/native/argon2/result.json` | Creates only Argon2 module/runner evidence and consumes 01-04 native scripts unchanged | ⬜ pending |
| 01-06-01 | 06 | 3 | FOUND-05 | T-01-06-01 / T-01-06-04 | Complete Phase 1 schema, retained fixtures, atomic migration/recovery | host/native SQLite | `npm run test:sqlite:host -- migrations-effects --runInBand && npm run android:devtest:fresh -- --suite migrations-effects && npm run test:sqlite:device -- --manifest artifacts/native/migrations-effects/build.json --suite migrations-effects && node scripts/verify-native-evidence.mjs artifacts/native/migrations-effects/result.json` | Creates v0/v1 retained fixtures and statement-failure tables first | ⬜ pending |
| 01-06-02 | 06 | 3 | FOUND-04 | T-01-06-02 / T-01-06-03 | Leased idempotent effects and trusted launch ordering | host/native/component | `npm run test:sqlite:host -- migrations-effects --runInBand && npm run test:sqlite:device -- --manifest artifacts/native/migrations-effects/build.json --suite migrations-effects && npm run test:components -- RootFailureState --runInBand` | Adds lease/retry/stale-revision and launch tests first | ⬜ pending |
| 01-07-01 | 07 | 4 | WORK-01 | T-01-07-01 / T-01-07-02 | Frozen fixture and bundled/copied ownership | integration | `npm run test:integration -- plan-workout-tracer --runInBand` | Creates canonical fixture digest/ownership/rollback cases first | ⬜ pending |
| 01-07-02 | 07 | 4 | WORK-02, WORK-03, WORK-04 | T-01-07-03 | Trusted Today values, explicit start modes, immutable snapshots | integration/component | `npm run test:integration -- plan-workout-tracer --runInBand && npm run test:components -- TodayScreen --runInBand` | Adds all Today/start/snapshot cases first | ⬜ pending |
| 01-08-01 | 08 | 5 | WORK-05, WORK-06, WORK-07, WORK-08, WORK-09, WORK-10 | T-01-08-01..03 | Exactly-once set commit, post-commit effects, Retry, Undo | integration/coverage | `npm run test:integration -- complete-set --runInBand && npm run test:coverage -- workout` | Creates rapid-input/failure/Undo/value/warm-up tests first | ⬜ pending |
| 01-08-02 | 08 | 5 | WORK-05..WORK-10 | T-01-08-02 / T-01-08-04 | Accessible single-action UI without optimistic success | component/integration | `npm run test:components -- ActiveWorkoutScreen --runInBand && npm run test:integration -- complete-set --runInBand` | Creates dock/input-equivalence/adaptive cases first | ⬜ pending |
| 01-09-01 | 09 | 6 | WORK-11, WORK-12 | T-01-09-01 | Timestamp rest state and accessible controls | unit/integration/component | `npm run test:unit -- restState --runInBand && npm run test:integration -- rest-lifecycle --runInBand && npm run test:components -- RestDock --runInBand && npm run test:coverage -- rest` | Creates fake-clock transition tables first | ⬜ pending |
| 01-09-02 | 09 | 6 | WORK-13, WORK-14, WORK-15 | T-01-09-02..04 | Idempotent notification repair and process-death recovery | integration/Maestro | `npm run test:integration -- rest-lifecycle --runInBand && npm run android:devtest:fresh -- --suite rest-lifecycle && maestro test --format junit --output artifacts/native/rest-lifecycle/maestro.xml maestro/lifecycle/rest-recovery.yaml && node scripts/verify-native-evidence.mjs artifacts/native/rest-lifecycle/result.json` | Creates notification/lifecycle fixtures and Maestro flow first | ⬜ pending |
| 01-10-01 | 10 | 7 | WORK-16, WORK-17, WORK-18 | T-01-10-01 | Explicit outcomes and factual immutable completion/detail | integration/component/coverage | `npm run test:integration -- workout-outcomes --runInBand && npm run test:components -- WorkoutCompletionScreen SessionDetailScreen --runInBand && npm run test:coverage -- workout-outcomes` | Creates outcome transition/read-model tables first | ⬜ pending |
| 01-10-02 | 10 | 7 | FOUND-01, WORK-18, REL-02 | T-01-10-02..04 | Progression plus built and wired final CI, Maestro, benchmark, and artifact proof | unit/integration/component/CI/Maestro/performance | `npm run test:unit -- loadRepsV1 --runInBand && npm run test:integration -- load-reps --runInBand && npm run test:components -- WorkoutCompletionScreen --runInBand && npm run test:coverage -- progression && npm run ci:pr && npm run test:maestro:phase1 -- --manifest artifacts/phase1/build.json && npm run benchmark:phase1 -- --manifest artifacts/phase1/build.json --samples 100 --max-p95-ms 150 --max-js-task-ms 50 && npm run verify:artifact-roundtrip -- artifacts/phase1` | Creates all final flows, fixture, runners, package scripts, and CI workflow wiring before checkpoint | ⬜ pending |
| 01-10-03 | 10 | 7 | FOUND-01, REL-02 | T-01-10-03 / T-01-10-04 | Human validates already built digest-bound automation and physical-device-only evidence | physical-device checkpoint | `npm run ci:pr && npm run verify:artifact-roundtrip -- artifacts/phase1 && npm run benchmark:phase1 -- --manifest artifacts/phase1/build.json --samples 100 --max-p95-ms 150 --max-js-task-ms 50` | No implementation; reviews Task 2 outputs and records physical accessibility/device/Argon2 evidence | ⬜ pending |

---

## Requirement Coverage Proof

| Owner Plan | Requirements |
|------------|--------------|
| 01-01 | REL-01 |
| 01-02 | FOUND-02, FOUND-07, FOUND-08, FOUND-09 |
| 01-03 | FOUND-06 |
| 01-04 | FOUND-03 |
| 01-05 | Supporting D-33 feasibility; no Phase 1 requirement claim |
| 01-06 | FOUND-04, FOUND-05 |
| 01-07 | WORK-01, WORK-02, WORK-03, WORK-04 |
| 01-08 | WORK-05, WORK-06, WORK-07, WORK-08, WORK-09, WORK-10 |
| 01-09 | WORK-11, WORK-12, WORK-13, WORK-14, WORK-15 |
| 01-10 | FOUND-01, WORK-16, WORK-17, WORK-18, REL-02 |

This ownership table contains all 29 Phase 1 requirements exactly once.

---

## Wave 0 Requirements

- [x] `jest.config.js` plus `scripts/run-coverage-gate.mjs` — global thresholds and explicit 100% all-metric integrity-critical file gate.
- [x] `eslint.config.js`, `scripts/check-boundaries.mjs` — module and raw-writer boundary gates.
- [x] `tests/sqlite-host/sqliteKernel.host.test.ts` — Node `node:sqlite` contract scaffold.
- [x] `src/testing/contracts/sqliteKernel.contract.ts` — shared host/device cases.
- [x] `app/__native-contracts.tsx`, `scripts/run-native-sqlite-contracts.mjs` — development-test native runner/exporter.
- [x] `scripts/doctor-android.sh`, `scripts/check-cng-reproducible.sh`, `scripts/build-bootstrap-native-test-apk.sh`, `scripts/verify-bootstrap-native-evidence.mjs` — Wave 0 toolchain, clean bootstrap build, and base-HEAD/source-digest identity gates.
- [x] `scripts/build-current-native-test-apk.sh`, `scripts/verify-native-evidence.mjs` — created once by 01-04 and consumed unchanged by all later native-sensitive plans.
- [x] `.github/workflows/pr.yml` — full-SHA-pinned ordered CI skeleton.
- [x] `maestro/smoke/` and `maestro/lifecycle/` — complete exact-APK E2E flows with no skipped path.
- [x] Every implementation task has targeted tests plus the final 613-test cross-project coverage run.

Wave 0 is complete only when the commands exist and fail explicitly for not-yet-implemented later suites rather than silently passing or skipping.

---

## Native and Device Gates

1. Native-sensitive plans 01-04, 01-05, 01-06, 01-09, and 01-10 remove generated Android output and run clean Expo prebuild before Gradle.
2. Each builds current HEAD, copies the exact APK outside `android/`, records SHA-256/commit/package/device metadata, installs that exact path, and binds results with `verify-native-evidence.mjs`.
3. The final CI job uploads APK plus manifests/results; a separate job downloads them and verifies byte-for-byte SHA-256 equality.
4. Native Expo SQLite may not be represented by host SQLite or mocked Expo modules.
5. Maestro final proof includes fresh launch, activation, workout start, set commit, rest, `killApp`, recovery, denied/late notifications, airplane mode, completion/progression, rotation, and digest identity.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy approval | REL-01 | Supply-chain policy requires human confirmation for SUS/ASSUMED packages | Complete 01-01 Task 1 after registry/source evidence is generated and before installation |
| Physical Android input/adaptive/notification/process-death/p95 and Argon2 evidence | FOUND-01, FOUND-08, FOUND-09, WORK-13..18, REL-02 | Real keyboard/D-pad behavior, device notification, and minimum-device characteristics cannot be fully simulated | Complete only the consolidated 01-10 Task 3 after 01-10 Task 2 has created and passed every automated host/native/CI/Maestro/benchmark/round-trip gate |

No other mid-phase human checkpoint is permitted.

---

## Final E2E Proof

- `npm run ci:pr` is fully green with no placeholder, skip, allowed failure, watch mode, or stale native artifact.
- Host order: typecheck -> lint/boundaries -> unit -> component -> host SQLite -> coverage.
- Native order: clean prebuild/build/hash/install current HEAD -> native Expo SQLite -> Maestro smoke/lifecycle.
- Maestro: fresh launch -> activate Full Body Foundation -> start Full Body A -> complete set -> rest -> Home -> `killApp` -> relaunch without clear state -> recover -> finish -> completion -> recommendation decision.
- Separate flows: permission denied then granted, missing/late/stale notification, rotation, and three airplane-mode workout repetitions.
- Performance: at least 100 working-set transaction+dock samples, p95 <=150 ms, no ordinary Active Workout JS task >50 ms.
- Artifact: uploaded and downloaded APK SHA-256 values match each other, current commit, build manifest, native JSON, Maestro results, benchmark report, and the physical-device-installed bytes.

---

## Validation Sign-Off

- [x] All implementation tasks have targeted automated verification.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Wave 0 created every missing test/config/runner before dependent implementation.
- [x] All 29 requirements map to exactly one owner plan.
- [x] No watch-mode flags or silent skip/allowed-failure gates.
- [x] Global coverage is 92.9% statements, 88.7% branches, 91.21% functions, and 93.38% lines; all 28 explicitly enumerated integrity-critical modules are 100% on all four metrics.
- [x] Native evidence is bound to implementation HEAD `4e3e521`, source digest `34f15295...`, and APK `220e46ae...`; later drift is limited to approved artifact-neutral planning, design, tests, and coverage tooling.
- [x] Final E2E, airplane repetition, notification, recovery, adaptive/input, p95, Argon2, and artifact-byte gates pass.
- [x] `status: validated`, `nyquist_compliant: true`, and `wave_0_complete: true` are set after execution and physical evidence exists.

**Approval:** passed 2026-08-17
