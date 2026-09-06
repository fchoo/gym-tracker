---
phase: 7
slug: post-candidate-ux-refinement
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-06
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Jest 29.7.0, Jest Expo, React Native Testing Library 14.0.1, host SQLite integration tests, native Expo SQLite contracts, Maestro |
| **Config file** | `jest.config.js`; existing `unit`, `components`, `sqlite-host`, and `integration` projects |
| **Quick run command** | Run the touched Jest file/project plus `npm run typecheck` |
| **Full suite command** | `npm run test:all -- --runInBand` |
| **Estimated runtime** | Focused source tests target under 30 seconds; coverage, CNG, Android, candidate, and device gates run at wave/phase boundaries |
| **Native tooling** | Repository Android scripts, Maestro, ADB from the pinned Android SDK, protected release-candidate workflows |

## Sampling Rate

- **After every behavior task:** Run its focused Jest or Node contract test and `npm run typecheck`.
- **After every implementation wave:** Run `npm run lint`, `npm run check:boundaries`, and the affected Jest projects.
- **Before source verification:** Run `npm run test:all -- --runInBand`, `npm run verify:cng`, and `git diff --check`.
- **Before candidate dispatch:** Run the full release matrix, clean production Android build contract, Phase 7 evidence-contract tests, and emulator/native flows.
- **Before release handoff:** Recompute manifest/APK identities and complete the exact-byte Samsung SM-S916B N4 checklist.
- **Max focused feedback latency:** 30 seconds.

## Per-Requirement Verification Map

| Requirement | Threat Ref | Secure behavior | Test type | Automated command / owner | File state | Status |
|---|---|---|---|---|---|---|
| UX-11 | T-07-UI | Selection remains semantic and focus remains visible without a selected box | component | `npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx` | ✅ extend | ⬜ pending |
| UX-12 | T-07-SCHEDULE | Removed manual rotation actions cannot alter committed-outcome advancement; all start paths remain | component + route | Focused `TodayScreen` and Today route suites | ✅ extend | ⬜ pending |
| UX-13, UX-14 | T-07-UI | A single gear route owns Settings; preference failures revert to persisted values | component + route | Focused Today, Settings, and route suites | ❌ Settings coverage to add | ⬜ pending |
| UX-15, UX-17, UX-19 | T-07-UI | Notices/actions are absent by contract; retained actions keep modal focus and committed semantics | component | `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx` | ✅ extend | ⬜ pending |
| UX-16 | T-07-UI | Required controls stay labelled, 48dp, and ordered at normal and 200% text | component + native | Focused SetRow/component suite plus emulator adaptive evidence | ✅ extend | ⬜ pending |
| UX-18 | T-07-REMOVE | Only the exact incomplete row is removed inside one revision-checked, idempotent exclusive write; failures preserve source facts | unit + sqlite-host + runtime + component | Focused command, repository, runtime, and ActiveWorkout suites followed by coverage | ❌ remove contracts to add | ⬜ pending |
| UX-20 | T-07-REORDER | Reorder changes drafts only; Save remains sole persistence; gesture has keyboard/accessibility equivalents | component + native | Focused plan editor, schedule editor, activation, reduced-motion, and gesture flows | ✅ extend | ⬜ pending |
| UX-21 | T-07-AUDIO, T-07-SC | Audio never changes rest truth and cues are emitted at most once per foreground threshold | unit + component + native | New cue-port tests plus focused RestDock suite and physical audible check | ❌ cue-port tests to add | ⬜ pending |
| UX-22 | T-07-ASSET | Generated assets have exact dimensions, alpha/background, colours, and safe zones; generated Android output is reproducible | contract + CNG + visual | New asset contract test plus `npm run verify:cng` | ❌ asset test to add | ⬜ pending |
| UX-11..UX-22 | T-07-EVIDENCE | Evidence is manifest-bound, privacy-safe, exact-package/exact-APK, and cannot authorize promotion | Node contract + Maestro + attended | Updated evidence-script tests, Phase 7 runner, emulator suite, then Samsung N4 recorder/verifier | ❌ Phase 7 evidence contract to add | ⬜ pending |

## Wave 0 Requirements

