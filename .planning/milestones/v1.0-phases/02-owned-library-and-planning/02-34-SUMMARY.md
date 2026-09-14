---
phase: 02-owned-library-and-planning
plan: 34
subsystem: native-evidence
tags: [android, expo-sqlite, maestro, benchmark, artifact-roundtrip, exact-head]
requires:
  - phase: 02-owned-library-and-planning/02-33
    provides: source-derived native, Maestro, benchmark, roundtrip, and verifier contracts
provides:
  - One immutable development-test release APK bound to the final remediation HEAD
  - Complete exact-byte native SQLite, Maestro, benchmark, and roundtrip evidence
  - Automated-only Phase 2 seal with attended and final evidence explicitly absent
affects: [plan-02-35, attended-verification, terminal-seal]
tech-stack:
  added: []
  patterns:
    - Initial schedule versions predate prospective edits so installed calendar journeys preserve strict version ordering
    - Long editable workout forms use bounded right-edge swipes followed by explicit visibility assertions
    - Every native producer verifies one shared HEAD, source digest, package, APK hash, size, and installed-byte identity
key-files:
  created:
    - .planning/phases/02-owned-library-and-planning/02-34-SUMMARY.md
  modified:
    - maestro/phase2/custom-exercise-lifecycle4-profile-migration.yaml
    - maestro/phase2/remediation-inputs-cards-navigation.yaml
    - maestro/phase2/remediation-workout.yaml
    - maestro/phase2/schedule-cross-profile.yaml
    - scripts/benchmark-phase2.mjs
    - scripts/phase2-evidence-scripts.test.mjs
    - scripts/run-native-sqlite-contracts.mjs
    - scripts/run-phase2-maestro.mjs
    - scripts/verify-phase2-native-evidence.mjs
key-decisions:
  - "The accepted Phase 2 candidate is HEAD 6fec7acf126dbc347a8d41e10dec7996f640660f with mode-sensitive source digest fb70667684613a933d94522bbc08494c563e382a281181cf2e2150023abfd09c."
  - "Schedule evidence activates a prior-month version and edits it prospectively from today, preserving the strict later-effective-date domain invariant."
  - "A completed benchmark may be rerun on unchanged APK bytes after emulator stabilization; thresholds, sample count, source, and artifact identity may not change."
requirements-completed: [LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12]
coverage:
  - id: D1
    description: One exact-HEAD embedded release development-test APK is retained, 16KiB aligned, installed, and byte-identical on the API 36 arm64 emulator.
    requirement: LIB-04
    verification:
      - kind: other
        ref: artifacts/native/phase2/build.json
        status: pass
    human_judgment: false
  - id: D2
    description: All source-derived host, native SQLite, installed-flow, performance, and artifact-roundtrip gates pass on the unchanged candidate.
    requirement: LIB-12
    verification:
      - kind: integration
        ref: npm run verify:native:phase2 -- --manifest artifacts/native/phase2/build.json --automated-only --require-roundtrip
        status: pass
    human_judgment: false
  - id: D3
    description: The exact candidate is ready for separate emulator and Samsung attended review without inferring physical approval.
    requirement: LIB-01
    verification:
      - kind: other
        ref: artifacts/native/phase2/artifact-roundtrip.json
        status: pass
    human_judgment: true
    rationale: Physical touch, OLED, motion, tone, haptic, and owner judgment remain exclusively assigned to Plan 02-35.
actuals:
  tokens: 7591
  tasks: 3
  commits: 8
duration: 18h 27m elapsed
completed: 2026-08-24
status: complete
---

# Phase 02 Plan 34: Exact-HEAD Automated Evidence Summary

**One immutable Phase 2 Android candidate now carries complete host, SQLite, installed-flow, performance, and roundtrip proof while physical approval remains absent.**

## Performance

- **Duration:** 18h 27m elapsed
- **Started:** 2026-08-23T22:24:19+08:00
- **Completed:** 2026-08-24
- **Tasks:** 3
- **Tracked implementation/harness files modified:** 9
- **Generated evidence artifacts:** 7
- **APK builds after the final frozen HEAD:** 1

## Immutable Candidate Identity

| Field | Value |
|---|---|
| Implementation HEAD | `6fec7acf126dbc347a8d41e10dec7996f640660f` |
| Mode-sensitive source digest | `fb70667684613a933d94522bbc08494c563e382a281181cf2e2150023abfd09c` |
| Package | `com.fchoo.gymtracker.devtest` |
| APK SHA-256 | `1544e4a428375decb23b378ceab8d91000849e1931e68dce4bd6931272330365` |
| APK size | `118392842` bytes |
| APK alignment | 16 KiB verified |
| Build/automated device | `emulator-5554`, `sdk_gphone64_arm64`, Android 16 / API 36, `arm64-v8a` |
| Installed APK | SHA-256 matched retained APK |

## Accomplishments

- Froze the final implementation and harness at one clean commit after correcting long-form Maestro traversal, bounded producer transport, schedule version dates, and the complete installed schedule journey.
- Built exactly one embedded-JS development-test release APK from that HEAD and retained byte-identical installed and artifact copies.
- Passed all 64 actual Expo SQLite cases, all 20 source-enumerated Maestro executions, both 100-sample benchmarks, temporary-copy roundtrip validation, and the source-derived automated-only verifier.
- Preserved the evidence boundary: attended emulator/Samsung results and `final-verification.json` are absent until Plan 02-35 receives explicit human approval.

