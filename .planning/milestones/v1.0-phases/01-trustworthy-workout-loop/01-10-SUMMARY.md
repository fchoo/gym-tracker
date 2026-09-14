---
phase: 01-trustworthy-workout-loop
plan: 10
subsystem: workout
tags: [outcomes, progression, offline, maestro, performance, argon2, physical-device, android]

requires:
  - phase: 01-08
    provides: Exactly-once working-set completion, immutable workout snapshots, value sources, warm-up exclusion, Retry, and Undo
  - phase: 01-09
    provides: Timestamp-derived rest, notification reconciliation, lifecycle recovery, and exact-APK process-death evidence
provides:
  - Explicit completed, partial, resumable, discarded, skipped-exercise, zero-set, manual-visit, and Removed outcome rules
  - Immutable factual completion and session-detail queries with optional effort and no aggregate kilogram-volume headline
  - Deterministic load/reps recommendation evidence with revision-checked accept, keep, invalidate, and supersede behavior
  - Three exact-APK Maestro flows covering recovery, notification edge cases, rotation, and repeated airplane-mode workouts
  - Source-digest-bound native SQLite, benchmark, artifact round-trip, and physical-device evidence
  - Samsung physical approval for adaptive layouts, 200% text, D-pad/Enter, appearance, OLED-safe performance, and Argon2id
affects: [02-owned-library-planning, 03-calendar-history, 04-progress-progression, 05-recovery-release]

actuals:
  tokens: 137192
  tasks: 3
  commits: 30

tech-stack:
  added: []
  patterns:
    - Explicit source outcome transitions with immutable completion snapshots
    - Versioned stored recommendation evidence plus copied-target revision checks
    - One exact embedded release development-test APK bound to HEAD and source-tree SHA-256
    - Headless physical runners that fail closed unless the OLED reports OFF and -1.0 brightness
    - Reversible Samsung AOD and charging-policy wrappers around unattended physical checks

key-files:
  created:
    - src/domains/workout/outcomes.ts
    - src/domains/workout/finishWorkout.ts
    - src/domains/workout/sessionDetail.ts
    - src/domains/progression/loadRepsV1.ts
    - src/domains/progression/recommendationCommands.ts
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - src/ui/screens/WorkoutCompletionScreen.tsx
    - src/ui/screens/SessionDetailScreen.tsx
    - src/ui/components/RecommendationSurface.tsx
    - maestro/smoke/phase1-full-loop.yaml
    - maestro/smoke/phase1-denied-late-notifications.yaml
    - maestro/smoke/phase1-airplane-repeat.yaml
    - scripts/benchmark-phase1.mjs
    - scripts/run-phase1-maestro.mjs
    - scripts/verify-pr-artifact-roundtrip.mjs
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutLifecycle.ts
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/components/SetRow.tsx
    - src/ui/components/RestDock.tsx
    - src/ui/components/index.ts
    - .github/workflows/pr.yml
    - package.json

key-decisions:
  - "Workout completion remains a committed source fact even when recommendation or summary derivatives fail afterward."
  - "Missing effort after full numerical success produces Hold with Effort not recorded; only Easy or On target can propose a load increase."
  - "Recommendation acceptance updates a copied target only when its stored source revision still matches; otherwise it becomes superseded."
  - "Warm-ups, skipped/invalid sets, incomplete exposures, mismatched metric profiles, and timed holds cannot produce load/reps increase evidence."
  - "The physical runners retain the strict OLED OFF/-1.0 guard; Samsung AOD is changed only temporarily and restored in an exit trap."
  - "TalkBack and Switch Access are outside personal-use v1, while meaningful labels, visible focus, keyboard/D-pad, 200% text, reduced motion, non-color cues, and minimum targets remain required."

patterns-established:
  - "Outcome boundary: partial, zero-set, and discard states require explicit intent; percentages never infer source status."
  - "Recommendation boundary: evidence is immutable and versioned, and an accepted recommendation cannot overwrite a newer manual target."
  - "Artifact boundary: build, native SQLite, Maestro, emulator benchmark, physical benchmark, Argon2, and installed bytes all identify the same retained APK."
  - "Physical safety boundary: unattended work runs headlessly with the OLED fully off and restores device settings and process state on every exit."

requirements-completed: [FOUND-01, WORK-16, WORK-17, WORK-18, REL-02]

