---
phase: 20
slug: native-acceptance
updated: 2026-10-25
status: personal_apk_verified_closed
source_head: 908098f388b14823ab262fbdfd77e0c13468d688
verification_scope: owner_authorized_personal_apk
full_phase20_complete: false
nyquist_compliant: false
---

# Current implementation and focused personal APK update — 2026-10-25

The owner authorized focused fixes, checks affected by those fixes, a fresh signed personal APK, and a data-preserving phone update. The exhaustive Phase 20 matrix and aggregate coverage closeout remain deferred and incomplete. This amendment updates the current execution route; the original contract in Plans 20-01–20-12 and [validation strategy](20-VALIDATION.md) remains retained for a later full acceptance run.

## Source and delivery position

- Current completed source: `908098f388b14823ab262fbdfd77e0c13468d688` (`908098f3`), branch `fchoo/UX-revamp`.
- Earlier source `37226a12` passed the owner's minimal physical check and was installed as a data-preserving update. Its historical result does not cover subsequent Calendar/save/reorder changes. The final `908098f3` APK is now installed and verified separately.
- Intermediate source `b73b36d2` failed the native reorder visual check because committed rows overlapped. Preserve that failure; it is not acceptance evidence for the final source.
- Final source `908098f3` fixes the timing gap directly: shared translation remains at the drop until React clears the preview, and only the next drag resets it. Earlier host/list remount approaches were removed; focus and state owners remain stable. The fresh final-source native release check passed; intermediate `b73b36d2`, `8f77d0d5` and `ab12ac61` observations remain nonpassing history.
- The signed build, retained/installed emulator digest and focused native checks are complete. The exact Samsung installation completed with byte matching and app data identity preserved. The main screen launched; the owner manually verified the app and closed phone checks on 2026-10-26.

## Implemented behavior

| Area | Current behavior | Source and focused regression scope |
| --- | --- | --- |
| Calendar heading | Visible month names use the short form, such as `Oct 2026`; the full month/year remains in the accessibility name and month-picker action. | [CalendarScreen](../../../src/ui/screens/CalendarScreen.tsx); `src/ui/__tests__/CalendarScreen.test.tsx`; source `f43a4925`. |
| Phone timezone display | Timestamped activities, workouts/history, Calendar and Progress use the phone's current IANA timezone. Mounted pages refresh on foreground and once per minute while active. Stored source timestamps, accepted dates/timezones and revision facts remain intact; civil date-only plans and entries remain on their chosen dates. | [displayTimeZone](../../../src/domains/shared/displayTimeZone.ts), [useDeviceTimeZone](../../../src/ui/time/useDeviceTimeZone.ts); [display policy](../../current-phone-timezone-display.md); timezone/DST/foreground and source-preservation regressions. |
| Garmin activity dates | Compatible provider date/timezone evidence imports automatically. The owner-registered `Asia/Singapore` default applies when compatible source evidence lacks a named timezone; provider evidence takes precedence and incompatible historical/travel evidence still requires review. Display timezone remains separate from import provenance. | [garminImportRuntime](../../../src/bootstrap/garminImportRuntime.tsx); source-date compatibility and retained-date regressions. |
| Actions | Shared action captions stay on one line, choosing the fitting full caption, compact caption or intent icon while the owning action retains its complete accessible name. Related action controls share rows. Bottom-navigation labels retain complete single-line text, font fitting, approved fonts, target sizes and app-wide scaling. | [ActionLabel](../../../src/ui/components/ActionLabel.tsx); `src/ui/__tests__/ActionButtonLayouts.test.tsx` and related action-layout scopes. |
| Exercise disclosure | Explicit expand/collapse choices govern the exercise content. Reorder grips enter reorder mode; drag and move-up/down controls use committed identities and reject conflicting in-flight commands. | [ActiveWorkoutScreen](../../../src/ui/screens/ActiveWorkoutScreen.tsx), [WorkoutSessionPresentation](../../../src/ui/components/WorkoutSessionPresentation.tsx); disclosure/reorder regressions; source `aa206110`. |
| Drag/drop presentation | A successful drop keeps its presentation until the command settles; committed order owns row placement. The final repair keeps shared translation until React clears the preview; the next gesture resets it. Native rows and focus handles stay mounted. | [PlanEditorFields](../../../src/ui/components/PlanEditorFields.tsx); `src/ui/__tests__/PlanEditorFields.test.tsx`; sources `23af5ff0` and `908098f3`. Final native release check passed; superseded intermediate attempts remain preserved. |
| Rest countdown/audio | Cue scheduling runs independently of display renders; prepared native audio supplies two short countdown cues and the final completion tone. Foreground expiry owns its cue, stale playback is cancelled, and the background notification uses the packaged completion tone. Repeated timer taps are queued against current committed revisions. | [restCountdownCue](../../../src/bootstrap/restCountdownCue.ts), [audio adapter](../../../src/platform/audio/expoRestCountdownCueAdapter.ts), [RestDock](../../../src/ui/components/RestDock.tsx); affected cue, ownership and rest-latency regressions. |
| Precise background alerts | Settings can open Android's precise-alarm permission page. On permission grant, the runtime serializes replacement against current rest state; refresh failures are shown with retry. Availability and denied access remain explicit. | [exact alarm access](../../../src/platform/notifications/exactAlarmAccess.ts), [permission refresh](../../../src/bootstrap/useExactRestAlarmAccess.ts), [runtime](../../../src/bootstrap/workoutAppRuntime.tsx); permission/current-timer/serialization/retry scopes; sources `9eed4b95`–`37226a12`. |
| Save/read latency and render guards | Saves publish committed results and refresh the affected selection without awaiting unrelated backup/permission reads. Current-workout and selection generations guard stale responses; successful retries clear prior failures. Drop previews clear after settlement without moving source authority to presentation. | [workoutAppRuntime](../../../src/bootstrap/workoutAppRuntime.tsx); `src/bootstrap/workoutAppRuntime.scopedLatency.test.tsx` and affected Active Workout/row scopes; sources `23af5ff0`, `3cc7fadf`, `8f77d0d5`. |

