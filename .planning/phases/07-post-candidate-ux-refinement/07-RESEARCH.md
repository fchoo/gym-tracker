# Phase 7: Post-Candidate UX Refinement — Research

**Researched:** 2026-09-06  
**Domain:** Local-first Expo/React Native interaction refinement, transactional workout mutation, foreground native audio, and Android assets  
**Confidence:** MEDIUM — repository seams are directly inspected; Expo SDK 57 audio documentation is official but the package-legitimacy seam flags the new package as SUS.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Set/warm-up removal = HARD DELETE of the row (new remove command in workout domain + SQLite repository; update progress totals and history snapshot). Not a relabelled skip.
- Removal is available only for non-completed warm-ups and working sets. Completed rows retain their existing correction/undo path so immutable history and committed workout facts are never silently deleted.
- Rest-timer audio = ADD a native audio dependency (expo-audio or expo-av) for in-app beeps; foreground-only cue, not authoritative for rest state. This regenerates the Android project → must pass `verify:cng` + full matrix.
- Day editing remains single-active-day to avoid a long, dense all-days form. Add an unmistakable day switcher that keeps every plan day reachable.
- Long-press drag ordering applies to Weekday and Rotation schedules in both plan activation and owned-plan schedule editing.
- App icon direction is locked to concept G: ascending bars, blue tri-tone. Produce the standard icon plus Android adaptive foreground, background, and monochrome assets from that mark.
- These changes supersede candidate `phase6-20260906-9cdecb8`; a fresh candidate + repeat N4 are accepted.
</user_constraints>

## Summary

Phase 7 is a local native SDK/library integration, not an external network API or service. Keep SQLite facts authoritative: all removal mutation flows from domain command to the existing FIFO `BEGIN IMMEDIATE` writer, then runtime invalidation, then UI acknowledgement. The existing writer serializes commands, begins exclusively, commits before returning, and rolls back failures. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-84]

**Primary recommendation:** Implement the UX slices around the existing repository/runtime/component seams; add only the official Expo SDK 57 `expo-audio` package behind a small foreground cue port, gated by a human package-verification checkpoint because the legitimacy seam returned `SUS`. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/]

## Project Constraints (from .trae/rules/rules.md)

- Keep SQLite source facts authoritative; keep notifications, projections, and recommendations replayable or rebuildable; do not acknowledge a set before its exclusive transaction commits. [VERIFIED: .trae/rules/rules.md:11-15]
- Preserve bundled versus user-owned data boundaries, keep the workout critical path offline, write tests with each behavior, and maintain complete branch coverage for integrity-critical modules. [VERIFIED: .trae/rules/rules.md:15-18]
- The repository’s skill routing requires architecture work to use `gstack-plan-eng-review`; this research applied that routing without changing source. [VERIFIED: AGENTS.md:1-17]

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|---|---|---|
| UX-11 | Selected nav has colour/label state, no selected box, with focus/selected semantics. | Existing `AppTabs` test/surface. [VERIFIED: .planning/REQUIREMENTS.md:97-98] |
| UX-12 | Remove Today repeat/skip/advance without changing valid workout starts or commit-driven rotation. | Today action regression coverage. [VERIFIED: .planning/REQUIREMENTS.md:98-99] |
| UX-13 | Gear opens one Settings route; remove ambiguous header affordances. | Today/route component tests. [VERIFIED: .planning/REQUIREMENTS.md:99-100] |
| UX-14 | Appearance top-level; History/data and recovery reachable from Settings. | Settings ordering/route tests. [VERIFIED: .planning/REQUIREMENTS.md:100-101] |
| UX-15 | Remove non-blocking workout notices and retain one overflow. | Active-workout component/maestro assertions. [VERIFIED: .planning/REQUIREMENTS.md:101-102] |
| UX-16 | Compact set row with load, reps, reset, done, and delete; reflow at 200%. | SetRow component plus native gate. [VERIFIED: .planning/REQUIREMENTS.md:102-103] |
| UX-17 | Header-aligned add reuses previous values; no copy-warmup action. | Active-workout regression. [VERIFIED: .planning/REQUIREMENTS.md:103-104] |
| UX-18 | Delete incomplete set rows while progress/history remain rebuildable. | Domain/repository/runtime/UI transaction tests. [VERIFIED: .planning/REQUIREMENTS.md:104-105] |
| UX-19 | Retained More actions only; natural sheet height. | Active-workout sheet test and device review. [VERIFIED: .planning/REQUIREMENTS.md:105-106] |
| UX-20 | Drag/accessible reorder parity for plans, Weekday, Rotation, and day switching. | Existing reorder primitive plus editor tests. [VERIFIED: .planning/REQUIREMENTS.md:106-107] |
| UX-21 | 3/2/1 short cues and one zero long cue; audio cannot own rest truth. | Port/unit tests plus device audio check. [VERIFIED: .planning/REQUIREMENTS.md:107-108] |
| UX-22 | Ship the owner-approved standard and adaptive icon set. | Deterministic asset/CNG/candidate checks. [VERIFIED: .planning/REQUIREMENTS.md:108-108] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Set/warm-up removal | Database/storage | Domain/runtime/client | The repository owns atomic source mutation; command/runtime/UI only request and render committed facts. [VERIFIED: src/platform/sqlite/serializedWriter.ts:35-73] |
| Progress/history after removal | Database/storage | Derived projections | Recompute/rebuild inside the mutation transaction; never patch display totals optimistically. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-CONTEXT.md:66-68] |
| Rest countdown audio | Client/native module | Domain rest read model | The cue observes foreground thresholds; persisted timer remains authoritative. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:220-226] |
| Plan/day/schedule reordering | Client draft | Repository on Save | Gesture and accessible alternatives change a draft; existing explicit save commits it. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:211-218] |
| Icon assets/CNG | Static assets/config | Android generated project | Config owns asset references; clean CNG verifies generated native output. [VERIFIED: app.config.ts:20-32] |