- [ ] Add red tests for `removeWarmup` and `removeWorkingSet` across command, repository, runtime, and UI boundaries before implementation.
- [ ] Add a mocked foreground rest-cue port contract for unique short 3/2/1 cues, one long zero cue, Off/paused/background suppression, new-rest reset, and bounded failure.
- [ ] Add deterministic icon-asset contract coverage for all configured images and adaptive/monochrome safe zones.
- [ ] Add Settings-route and IA assertions before moving Appearance/rest/history/data controls.
- [ ] Update Phase 6 evidence scaffolds into Phase 7-labelled candidate contracts before any candidate is built.

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Test instructions |
|---|---|---|---|
| Single-row SetRow ergonomics and More-sheet natural height | UX-16, UX-19 | Real text rendering, thumb reach, and OEM window geometry require native observation | Install the exact Phase 7 candidate on emulator and Samsung; inspect common portrait width, landscape, and Android 200% font scale; verify no overlap/clipping and every target remains reachable |
| Weekday/Rotation touch-hold ordering and reduced-motion feedback | UX-20 | Touch latency, accidental scroll, and OEM accessibility behavior are hardware/runtime concerns | Reorder plan days/exercises and both schedule modes; repeat with reduced motion, keyboard/D-pad, and TalkBack actions; save and reopen to prove persisted order |
| Rest countdown tones | UX-21 | Audible duration/distinction and foreground/background behavior cannot be proven from mocks alone | With Rest sound On, hear short cues at 3/2/1 and a distinct long cue at zero; repeat Off, paused, background/resume, skipped, and a new rest; confirm the visible timer remains authoritative |
| Adaptive/themed launcher and splash icon | UX-22 | OEM masks, themed tinting, and launcher/splash presentation require Android rendering | Inspect standard, multiple adaptive masks, themed monochrome, and splash on the exact candidate; confirm the three ascending bars remain recognizable |
| Exact-byte Samsung N4 acceptance | UX-11..UX-22 | Owner/device judgment and installed-byte binding are not replaceable by source tests | Prepare, record, and verify every Phase 7 N4 row on SM-S916B against the retained candidate manifest/APK hash; do not record Phase 5 owner approval or promote in this step |

## Security Threat References

- **T-07-REMOVE:** stale, replayed, or mismatched remove requests could delete the wrong row or corrupt progress/history. Mitigate with request identity, expected revisions, session/set ownership, an incomplete-only predicate, a repository-owned `BEGIN IMMEDIATE` transaction, and commit-gated UI acknowledgement.
- **T-07-SCHEDULE:** presentation changes could expose a direct state transition that bypasses committed workout completion or save draft order implicitly. Remove only the requested Today controls and keep explicit save/outcome paths authoritative.
- **T-07-AUDIO:** duplicate or failed playback could be mistaken for timer truth. De-duplicate by rest identity/threshold, catch failures, and never call a rest command from audio.
- **T-07-SC:** the native dependency is supply-chain input. Use only the official Expo repository/package, SDK-bundled `~57.0.4` range, reviewed lockfile, absent postinstall, clean CNG, and native matrix.
- **T-07-ASSET:** stale or malformed artwork could produce non-reproducible generated resources. Generate deterministically, validate source pixels/safe zones, and let CNG own Android outputs.
- **T-07-EVIDENCE:** stale screenshots or wrong installed bytes could falsely claim physical acceptance. Bind every producer and attended row to candidate manifest, commit, package, device, and APK hashes; release approval remains a separate owner action.
- **T-07-UI:** inaccessible icon/gesture-only controls can deny operation. Preserve names, state, 48dp targets, focus, D-pad/keyboard, and TalkBack alternatives.

## Validation Sign-Off

- [x] Every Phase 7 requirement has an automated test owner and any native-only assertion has an attended owner.
- [x] No three consecutive implementation tasks may proceed without a focused automated check.
- [x] Wave 0 names each missing contract test before corresponding implementation.
- [x] Commands are non-watch mode.
- [x] Focused feedback target is under 30 seconds.
- [x] `nyquist_compliant: true` is set because all behaviors have explicit source/native evidence owners.

**Approval:** validation architecture complete; implementation evidence pending.