These entries describe current implementation and its affected test scope. They do not assert that every original acceptance row or every historical host gate was rerun on this source.

## Current focused verification plan

| Step | Status | Completion evidence |
| --- | --- | --- |
| Integrate Calendar and responsive save/reorder repairs | Implemented | Current source `908098f3`; focused regression files are identified above. |
| Run checks affected by the final repair plus required compiler/boundary checks | Passed | 44 focused drag/workout tests; 14 scoped save/recovery tests; 16 unchanged rest regressions; 42 affected Calendar tests and 10 affected existing runtime cases. Typecheck, boundaries and source review passed. |
| Build a fresh signed APK from final source | Passed | Exact source/APK binding below; signing, alignment and Android binary validation passed. |
| Verify final reorder/collapse/save/Calendar behavior in the emulator | Passed for affected release/save/title paths | Final drop has no post-release snap-back/overlap; set-value save returns to workout; short month title/full accessible name verified. Previously passing collapse suites were not repeated. |
| Update the actual phone with data preserved and perform the owner's focused check | Passed; owner confirmed | Installed byte digest matches, app data identity preserved and launch passed. Owner manually verified on 2026-10-26 and closed phone checks. |
| Report final artifact and focused outcome | Complete | See [current report](../../../artifacts/native/interaction-responsiveness/REPORT.md), [STATE](../../STATE.md) and [ROADMAP](../../ROADMAP.md). |
| Exhaustive Phase 20 matrix, full coverage closeout, attended matrix, final seal and milestone completion | Deferred; incomplete | Original Plans 20-08–20-12, original validation flags and unchecked final sign-off remain retained. |

Source changes during an immutable producer require preserving that run and creating a fresh source-bound result. Native work remains serialized under the orchestrator's exclusive device window. A failed check remains a failure until a fresh run verifies the completed source.

## Final receipt fields — orchestrator update required