coverage:
  - id: D1
    description: "Owner can explicitly complete, partially finish, resume when valid, or destructively discard a workout, including zero-set and skipped-exercise outcomes."
    requirement: WORK-16
    verification:
      - kind: integration
        ref: "tests/integration/workout-outcomes.test.ts"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx"
        status: pass
      - kind: e2e
        ref: "artifacts/native/phase1/maestro-full-loop.xml"
        status: pass
    human_judgment: false
  - id: D2
    description: "Session and exercise statuses use explicit source rules for in-progress, completed, partial, discarded, Removed, manual visit, skipped exercise, and zero-set outcomes."
    requirement: WORK-17
    verification:
      - kind: unit
        ref: "src/domains/workout/outcomes.test.ts"
        status: pass
      - kind: integration
        ref: "tests/integration/workout-outcomes.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Completion and basic detail show factual duration, exercise and working-set counts, metric-appropriate results, optional effort, and useful next actions."
    requirement: WORK-18
    verification:
      - kind: integration
        ref: "tests/integration/workout-outcomes.test.ts"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx"
        status: pass
      - kind: e2e
        ref: "artifacts/native/phase1/maestro-full-loop.xml"
        status: pass
    human_judgment: false
  - id: D4
    description: "The complete Full Body Foundation critical path runs repeatedly without an account or network, including recovery and explicit recommendation decisions."
    requirement: FOUND-01
    verification:
      - kind: e2e
        ref: "artifacts/native/phase1/maestro-airplane.xml"
        status: pass
      - kind: e2e
        ref: "artifacts/native/phase1/maestro-full-loop.xml"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every reviewed PR gate runs in order against one exact implementation APK, with native SQLite, Maestro, benchmark, artifact round-trip, and artifact-neutral closeout drift recorded explicitly."
    requirement: REL-02
    verification:
      - kind: other
        ref: "npm run ci:pr"
        status: pass
      - kind: other
        ref: "npm run verify:artifact-roundtrip -- artifacts/native/phase1"
        status: pass
      - kind: other
        ref: "artifacts/native/phase1/result.json"
        status: pass
    human_judgment: false
  - id: D6
    description: "The exact retained APK passes Samsung adaptive, 200% text, D-pad/Enter, appearance, performance, and Argon2id checks while unattended runs keep the OLED off."
    requirement: REL-02
    verification:
      - kind: manual_procedural
        ref: "artifacts/native/phase1/attended/physical-result.json"
        status: pass
      - kind: other
        ref: "artifacts/native/phase1/benchmark-physical.json"
        status: pass
      - kind: other
        ref: "artifacts/native/phase1/argon2-physical.json"
        status: pass
    human_judgment: false

duration: 17h 45m elapsed across attended checkpoint
completed: 2026-08-17
status: complete
---

# Phase 1 Plan 10: Workout Loop Closure Summary

**Explicit workout outcomes, factual completion, revision-safe double progression, repeated offline recovery, and exact-APK Samsung approval now close the trustworthy workout loop**

## Performance

- **Duration:** 17h 45m elapsed across the attended physical checkpoint
- **Started:** 2026-08-16T08:23:25Z
- **Completed:** 2026-08-17T02:08:44Z
- **Tasks:** 3
- **Files modified:** 99 implementation and test files since Plan 01-09
- **Implementation/evidence commits:** 30
- **Final host tests:** 613 passed

## Accomplishments

- Implemented explicit outcome transitions, immutable completion and detail models, optional effort, and source-authoritative rollback behavior for completed, partial, resumable, discarded, skipped, zero-set, manual, and Removed states.
- Implemented `load_reps.double_progression.v1` with complete evidence, warm-up/comparability exclusions, bounded Hold/increase/Retry behavior, and source-revision-safe accept/keep/supersede commands.
- Bound the complete native proof to HEAD `4e3e5211f039f6445b8e963ab97eda4ce96c6e18`, source tree `34f15295372882e478acf65a11e687d4141a7fbd4928fb55eb9225267e944acc`, and APK `220e46ae5760d36ec45a3f8c4909b703a446abd494aa08a8e9e1f57c0a74721b`.
- Passed native Expo SQLite `10/10`, three Maestro flows, three repeated airplane-mode workout lifecycles, the 100-sample emulator benchmark, and artifact upload/download round-trip verification.
- Passed the Samsung SM-S916B physical checkpoint: System/Light/Dark, compact/medium/expanded equivalents, landscape, 200% text, reduced motion, D-pad focus and Enter activation, visible `Library`, 100-sample performance, and ten-sample Argon2id KAT/log-scan calibration.

## Task Commits

The plan was delivered incrementally through focused test, implementation, evidence, accessibility, and physical-runner commits:

1. **Outcomes and progression:** `a424ebf`, `6ffc9bf`
2. **Complete exact-APK proof:** `8e9a94d`, `0295573`, `0d11c76`, `ed67f44`, `68afb8e`, `12b92fc`, `bcbafe1`, `4feb1ee`
3. **Physical checkpoint tooling:** `276e459`, `3b36566`, `81f5635`
4. **Compact workout and startup readiness:** `6aa4b68`, `faf5b9a`, `bca3eb4`, `0edb305`, `8ece539`, `31f6bea`, `9bd3835`
5. **Performance and lifecycle hardening:** `4ba1a7d`, `bb1852c`, `c41eb0c`, `696cc3b`, `f8d25b3`
6. **Final scope and device regressions:** `5647025`, `8fb4983`, `48b8c4f`, `a26cf1d`, `4e3e521`

## Files Created/Modified

- `src/domains/workout/outcomes.ts` — explicit source statuses and transition rules.
- `src/domains/workout/finishWorkout.ts` — completed, partial, zero-set, resume, and discard orchestration.
- `src/domains/workout/sessionDetail.ts` — immutable factual completion/detail contracts.
- `src/domains/progression/loadRepsV1.ts` — deterministic Phase 1 load/reps rule.
- `src/domains/progression/recommendationCommands.ts` — revision-safe acceptance and supersede lifecycle.
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` — atomic outcome, effort, detail, and recommendation persistence.
- `src/ui/screens/WorkoutCompletionScreen.tsx` — factual completion and optional recommendation decision.
- `src/ui/screens/SessionDetailScreen.tsx` — read-only immutable workout detail.
- `src/ui/components/SetRow.tsx` — compact cohesive inline warm-up and working-set controls.
- `src/ui/components/index.ts` — startup readiness, root navigation, focus, and label-clipping hardening.
- `scripts/benchmark-phase1.mjs` — emulator and physical 100-sample commit+dock benchmark.
- `scripts/run-argon2-feasibility.mjs` — exact-APK physical Argon2 calibration, KAT, and secret-log scan.
- `scripts/run-phase1-maestro.mjs` — deterministic exact-device execution of all three Phase 1 flows.
- `scripts/verify-pr-artifact-roundtrip.mjs` — complete artifact identity and result binding.

## Decisions Made

- A committed workout outcome is never rolled back or hidden because a post-commit summary, recommendation, invalidation, or notification derivative fails.
- Recommendation evidence records the current and proposed target plus the source target revision. Acceptance is one transaction and stale acceptance becomes `superseded`.
- Full numerical success without effort holds the current load with reason `Effort not recorded`; only `Easy` or `On target` can propose one configured increment.
- Physical evidence stores only a SHA-256 of the device serial plus non-sensitive model/API/ABI/free-memory metadata.
- The OLED guard remains strict. Samsung AOD and charging stay-awake are temporarily disabled only inside an exit-trapped wrapper and restored after each unattended run.
- TalkBack and Switch Access are not personal v1 prerequisites. Touch, keyboard/D-pad, focus, labels, 200% text, reduced motion, non-color cues, and minimum target sizes remain in scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed orphaned rest alerts after finish**
- **Issue:** Completion could leave a stale platform rest request after source rest was cleared.
- **Fix:** Routed finish/discard through the existing SQLite-authoritative reconciliation seam.
- **Verification:** notification lifecycle tests and denied/missing/late/stale Maestro flow.
- **Committed in:** `bcbafe1`

**2. [Rule 3 - Blocking] Made the complete native flow deterministic**
- **Issue:** Third-set visibility, end-of-scroll centering, stale device readiness, and inline-field flush timing made a correct flow nondeterministic.
- **Fix:** Added semantic scroll boundaries, explicit inline flush, deterministic field replacement, and strict device normalization.
- **Verification:** all three final Maestro flows passed against the retained APK.
- **Committed in:** `ed67f44`, `68afb8e`, `12b92fc`, `31f6bea`, `9bd3835`, `a26cf1d`, `4e3e521`

**3. [Rule 2 - Missing Critical] Added OLED-safe physical execution**
- **Issue:** A visible app activity would burn the Samsung OLED during long performance and KDF runs.
- **Fix:** Added a release-only development-test Headless JS service, temporary idle allowlisting, exact installed-byte checks, and fail-closed `OFF/-1.0` display assertions.
- **Verification:** physical benchmark and Argon2 runs completed with the display off and restored AOD/charging settings.
- **Committed in:** `81f5635`

**4. [Rule 1 - Bug] Preserved appearance and accessible input behavior**
- **Issue:** Explicit appearance could be lost after process death, sheet focus could drift, and compact controls needed consistent touch/keyboard/D-pad behavior.
- **Fix:** Added SQLite-backed appearance preference, focus restoration, compact shared set actions, and stable completion hooks.
- **Verification:** component suites and attended System/Light/Dark plus D-pad captures.
- **Committed in:** `bb1852c`, `c41eb0c`, `696cc3b`

**5. [Rule 1 - Bug] Prevented Samsung custom-font glyph clipping**
- **Issue:** The full semantic string `Library` rendered visually as `Librar` on Samsung because the final glyph overhang had no horizontal breathing room.
- **Fix:** Added 4dp horizontal tab-label padding and a focused regression assertion.
- **Verification:** exact fixed APK installed-byte match; screenshot OCR reads `Today Calendar Library Progress`.
- **Committed in:** `48b8c4f`

---

**Total deviations:** 5 focused correctness and evidence fixes.
**Impact on plan:** Every deviation tightened the reviewed workout, accessibility, artifact, or physical-safety contract. No Phase 2 catalog/planning, Phase 3 history mutation, Phase 4 analytics, or Phase 5 backup/release product scope was pulled forward.

## Issues Encountered

- Two early physical benchmark attempts exceeded p95 150 ms. They were retained as ignored evidence; a clean normal-policy run passed without changing thresholds.
- Samsung AOD could report `DOZE` with non-zero brightness even after `KEYCODE_SLEEP`. The final wrappers temporarily set `aod_mode=0`, verify `OFF/-1.0`, and restore the original value in a trap.
- The phone initially retained a pre-fix APK after the Library change. Comparing installed APK bytes to `build.json` exposed the stale install; installing the exact retained APK resolved it.
- Maestro `centerElement: true` was impossible for Set 3 at the bottom scroll boundary even though the field was visible. Removing only the impossible centering requirement preserved semantic visibility and made the flow deterministic.

## User Setup Required

None. Notification permission remains optional and non-authoritative; the app can be used fully offline without an account.

## Final Automated Evidence

- `npm run ci:pr` — PASS.
- Host tests — 613 passed.
- Coverage — 92.9% statements, 88.7% branches, 91.21% functions, 93.38% lines.
- Integrity-critical coverage — 28 explicitly enumerated modules at 100% statements, branches, functions, and lines.
- Native Expo SQLite — 10/10 in `artifacts/native/phase1/result.json`.
- Maestro — 3/3 in `artifacts/native/phase1/maestro.json`.
- Emulator benchmark — 100 samples, p95 31.077540999278426 ms, maximum JS task 0.0007499996572732925 ms.
- Artifact round trip — PASS for the retained APK and every bound result.

## Physical Device Evidence

- **Device:** Samsung SM-S916B, Android 16/API 36, `arm64-v8a`.
- **Serial:** stored only as SHA-256 `406b20b89265d01a6aa563ea116949bfe4137a0a9b408d92b58643568502ec19`.
- **Installed APK:** exact SHA-256 match `220e46ae5760d36ec45a3f8c4909b703a446abd494aa08a8e9e1f57c0a74721b`.
- **Attended capture:** System, Light, Dark, compact, medium, expanded, landscape, 200% text, reduced motion, D-pad focus, and Enter activation captured in `artifacts/native/phase1/attended/`.
- **200% navigation:** all four complete labels remain visible, in bounds, and non-overlapping; long one-word labels wrap within their own tab.
- **Physical benchmark:** 100 samples, p95 145.57328099012375 ms, maximum JS task 0.005104005336761475 ms.
- **Argon2id:** 32,768 KiB, 2 iterations, parallelism 1; 10 samples, median 427 ms; KAT, responsiveness, packaged-library inspection, and secret-log scan passed.
- **OLED safety:** benchmark and Argon2 runners continuously enforced `Display State=OFF` and `Display Brightness=-1.0`; AOD and charging policy restored to their original values afterward.

## Threat Flags

None. Outcome revision conflicts, stale recommendation acceptance, invalid evidence, notification authority, APK drift, physical serial privacy, secret logging, KDF weakening, performance regression, and OLED exposure all have explicit tested mitigations.

## Next Phase Readiness

- Phase 2 can build the combined Library and Planning experience on source-authoritative copied plans, immutable workout snapshots, exact metric profile seams, and the proven migration/writer/effect architecture.
- The current physical approval is for the Phase 1 development-test artifact only; future source changes require a new exact-HEAD build and applicable regression evidence.
- Phase 2 has no context or plans yet. Start a new session with `/gsd-resume-work`, then use `/gsd-discuss-phase 2`.

## Self-Check: PASSED

- All ten Phase 1 plans now have summaries.
- The retained build, source tree, APK, native SQLite, Maestro, emulator benchmark, physical benchmark, Argon2, and installed Samsung bytes share one exact identity.
- Every required physical capture exists and the phone finished with AOD `1`, charging stay-awake `2`, app force-stopped, and the panel `OFF/-1.0`.
- The worktree was clean before creating this summary, and generated `android/`/`ios/` remain untracked.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-17*
