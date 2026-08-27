---
phase: 02-owned-library-and-planning
plan: 21
subsystem: testing
tags: [android, expo-sqlite, maestro, coverage, benchmark, artifact-roundtrip, exact-apk, ci]

requires:
  - phase: 01-trustworthy-workout-loop
    provides: Phase 1 native contracts, installed recovery journeys, coverage gates, benchmark seams, and exact-APK identity controls
  - phase: 02-owned-library-and-planning
    provides: Accepted catalog and starters, complete metric/schedule/owned-plan implementation, installed flows, and 57 source-owned native cases from Plans 02-01 through 02-20
provides:
  - One retained embedded release development-test APK bound to implementation HEAD, deterministic source digest, package, installed bytes, and API 36 arm64 emulator identity
  - Complete 57-case Expo SQLite and 16-flow Maestro evidence with zero failed, skipped, or stale results
  - Two 100-sample production-path benchmarks under p95 150 ms and JS-task 50 ms thresholds
  - Exact retained, copied, and installed APK roundtrip identity
  - Automated-only verification of 12 requirements, 55 decisions, 78 edges, eight UI truths, and three prohibitions
affects: [02-22-attended-seal, phase2-verification, release-evidence, pr-ci]

actuals:
  tokens: 0
  tasks: 3
  commits: 49

tech-stack:
  added: []
  patterns:
    - Final native evidence is generated in strict producer order from one unchanged exact-HEAD APK
    - Long React Native benchmark payloads use bounded versioned indexed logcat chunks and fail closed on missing or duplicate records
    - Expo SQLite benchmark kernels remain process-scoped and the host force-stops the benchmark app after result, error, or timeout
    - Later metadata-only commits are permitted only when every changed path is under .planning

key-files:
  created:
    - scripts/run-phase2-maestro.mjs
    - scripts/benchmark-phase2.mjs
    - scripts/verify-phase2-native-evidence.mjs
    - scripts/phase2-evidence-scripts.test.mjs
  modified:
    - package.json
    - .github/workflows/pr.yml
    - scripts/run-coverage-gate.mjs
    - app/__phase2-benchmark.tsx
    - src/bootstrap/phase1Benchmark.ts
    - src/bootstrap/phase2Benchmark.ts
    - src/bootstrap/benchmarkRecovery.ts
    - src/platform/sqlite/recoveryBackup.ts
    - src/platform/sqlite/repositories/plansWorkoutRepository.ts
    - maestro/phase2/library-exercises.yaml
    - maestro/phase2/plan-impact-replacement.yaml
    - maestro/phase2/schedule-cross-profile.yaml

key-decisions:
  - "All final automated evidence is bound to implementation HEAD 2dd072d673a9094fc4a1747f93c3c975c0e46321 and APK SHA-256 7d982ea57b2d9a13834126b57e50f0745ee5b115ba5ef7ecda9c6115d4e2f5a8."
  - "Benchmark SQLite kernels and successful recovery-validation kernels remain strongly referenced for the process lifetime; the host owns process cleanup through force-stop."
  - "Legacy Full Body Foundation activation conditionally writes complete metric profile, contract-version, and generation identity on v6+ schemas while retaining legacy insert shapes."
  - "Benchmark results preserve every duration sample and cross logcat through bounded indexed chunks rather than shrinking evidence."
  - "Plan 02-22 alone owns physical-result.json and final-verification.json."

patterns-established:
  - "Exact native chain: host gates -> one clean build -> native -> Maestro -> benchmark -> roundtrip -> automated-only verifier."
  - "Evidence identity: base HEAD, source digest, retained APK, copied APK, installed APK, package, API, ABI, and model must agree."
  - "Metadata exemption: after the automated-only verifier, only .planning closeout writes and their metadata commit may occur before Plan 02-22."

requirements-completed: [LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12]

duration: 24h 56m elapsed
completed: 2026-08-20
---

# Phase 2 Plan 21: Exact-APK Automated Evidence Summary

**One exact implementation-HEAD APK now carries complete host, Expo SQLite, installed-flow, performance, roundtrip, requirement, decision, edge, UI-truth, and prohibition evidence.**

## Performance

- **Elapsed:** 24h 56m
- **Tasks:** 3
- **Commits:** 49
- **Host validation:** 81 suites, 1,536 tests
- **Coverage:** 91.02% statements, 87.59% branches, 90.11% functions, 91.29% lines
- **Integrity coverage:** 62/62 files at 100% statements, branches, functions, and lines