## Standard Stack

| Layer | Use | Purpose | Evidence |
|---|---|---|---|
| Persistence | Existing SQLite kernel + `SerializedWriteExecutor` | Serialized exclusive source mutation and rollback. | [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-84] |
| Interaction | Existing `PlanEditorReorderableRow`, Gesture Handler, Reanimated | Long-press displacement plus TalkBack alternatives; extend it, do not replace it. | [VERIFIED: src/ui/components/PlanEditorFields.tsx:175-429] |
| Audio | `expo-audio@~57.0.4` [WARNING: flagged as suspicious — verify before using.] | Pre-bundled short/long foreground cue players. Use `npx expo install expo-audio` after checkpoint. | [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/] |
| Assets | Existing Expo config + repository image assets | Standard/adaptive/monochrome/splash asset mapping. | [VERIFIED: app.config.ts:20-48] |

The official SDK 57 documentation shows `useAudioPlayer(require(...))`, accepts a local asset source, and manages player release at component unmount; do not use remote URLs or recording APIs for this feature. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/]

## Architecture Patterns

### Removal flow

`Remove control → confirmation → removeWarmup/removeWorkingSet command → repository SerializedWriteExecutor → BEGIN IMMEDIATE transaction (revision + incomplete check, delete, renumber/recompute/rebuild) → COMMIT → runtime invalidation → committed UI success` [VERIFIED: src/platform/sqlite/serializedWriter.ts:35-73]

Use new remove input/result types parallel to the inspected skip commands, preserving request identity and expected revision. The repository currently exposes `skipWarmup` and `skipWorkingSet` and the runtime wires both through `runWorkoutMutation`; removal must replace the UI use, not silently reinterpret skip. [VERIFIED: src/domains/workout/activeWorkout.ts:257-260] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3356-3364]

Required removal rules: reject missing/session-mismatched/completed rows before delete; require expected session/set revision; use an idempotency receipt so retry returns the committed result; re-number only the remaining same-kind rows; update active pointer/rest only when the removed row requires it; enqueue/rebuild the same progress/history derivatives in the transaction before acknowledgement. This is a prescriptive implementation contract derived from the locked decision and existing writer behavior. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-CONTEXT.md:28-31] [VERIFIED: src/platform/sqlite/serializedWriter.ts:46-84]

### Countdown audio

