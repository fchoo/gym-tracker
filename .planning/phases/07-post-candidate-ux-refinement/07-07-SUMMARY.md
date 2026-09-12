---
phase: 07-post-candidate-ux-refinement
plan: 07
subsystem: native-audio
tags: [expo-audio, expo-sdk-57, react-hooks, pcm-wav, rest-countdown]
requires:
  - phase: 07-post-candidate-ux-refinement
    provides: owner-approved UX-21 native rest-countdown audio direction
provides:
  - Official Expo SDK 57 local-audio dependency with reviewed lockfile identity
  - Hook-shaped non-authoritative short and long rest countdown cue port
  - Deterministic bundled PCM WAV assets with header, duration, and hash coverage
affects: [07-04-active-workout-ux, 07-10-native-evidence, cng, android-build]
actuals:
  tokens: 12815
  tasks: 3
  commits: 3
tech-stack:
  added: [expo-audio@57.0.4]
  patterns: [hook-owned local audio players, bounded best-effort feedback, deterministic PCM asset verification]
key-files:
  created:
    - src/domains/rest/restCountdownCuePort.ts
    - src/platform/audio/expoRestCountdownCueAdapter.ts
    - src/platform/audio/expoRestCountdownCueAdapter.test.ts
    - assets/audio/rest-cue-short.wav
    - assets/audio/rest-cue-long.wav
  modified:
    - package.json
    - package-lock.json
    - src/domains/rest/index.ts
key-decisions:
  - "Accepted the explicit owner-approved Expo Audio legitimacy checkpoint: official expo/expo package 57.0.4, SDK-compatible range, no postinstall, recency-only SUS."
  - "Use hook-owned local asset players with only playShortCue/playLongCue operations; audio failures resolve silently and cannot issue rest commands."
  - "Use deterministic mono 44.1 kHz 16-bit PCM WAV cues: 880 Hz / 120 ms for 3-2-1 and 523.25 Hz / 360 ms for zero."
patterns-established:
  - "Lifecycle-safe audio adapters call useAudioPlayer inside a React hook and expose a narrow domain port."
  - "Source-controlled audio assets carry reproducibility checks for RIFF/WAVE fields, duration, and SHA-256."
requirements-completed: [UX-21]
coverage:
  - id: D1
    description: Hook-owned non-authoritative short and long local countdown playback port
    requirement: UX-21
    verification:
      - kind: unit
        ref: src/platform/audio/expoRestCountdownCueAdapter.test.ts#creates hook-owned players and replays the short and long cues without throwing
        status: pass
      - kind: unit
        ref: src/platform/audio/expoRestCountdownCueAdapter.test.ts#contains a player failure so playback cannot become rest authority
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
  - id: D2
    description: Deterministic local short and terminal PCM WAV cue assets
    requirement: UX-21
    verification:
      - kind: unit
        ref: src/platform/audio/expoRestCountdownCueAdapter.test.ts#keeps the deterministic PCM assets distinct and source-controlled
        status: pass
      - kind: other
        ref: git diff --check and npm ls expo-audio
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-09-06
status: complete
---

# Phase 07 Plan 07: Native Rest Countdown Audio Core Summary

**Expo SDK 57 hook-owned local audio port with deterministic 3-2-1 and terminal PCM WAV countdown cues, isolated from rest authority.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-06T14:31:26Z
- **Completed:** 2026-09-06T14:37:43Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- Recorded the parent-provided approval for the blocking `expo-audio` legitimacy checkpoint; the official Expo SDK 57 `expo/expo` module was installed at exact version `57.0.4`, with no lockfile install script or transitive package dependency.
- Added `RestCountdownCuePort` and `useExpoRestCountdownCueAdapter`, which uses React-lifecycle-owned local asset players and only exposes best-effort short/long playback.
- Bundled deterministic, source-controlled mono PCM WAV cues: a 120 ms 880 Hz short cue and a 360 ms 523.25 Hz terminal cue, each guarded by RIFF/WAVE, duration, and SHA-256 tests.

## Task Commits

Each task was committed atomically:

1. **Task 2 RED: Define failing hook-owned cue contract** - `cf717b2` (test)
2. **Task 2 GREEN: Install Expo Audio and define the hook-shaped port** - `d849619` (feat)
3. **Task 3: Generate deterministic local short and long tones** - `1cebfb0` (feat)

## Files Created/Modified

- `package.json` and `package-lock.json` - direct official `expo-audio@57.0.4` dependency with resolved integrity metadata.
- `src/domains/rest/restCountdownCuePort.ts` and `src/domains/rest/index.ts` - narrow playback-only domain boundary.
- `src/platform/audio/expoRestCountdownCueAdapter.ts` - hook-safe local player adapter with bounded failure handling.
- `src/platform/audio/expoRestCountdownCueAdapter.test.ts` - lifecycle, replay, failure containment, asset mapping, and deterministic audio integrity tests.
- `assets/audio/rest-cue-short.wav` and `assets/audio/rest-cue-long.wav` - deterministic local 44.1 kHz 16-bit PCM cue pair.

## Decisions Made

- The parent explicitly approved the package-legitimacy checkpoint from official Expo SDK 57 documentation and registry evidence; no checkpoint commit was made.
- The adapter deliberately owns players through `useAudioPlayer(require(localAsset))`, avoiding remote media, recording, dynamic tone generation, notification-channel reuse, custom native bridges, and any rest command authority.
- Failure is contained by the adapter so later RestDock integration can show its bounded UI-SPEC message without audio ever changing timer facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Awaited the pinned asynchronous `renderHook` API**
- **Found during:** Task 2 (Install Expo Audio and define the hook-shaped port)
- **Issue:** `@testing-library/react-native@14.0.1` returns a `Promise<RenderHookResult>`; reading `result.current` synchronously caused focused-test and typecheck failures.
- **Fix:** Awaited `renderHook(...)` in the adapter tests before invoking the port.
- **Files modified:** `src/platform/audio/expoRestCountdownCueAdapter.test.ts`
- **Verification:** Focused unit suite and `npm run typecheck` pass.
- **Committed in:** `d849619`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required only for the project’s pinned test-library API; no scope expansion or authority change.

## Issues Encountered

- The local shell runs Node 26.8.1/npm 11.19.0 while the repository declares Node 24.19.0/npm 11.17.0. `npm ci` and the approved install completed with only npm’s `EBADENGINE` warning; focused verification passed.

## Verification

- `npm run test:unit -- --runInBand src/platform/audio/expoRestCountdownCueAdapter.test.ts` — passed: 3 tests.
- `npm run typecheck` — passed.
- `npm run check:boundaries src/domains/rest/restCountdownCuePort.ts src/domains/rest/index.ts src/platform/audio/expoRestCountdownCueAdapter.ts` — passed.
- `npm ls expo-audio` — passed: `expo-audio@57.0.4`.
- Lockfile identity / no-install-script inspection and `git diff --check` — passed.

## Known Stubs

None.

## Next Phase Readiness

- Plan 07-04 can inject `useExpoRestCountdownCueAdapter` through the workout route and consume the narrow port from `RestDock`; audio remains supplementary and non-authoritative.
- The native module addition still requires the phase-level clean CNG generation and full Android matrix / physical audible checks owned by later verification work.

---
*Phase: 07-post-candidate-ux-refinement*
*Completed: 2026-09-06*

## Self-Check: PASSED

- All seven planned artifacts exist.
- Task commits `cf717b2`, `d849619`, and `1cebfb0` are present in repository history.