## Exact Build Identity

- **Implementation HEAD:** `2dd072d673a9094fc4a1747f93c3c975c0e46321`
- **Source digest:** `33586b041a5c73f83340430ea922ad39bb250c9cd9725fb286857d6f0725dd10`
- **Package:** `com.fchoo.gymtracker.devtest`
- **APK:** `artifacts/native/phase2/gym-tracker-phase2-devtest.apk`
- **APK SHA-256:** `7d982ea57b2d9a13834126b57e50f0745ee5b115ba5ef7ecda9c6115d4e2f5a8`
- **APK size:** 118,237,554 bytes
- **Alignment:** 16 KiB verified
- **Device:** `sdk_gphone64_arm64`, Android API 36, `arm64-v8a`
- **Installed bytes:** exact SHA-256 match

## Accomplishments

- Added real Phase 2 Maestro, benchmark, evidence-verification, artifact-roundtrip, package, and PR-CI commands with fail-closed identity checks.
- Extended the coverage gate to 62 integrity-critical Phase 2 files while lifting global function coverage above the 90% threshold.
- Stabilized installed Library, starter, owned-plan, impact/replacement, custom-exercise, migration, schedule, cross-profile, recovery, and notification journeys without bypassing source authority.
- Preserved generated workout identities, owned between-exercise rest, accepted-plan workout recommendations, retained benchmark migrations, and legacy plan activation on the v10 schema.
- Replaced the truncated single-line benchmark result with a bounded versioned indexed chunk transport while preserving all 100 duration samples per measurement.
- Produced complete automated evidence from one unchanged APK and sealed it with the automated-only verifier.

## Automated Evidence

| Gate | Result |
|---|---|
| Typecheck | Passed |
| Boundary lint | Passed, 159 files |
| Evidence script contracts | Passed, 25/25 |
| Host tests | Passed, 1,536/1,536 across 81 suites |
| Integrity-critical coverage | Passed, 62 files at 100% all metrics |
| Native Expo SQLite | Passed, 57/57 |
| Maestro installed flows | Passed, 16/16 |
| Search benchmark | 100/100, p95 5.09 ms, max JS task 0.001 ms |
| Working-set commit benchmark | 100/100, p95 33.31 ms, max JS task 0.011 ms |
| APK roundtrip | Retained = copied = installed |
| Requirements | 12/12 |
| Decisions | 55/55 |
| Edges | 78/78 |
| UI truths | 8/8 |
| Prohibitions | 3/3 |

## Task Commits

1. **Evidence harness, benchmark contracts, coverage, and CI** — `a53d242`, `f43a071`, `067e060`, `23778af`, `2ee4f81`
2. **Exact-APK native and installed-flow hardening** — `a56d67d` through `399276e`
3. **Bounded benchmark result transport and final evidence** — `2dd072d`

The plan required iterative exact-APK diagnosis. Every implementation, test, YAML, and script correction was committed before the final build; no source changed after evidence production began.

## Decisions Made

- Kept SQLite source facts authoritative throughout; FTS, recommendations, screens, and evidence are derivative or replayable.
- Preserved the D-55 `Gym Body-Part Split` contract exactly: Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, Friday Arms, four weighted `load_reps` exercises daily, equipment-first, no bodyweight substitutions.
- Treated native benchmark cleanup as process ownership rather than explicit Expo SQLite close because explicit close triggered native statement double-finalization.
- Retained successful benchmark recovery-validation kernels with explicit strong references while normal recovery and invalid validation still close kernels.
- Kept benchmark samples intact and fixed Android logcat transport at the boundary rather than weakening performance evidence.

## Deviations from Plan

### Auto-Fixed Issues

**1. Installed-flow viewport and route-retention gaps**
- **Found during:** Task 3 Maestro execution
- **Issue:** Long screens, retained scroll offsets, keyboards, and asynchronous route refreshes made logically correct controls unreachable or stale on the compact emulator.
- **Fix:** Added public-semantic viewport moves, readiness waits, exact action IDs, and fresh authoritative route reopen steps.
- **Verification:** All 16 installed Maestro flows pass.