Create two pre-bundled tone assets and a testable cue port owned by the foreground RestDock/app runtime. Track emitted thresholds by rest identity/revision so each foreground countdown emits once at first reach of 3, 2, 1, and 0; clear that ledger on a new rest. Do not backfill after resume, beep while paused/backgrounded, or call rest commands from audio callbacks. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:220-226]

Use separate short and long players rather than dynamically generating tones. The package’s documented local-asset player lifecycle is the correct native boundary; leave the existing notification/foreground-feedback adapter intact for notification policy. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/] [VERIFIED: src/platform/notifications/expoForegroundRestFeedbackAdapter.ts:1-260]

### Reorder and day switching

Keep `PlanEditorReorderableRow`: it already long-presses a pan gesture, visually displaces neighbours, respects reduced motion, and exposes adjustable `Move up`/`Move down` accessibility actions. Remove only its visible ordinal and Up/Down buttons, not its handle or fallback semantics; add keyboard Shift+Arrow handling at the shared focusable-handle layer. [VERIFIED: src/ui/components/PlanEditorFields.tsx:216-425]

Wrap Weekday rows in that primitive as Rotation already does; preserve the Weekday radios and renumber draft ordinals after each move. Keep the owned plan’s single selected-day editor, but make the existing days list an explicit labelled selector keyed by stable day ID. [VERIFIED: src/ui/components/ScheduleBindingEditor.tsx:103-246] [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-CONTEXT.md:73-77]

### Deterministic icon assets

Generate source-controlled PNGs deterministically with an existing local image-capable tool selected during implementation (the package manifest has no declared image-generation dependency). Validate bytes, dimensions, alpha/background, and safe-zone bounds in a Node test before CNG. [VERIFIED: package.json:1-155] [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:228-240]

The locked asset contract is verbatim: `icon.png | 1024 × 1024px`; `android-icon-background.png | 512 × 512px`; `android-icon-foreground.png | 512 × 512px RGBA` with safe zone `x/y 128–384`; `android-icon-monochrome.png | 432 × 432px RGBA` with safe zone `x/y 108–324`; and `splash-icon.png | 228 × 213px RGBA`. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:232-239]

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|---|---|---|---|
| SQLite locking/rollback | A second UI-local write path | Existing `SerializedWriteExecutor` | It already serializes, starts `BEGIN IMMEDIATE`, commits, and rolls back. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-84] |
| Reorder gestures/accessibility | A new list-drag library or visible Up/Down replacement | `PlanEditorReorderableRow` | It has gesture, displacement, reduced-motion, and accessibility-action contracts. [VERIFIED: src/ui/components/PlanEditorFields.tsx:277-425] |
| Countdown playback | A custom native bridge or synthesized audio engine | Official `expo-audio` local-asset players | SDK-owned native module supports local assets and lifecycle cleanup. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/] |
| Launcher icon mapping | Manual Android project edits | `app.config.ts` asset references + `verify:cng` | CNG output must remain reproducible and untracked. [VERIFIED: app.config.ts:20-65] [VERIFIED: scripts/check-cng-reproducible.sh:60-92] |

## Common Pitfalls

- **Optimistic deletion:** hiding a row before commit can diverge UI from authoritative history/progress. Disable only the invoking row while mutation is in flight; remove it only from the returned committed view. [VERIFIED: .trae/rules/rules.md:11-18]
- **Completed-set deletion:** completed rows retain correction/undo; enforce incomplete status inside the repository transaction, not only in the button condition. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-CONTEXT.md:28-30]
- **Duplicate/missed beeps:** React rerenders and foreground resumes can revisit a threshold. De-duplicate by rest revision + threshold and never backfill elapsed thresholds. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:220-226]
- **Audio becomes authoritative:** a failed player must produce bounded non-modal feedback and never start/pause/expire rest. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:223-226]
- **Gesture-only reorder:** retain the adjustable actions and add key alternatives while removing visible Up/Down controls. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:211-218]
- **CNG drift:** do not edit generated Android files; the reproducibility script deletes generated targets, prebuilds twice, and compares snapshots. [VERIFIED: scripts/check-cng-reproducible.sh:60-92]

## Package Legitimacy Audit