## Verification Results

| Gate | Result |
|---|---|
| TypeScript, lint, boundaries | PASS |
| Host suites | 94/94 suites; 1,798/1,798 tests |
| Global coverage | 91.33% statements; 87.65% branches; 90.53% functions; 91.51% lines |
| Integrity-critical coverage | 67/67 files at 100% statements, branches, functions, and lines |
| Evidence-script checks | 54/54 |
| Actual Expo SQLite | 64/64 passed; 0 failed; 0 skipped |
| Maestro | 20/20 flows and tests; 0 failures; 0 errors; 0 skipped |
| Search benchmark | 100/100; p50 4.513 ms; p95 5.407 ms; max JS task 0.0013 ms |
| Working-set commit benchmark | 100/100; p50 32.467 ms; p95 34.698 ms; max JS task 0.0010 ms |
| Artifact roundtrip | retained = copied = installed = manifest SHA-256 |
| Automated-only verifier | 12/12 requirements; 67/67 decisions; 76/76 edges; 8/8 UI truths; 3/3 prohibitions |

## Task Commits

1. **Task 1: Freeze a clean implementation HEAD after all host gates** — `5e41e98`, `da8c638`, `787dfdb`, `33d4b87`, `879226b`, `985eb76`, `d35583e`, `6fec7ac`.
2. **Task 2: Build exactly one Phase 2 APK and run all producers** — generated ignored artifacts on the unchanged `6fec7ac` candidate; no source commit.
3. **Task 3: Seal automated-only evidence and hand off exact identities** — this planning-only metadata commit; no APK/source-digest change.

## Decisions Made

- Retained the strict schedule rule that every replacement version begins after the preceding version. The installed journey now activates from the previous month and edits from today through `CalendarField`.
- Reused the established bounded right-edge swipe pattern for editable workout rows so gestures cannot be consumed by numeric fields. Every loop ends in an explicit assertion.
- Accepted the second benchmark run only because APK, manifest, HEAD, source digest, sample count, and thresholds were unchanged and the emulator was idle with normal thermal status.

## Deviations from Plan

### Auto-fixed Issues

**1. Aggregate flows needed viewport-safe traversal and bounded readiness.**

- **Found during:** Task 1 and the initial diagnostic producer runs.
- **Issue:** Several long forms and startup transitions could stall on off-screen actions or editable controls.
- **Fix:** Added bounded waits and right-edge swipe loops with explicit terminal assertions.
- **Files modified:** Maestro flows plus the source-owned evidence-script regression suite.
- **Verification:** Full host gate and all 20 final Maestro executions passed.

**2. Schedule editing reused the initial same-day version date.**

- **Found during:** Task 1 full schedule-flow replay.
- **Issue:** `stageVersion()` correctly rejected an edit whose effective date equaled the existing version date.
- **Fix:** The installed journey activates the initial version on the first day of the previous month, then confirms today as the prospective edit date through `CalendarField`.
- **Files modified:** `maestro/phase2/schedule-cross-profile.yaml`, `scripts/phase2-evidence-scripts.test.mjs`.
- **Verification:** The full schedule/timezone/override/cross-profile journey passed in 5m05s before commit and 5m19s in the final aggregate.

**3. The first final-candidate benchmark run observed transient emulator contention.**

- **Found during:** Task 2 benchmark producer.
- **Issue:** Search passed, but working-set commit p95 was 197.348 ms while the host was busy; the producer failed closed and wrote no accepted report.
- **Fix:** No code, APK, threshold, or sample change. After the emulator and host became idle with normal thermal status, the unchanged-byte rerun passed at p95 34.698 ms.
- **Verification:** `benchmark.json` records 100/100 samples for both measurements and the automated-only verifier accepts it.

**Total deviations:** 3 evidence-harness and execution corrections.
**Impact on plan:** All changes preserve or strengthen the planned fail-closed evidence boundary; no attended result or physical approval was inferred.

## Issues Encountered

- The first aggregate native launch encountered the known Expo SQLite cold-start race on a diagnostic attempt; ordinary-launch prewarming and a controlled app-data reset produced the final 64/64 result without changing APK bytes.
- A prior schedule flow selected the current date for both activation and edit, which violated strict prospective version ordering. The final scenario uses two distinct civil dates and passes end to end.
- The initial final-candidate performance sample was collected under transient host/emulator contention and failed its threshold. One unchanged-byte stabilized rerun passed with a tight 29.4–36.6 ms working-set distribution.

## User Setup Required

Samsung `SM-S916B` must be connected for Plan 02-35 attended preparation and physical review. No other setup is required.

## Next Phase Readiness

- Plan 02-35 can install this exact retained APK on the API 36 emulator and Samsung without rebuilding.
- The trusted attended checklist must be generated from the canonical ledgers only after both devices are connected.
- `attended/emulator-supplementary.json`, `attended/physical-result.json`, and `final-verification.json` remain absent.

## Self-Check: PASSED

- The tracked tree contains no uncommitted source change; only the protected untracked `.gsd/dispatch-isolation-sentinel.json` remains and its SHA-256 is unchanged at `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.
- Every remediation commit from the Plan 02-33 closeout through candidate HEAD has exactly one `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- All seven required generated artifacts exist, match the immutable candidate identity, and passed automated-only verification.
- No attended role record or final verification artifact exists.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-24*