**2. Generated workout IDs exceeded metric-candidate validation**
- **Found during:** Partial-workout installed flow
- **Issue:** Accepted starter IDs recursively produced session/set IDs longer than the prior 128-character candidate bound, causing transaction rollback.
- **Fix:** Preserved an explicit 256-character bound and added regression coverage.
- **Verification:** Native, integration, and installed partial-workout evidence pass.

**3. Legacy plan activation omitted v6+ metric identity**
- **Found during:** On-device benchmark migration
- **Issue:** Retained activation inserts violated v10 non-null metric identity columns.
- **Fix:** Added capability-conditional complete identity inserts while preserving legacy schema shapes.
- **Verification:** Fresh v0-to-v10 host regression and final benchmark pass.

**4. Expo SQLite benchmark cleanup double-finalized native statements**
- **Found during:** On-device benchmark execution
- **Issue:** Explicit benchmark kernel close caused native `exsqlite3_finalize`/`sqlite3_close` allocator failure.
- **Fix:** Scoped benchmark kernels to the process, retained successful recovery validation kernels, and force-stopped the app from the host.
- **Verification:** Final 100-sample benchmark completes without native crash.

**5. Android logcat truncated benchmark JSON**
- **Found during:** Final benchmark evidence
- **Issue:** The single result line truncated near 4,076 characters.
- **Fix:** Added bounded versioned indexed result chunks and fail-closed host reassembly.
- **Verification:** Direct large-payload regression and final device benchmark pass.

---

**Total deviations:** 5 auto-fixed
**Impact on plan:** All changes were required to prove the written exact-APK contract; no requirement, threshold, sample, or safety gate was weakened.

## Issues Encountered

- Gradle emitted existing dependency deprecation and Android SDK XML compatibility warnings; the release build completed successfully.
- Jest emitted the existing non-fatal Expo Go remote-notification warning; all suites passed.
- The shell emitted the existing non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands.

## Known Stubs

None. All referenced commands, producers, fixtures, native routes, installed flows, and evidence files are real and executed.

## Threat Review

- T-02-01 through T-02-06 are covered by exact accepted bytes, actual Expo SQLite contracts, immutable source/snapshot assertions, installed journeys, deterministic rebuilds, and exact artifact identities.
- T-02-07 remains bounded: evidence contains hashes, counts, IDs, timing, package, model, API, and ABI; attended evidence will hash the device serial and exclude raw owner data.
- No package, network endpoint, authentication surface, arbitrary SQL input, or production-only route was added.

## Verification

- `node --test scripts/phase2-evidence-scripts.test.mjs` — PASS, 25/25.
- `npm run typecheck` — PASS.
- `npm run lint` and `npm run check:boundaries` — PASS, 159 files.
- Unit, component, SQLite-host, and integration suites — PASS, 1,536/1,536.
- `npm run test:coverage -- --runInBand` — PASS, global functions 90.11%, 62 integrity-critical files at 100% all metrics.
- `npm run android:devtest:fresh -- --suite phase2` — PASS, retained/installed SHA-256 match.
- Aggregate native suite — PASS, 57/57.
- Phase 1+2 Maestro — PASS, 16/16.
- Phase 2 benchmark — PASS, 2/2 measurements and 200/200 samples.
- Temp-copy artifact roundtrip — PASS.
- Automated-only final gate — PASS: 12/12, 55/55, 78/78, 8/8, 3/3.

## User Setup Required

None for automated evidence. Plan 02-22 requires attended approval of the exact unchanged APK before the terminal physical-required verifier.

## Next Phase Readiness

- Plan 02-22 can begin from complete unchanged automated evidence without rerunning any producer or rebuilding.
- Attended approval must bind to the exact identities above and cover compact, medium, expanded, landscape, 200% text, keyboard/D-pad, focus, reduced motion, non-color, 48dp, all eight UI truths, and all three prohibitions.
- After `physical-result.json` is approved, the physical-required verifier must be the sole and final evidence command.
- `.gsd/dispatch-isolation-sentinel.json` remains byte-identical and untouched.

## Self-Check: PASSED

- `02-21-SUMMARY.md` exists.
- All four automated evidence JSON files exist and parse.
- Exact implementation, source, retained, copied, installed, package, API, ABI, and model identities agree.
- Automated verification reports 12/12 requirements, 55/55 decisions, 78/78 edges, 8/8 UI truths, and 3/3 prohibitions.
- No `physical-result.json` or `final-verification.json` was created.
- `.gsd/dispatch-isolation-sentinel.json` retains SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-20*