| Package | Registry evidence | Postinstall | Verdict | Disposition |
|---|---|---|---|---|
| `expo-audio` | Official Expo SDK 57 docs; registry observed version `57.0.4` on 2026-09-06. | No `postinstall` script returned. | `SUS` (seam reason: too new; ~2.04M weekly downloads; Expo repo). | Flagged — planner must add `checkpoint:human-verify` before install. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/] |

**Packages removed due to `SLOP`:** none.  
**Packages flagged `SUS`:** `expo-audio`; lock the SDK-compatible package range only after the checkpoint. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/]

## Security / STRIDE Notes

| Threat | STRIDE | Required control |
|---|---|---|
| Stale or repeated remove request deletes wrong state | Tampering | Expected revision, set/session ownership, incomplete-only SQL predicate, idempotency receipt, and single exclusive transaction. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-CONTEXT.md:66-68] |
| Audio failure changes workout/rest truth | Tampering / availability | Catch playback failure into bounded UI feedback; preserve SQLite timer, controls, notifications, and spoken state. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:220-226] |
| Gesture-only controls exclude assistive users | Denial of service | 48dp labelled handle, TalkBack actions, keyboard/D-pad and Shift+Arrow movement. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:211-218] |
| Untrusted native dependency or generated output | Supply-chain / tampering | Human legitimacy checkpoint, lockfile review, no unsafe postinstall, `verify:cng`, clean build, exact-candidate verification. [VERIFIED: scripts/check-cng-reproducible.sh:60-92] |

Applicable ASVS focus: V5 input/state validation and V14 configuration/build integrity. Authentication, session-management, and external-service controls do not apply because this is offline, device-local functionality with no external network API/service. [VERIFIED: .trae/rules/rules.md:11-18]

## Environment Availability

| Dependency | Required by | Available | Observed version | Planning action |
|---|---|---:|---|---|
| Node.js | tests/CNG/candidate scripts | ✓ | `v26.8.1` | Project declares `24.19.0`; execution must use the pinned engine/CI image. [VERIFIED: environment probe 2026-09-06] [VERIFIED: package.json:6-9] |
| npm | install/test scripts | ✓ | `11.19.0` | Project declares `11.17.0`; use lockfile-compatible toolchain. [VERIFIED: environment probe 2026-09-06] [VERIFIED: package.json:6-9] |
| Expo CLI | CNG | ✓ | `57.0.22` | Validate against repo Expo `~57.0.20` before candidate build. [VERIFIED: environment probe 2026-09-06] [VERIFIED: package.json:84-105] |
| Android generation/device stack | CNG, emulator, Samsung N4 | execution-gated | — | Reuse current CI/attended tooling; do not assume a connected Samsung until the prepare script checks it. [VERIFIED: scripts/generate-phase6-attended-checklist.mjs:139-171] |

## Validation Architecture

The project’s Definition of Done requires phase-scoped automation, 100% coverage for integrity-critical modules, real native SQLite contracts, ordered exit gates, and exact-byte physical approval before promotion. [VERIFIED: .planning/REQUIREMENTS.md:127-133]

| Requirement(s) | Fast automated map | Candidate/manual gate |
|---|---|---|
| UX-11–14 | Update `foundation.test.tsx`, `TodayScreen.test.tsx`, rest/settings route tests; run `npm run test:components -- --runInBand`. | Emulator 200% + keyboard/D-pad/TalkBack; N4 Settings/navigation. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:286-295] |
| UX-15–17, UX-19 | Update `ActiveWorkoutScreen.test.tsx` and `SetRow` component assertions; run component tests. | Emulator/Samsung sheet height, focus, 200% row ergonomics. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:288-295] |
| UX-18 | Add command unit tests, repository host-SQLite transaction/idempotency/revision tests, runtime mutation tests, then run `npm run test:unit -- --runInBand`, `npm run test:sqlite:host -- --runInBand`, and coverage. | Failure-injection plus repeated remove/cancel/commit journey on N4. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:290-294] |
| UX-20 | Extend `OwnedPlanEditor.test.tsx` and `ScheduleEditor.test.tsx` for draft-only drag/accessibility and day selection. | Emulator reduced-motion/200%/keyboard; Samsung held-drag review. [VERIFIED: src/ui/__tests__/OwnedPlanEditor.test.tsx:195-222] |
| UX-21 | New cue-port tests plus `RestDock.test.tsx` for unique 3/2/1/0, off/paused/background/failure; no rest command may be called. | Physical audible check and audio-failure/notification-denial fallback. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:292-295] |
| UX-22 | Add deterministic image-contract test (dimensions, alpha, bounds, colours) and config reference checks; run `npm run verify:cng`. | Fresh clean Android build, launcher adaptive/themed/splash inspection, N4 visual review. [VERIFIED: app.config.ts:20-48] [VERIFIED: scripts/check-cng-reproducible.sh:60-92] |