| Field | Current value |
| --- | --- |
| Final source SHA | `908098f388b14823ab262fbdfd77e0c13468d688` |
| Focused host/check receipt | [VERIFICATION.json](../../../artifacts/native/interaction-responsiveness/VERIFICATION.json) |
| Signed APK path | `artifacts/native/personal-release/20261025-230155-908098f388b1/gym-tracker-final.apk` |
| Signed APK SHA-256 | `259a607db376b3bf9eff28b92694e60ea0c28eac8c02285b618e6444cf945669` |
| Final-source build receipt | `artifacts/native/personal-release/20261025-230155-908098f388b1/build-result.json` |
| Emulator scoped native receipt/result | Passed; [receipt](../../../artifacts/native/interaction-responsiveness/VERIFICATION.json) and [drop recording](../../../artifacts/native/interaction-responsiveness/final-drop.mp4) |
| Phone installed source/APK equality receipt | [phone-install-verification.json](../../../artifacts/native/interaction-responsiveness/phone-install-verification.json); installed source `908098f3` |
| Phone data preservation receipt | Passed in the same receipt; no app reset or uninstall |
| Owner's focused physical check | Owner manually verified and closed checks on 2026-10-26 |
| Focused personal APK delivery outcome | Installed and verified; personal workflow closed |
| Full Phase 20 acceptance / final seal | Deferred and incomplete |
| Milestone v1.2 completion | Incomplete |

## Reconciled GSD inventory

The on-disk active milestone has 98 plan files and 94 retained summary files. Phase 20 retains eight summaries, with Plan 20-08 reopened for current source/build corrections; seven Phase 20 plans and 93 milestone plans are currently complete. Four plans, 20-09–20-12, have no summary. No new plan or summary was fabricated for this update.

| Phase | Plan files | Retained summaries | Current verification meaning |
| --- | ---: | ---: | --- |
| 13 | 16 | 16 | GSD verification passed. |
| 14 | 12 | 12 | Host implementation recorded; retained verification gaps/native debt. |
| 15 | 13 | 13 | Host implementation recorded; retained verification gaps/native debt. |
| 16 | 7 | 7 | GSD verification passed; exhaustive native closeout remains in Phase 20. |
| 17 | 14 | 14 | Host implementation recorded; retained verification gaps/native debt. |
| 18 | 14 | 14 | GSD verification passed; full Phase 20 Garmin journey still incomplete. |
| 19 | 10 | 10 | GSD verification passed; exhaustive native closeout remains in Phase 20. |
| 20 | 12 | 8 | Plan 20-08 reopened; focused emulator and personal phone verification passed; full acceptance deferred. |
| Total | 98 | 94 | Four phases have passed GSD verification; seven upstream phases have implementation summaries. |

The GSD progress query identifies Phase 14 as the earliest retained verification gap, while current owner-authorized work is the focused Phase 20 personal APK update. That discrepancy is recorded rather than resolved by changing historical verification verdicts. Requirement mapping remains 172/172 mapped; it is not 172 native PASS results. No completion percentage is used for acceptance.

## Preserved evidence and boundaries

- [Corrective gates](20-CORRECTIVE-GATES.md), [2026-10-24 issue report](20-ISSUE-REPORT-20261024.md) and the existing review/security/receipt artifacts remain historical source-bound evidence.
- The application and Linux aggregate records at `73e1e41a` / `898ae5f2` retain their original source scope; this note does not relabel them as final-source reruns.
- Original Plans 20-09–20-12, the 172-row parity ledger, 107 browser occurrences, 64 presentation configurations and unchecked validation sign-off remain unchanged and incomplete.
- Full `nyquist_compliant` stays false. No milestone archive, public release, push, PR, deployment or production-readiness claim is part of this documentation update.

## Cleanup completed

29 auxiliary worktrees and 211 workbranches were retired after preserving all branch tips under archive refs and in a verified Git bundle, plus staged/unstaged source patches and untracked reports. The six unfinished visual SDK files remain recoverable from the archive. Only main and the active UX-revamp checkout remain. The active owner draft and `.coverage` were preserved. The old Gym Tracker Lima VM and orphaned coverage harness are stopped, the emulator was shut down after verification, and the obsolete shared `core.worktree` override was removed after config backup. [Cleanup receipt](../../../artifacts/native/interaction-responsiveness/cleanup-result.json).