### Exact-candidate gate reuse

Extend—not weaken—the Phase 6 runner, evidence-script tests, and attended checklist so all changed labels/routes/screenshots are phase-7-aware. The current runner defines emulator N1–N3 and a pending-human N4; N4 requires the Samsung model `SM-S916B` and verifies installed APK bytes against the replacement candidate. [VERIFIED: scripts/run-phase6-maestro.mjs:219-244] [VERIFIED: scripts/generate-phase6-attended-checklist.mjs:139-171]

Before N4: `npm run verify:cng` → typecheck/lint/boundaries → full source matrix → clean Android build/install → updated emulator/Maestro evidence → build a fresh signed candidate once. After N4, retain the existing owner-gated Phase 5 approval, unchanged-byte promotion, and Terminal Seal; Phase 7 does not authorize release. [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-CONTEXT.md:37-39] [VERIFIED: .planning/phases/07-post-candidate-ux-refinement/07-UI-SPEC.md:284-297]

## Concrete File / Test Map

| Seam | Existing implementation/test loci | Planner action |
|---|---|---|
| Removal | `activeWorkout.ts`, `setCommands.ts(.test.ts)`, `workoutRepository.ts`, `workoutAppRuntime.tsx(.test.tsx)`, `ActiveWorkoutScreen.test.tsx` | Add remove contract through all layers; repository/host tests own integrity assertions. [VERIFIED: src/domains/workout/activeWorkout.ts:257-260] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3356-3364] |
| Reorder | `PlanEditorFields.tsx`, `ScheduleBindingEditor.tsx`, `OwnedPlanEditor.test.tsx`, `ScheduleEditor.test.tsx` | Reuse row primitive for Weekday and remove visual ordinals/buttons without removing alternatives. [VERIFIED: src/ui/components/PlanEditorFields.tsx:175-429] [VERIFIED: src/ui/components/ScheduleBindingEditor.tsx:103-246] |
| Audio | `RestDock.tsx`, `expoForegroundRestFeedbackAdapter.ts(.test.ts)`, `RestDock.test.tsx` | Add a foreground cue port and mocked player tests; leave notification adapter authoritative only for its existing concern. [VERIFIED: src/platform/notifications/expoForegroundRestFeedbackAdapter.ts:1-260] |
| Icons/CNG | `assets/images/*`, `app.config.ts`, `check-cng-reproducible.sh` | Add deterministic asset generator/test and preserve config paths. [VERIFIED: app.config.ts:20-48] [VERIFIED: scripts/check-cng-reproducible.sh:60-92] |
| Candidate gates | `run-phase6-maestro.mjs`, `generate-phase6-attended-checklist.mjs`, `phase6-evidence-scripts.test.mjs`, release candidate scripts/workflow | Update exact source contracts and screenshots/checklist rows before a replacement candidate. [VERIFIED: scripts/run-phase6-maestro.mjs:64-244] |

## Sources

- [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/audio/] — SDK 57 local asset player and audio mode/lifecycle API.
- [CITED: https://docs.expo.dev/versions/v57.0.0/config/app/] — Expo app and Android adaptive icon configuration.
- [VERIFIED: npm registry] — `expo-audio` registry queried on 2026-09-06 for version, repository, scripts, and publication metadata; package remains SUS and is not approved until human verification.
- [VERIFIED: repository sources cited inline] — current writer, runtime, reorder, CNG, candidate, requirements, context, and UI contract.

## Open Questions (RESOLVED)

None blocking. The `expo-audio` package identity is resolved to the official `expo/expo` SDK 57 module at `~57.0.4`; its execution checkpoint records the verified source, range, adoption, absent postinstall, and recency-only heuristic warning before installation. The owner already locked the functional behavior and native-dependency direction.
