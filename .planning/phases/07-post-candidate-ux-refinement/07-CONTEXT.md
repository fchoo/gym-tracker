# Phase 7: Post-Candidate UX Refinement — CONTEXT

Owner-directed interaction and information-architecture refinements captured during the Phase 6 N4 device review of green candidate `phase6-20260906-9cdecb8`. This phase supersedes that candidate: landing it requires a fresh signed candidate build and a repeated Samsung SM-S916B N4 review. Authoritative workout, schedule, history, recommendation, and portability semantics must not change; only presentation, interaction, IA, set-removal behavior, rest-timer audio, and the app icon change.

## Owner requests (verbatim intent → requirement)

1. Remove the box highlight on the active tab in the bottom nav. → UX-11
2. Remove all top notices on the workout detail page (rest notice, warm-up added, …). → UX-15
3. Each set's reset button should be on the same row as the tick/cross buttons. → UX-16 (subsumed)
4. Two "…" buttons at top-right of workout detail is confusing; use a distinct menu/plan icon and a single overflow. → UX-15
5. Warm-ups and sets should be REMOVED (hard delete the row), not skipped. → UX-18 (owner chose hard delete)
6. Rest timer has no sound; add a short beep per second for the last 3 seconds and a long beep at end. → UX-21 (owner approved adding a native audio dependency)
7. Remove repeat, skip, advance on Today. → UX-12
8. Move History and data into the settings page. → UX-14
9. Move Appearance out into the main settings page (not nested in rest-alert settings). → UX-14
10. Restructure the settings page to be intuitive; replace the "…" with a settings gear icon. → UX-13
11. Workout detail: load, rep, reset, done, delete all on one row. → UX-16
12. Add warm-up/set: the + aligned with the section header text; remove the copy-warmup button; + defaults to reusing the last warmup/set values. → UX-17
13. More action: remove "save as zero-set workout" (same as finish as partial). → UX-19
14. More action: remove "finish workout later". → UX-19
15. More action: remove "Close". → UX-19
16. More action: size the popup dialog to the number of buttons (no big trailing gap). → UX-19
17. Plan configuration: remove up/down buttons and "Position x of y"; make Replace a right-aligned glyph button. → UX-20
18. Day editor should not be limited to a single day. → UX-20
19. Plan activation: apply the long-press drag handle to schedule ordering (Weekday and Rotation). → UX-20
20. Add an app icon: simple, elegant "grow stronger" mark; propose a few for confirmation. → UX-22

## Decisions locked with owner
- Set/warm-up removal = HARD DELETE of the row (new remove command in workout domain + SQLite repository; update progress totals and history snapshot). Not a relabelled skip.
- Rest-timer audio = ADD a native audio dependency (expo-audio or expo-av) for in-app beeps; foreground-only cue, not authoritative for rest state. This regenerates the Android project → must pass `verify:cng` + full matrix.
- These changes supersede candidate `phase6-20260906-9cdecb8`; a fresh candidate + repeat N4 are accepted.

## Candidate/release context to preserve
- Green promotable candidate before this phase: `phase6-20260906-9cdecb8`, commit `9cdecb86dedeb9edd7bf5bc4d1c85d08bdc81660`, artifact `private-release-candidate-phase6-20260906-9cdecb8` (id 9981275259), APK sha256 `f472faec6c6518574617a4c68a8a4efc785e64b2b8140c50f8d53231fd11e46b`, AAB sha256 `337917519561044e41d39c5cb09e6e0f5ff8f8dbac4055c00df6e2614c20f978`. Retained for rollback only; it is superseded by Phase 7 output.
- Release chain after a green Phase 7 candidate remains owner-gated: Samsung N4 → Phase 5 attended owner approval (literal lowercase token) → unchanged-byte promotion → Terminal Seal.

## Codebase file map (from read-only exploration; verify line numbers before editing)

### UX-11 Bottom nav active-tab highlight — DONE in WIP
- `src/ui/components/index.ts` `AppTabs` (~1079): removed `borderColor`/`borderWidth` on selected tab. Focus ring (`outlineWidth`) retained. Test updated in `src/ui/__tests__/foundation.test.tsx` (~641).

### UX-12 Today repeat/skip/advance
- `src/ui/screens/TodayScreen.tsx`: `ScheduledContent` rotation actions lines ~249-263 (`onScheduleAction("repeat"|"skip"|"advance")`); weekday skip ~266 (`onWeekdaySkip`). Confirmation sheet ~669-693 → `actOnSchedule`. Start buttons (KEEP): Start {day} ~240-243, Choose another day ~244-248, Train anyway (RestDayContent) ~377-398. Route wiring `app/(tabs)/index.tsx` ~197-205 (`runtime.actOnToday`). Rotation still advances via committed completion (workoutOutcome), not these buttons.

### UX-13/UX-14 Settings IA + gear icon
- Today header entry: `TodayScreen.tsx` ~564-577 (`icon="more"`) opens `RestAlertSettingsSheet` in place; separate "History and data" SecondaryAction ~582-588 → `onOpenHistoryAndData` → `/more`.
- `/more` route screen: `app/more/index.tsx` (`MoreRoute`) — cards "History" → `/more/removed-sessions`, "Data and recovery" → `/more/data-and-recovery`.
- Appearance: embedded in `src/ui/components/RestAlertSettingsSheet.tsx` ~257-261 (`onOpenAppearance`); `AppearanceSheet` defined in `src/ui/components/index.ts` ~929; opened from `TodayScreen` ~655-668.
- Rest-alert sheet: `src/ui/components/RestAlertSettingsSheet.tsx` (`RestAlertSettingsSheet` ~51) — Rest sound / Rest vibration switches, denied-permission notice, Appearance + Close actions.
- Plan: introduce a consolidated Settings screen/route (e.g. `app/more/index.tsx` becomes the Settings page) reached by a gear `IconAction` on Today; make Appearance + rest-alert prefs + History and data + Data and recovery top-level sections. New `settings` glyph in `actionIcons`.

### UX-15 Workout detail notices + single overflow — PARTIALLY DONE in WIP
- `src/ui/screens/ActiveWorkoutScreen.tsx`: top-of-primary notices removed except "Reviewing another exercise"; `revealedSetMessage` state now unused (line ~330) — remove it. Header actions ~372-387: first IconAction changed to `icon="plan"` (Today's plan), second is the More overflow. `plan` glyph added to `actionIcons` (`ClipboardList`). Consider whether the two header buttons should collapse further per owner ("2 … buttons" complaint) — plan icon + overflow is the intended resolution.
- Orphaned after copy-warmup removal: `Copy` import (line 7), `copyPreviousWarmup` port method (~89), `copyWarmup` handler, `copy_warmup` in `SectionMutation` (~132). Remove them and the runtime `copyPreviousWarmup` wiring.

### UX-16 SetRow single row
- `src/ui/components/SetRow.tsx` (`SetRow` ~347): `styles.row` (~1138) is column; `styles.values` (~1158) row-wrap of inputs; `styles.actions` (~1185) `alignSelf:flex-end` separate row for complete/skip glyphs; retry ~857-864; sources glyphs ~1047-1069. Merge inputs + actions into one shared row container; add delete glyph (see UX-18). Must stay legible at 200% (wrap/scale fallback).

### UX-17 Add warm-up/set + button — DONE in WIP
- `ActiveWorkoutScreen.tsx`: `SectionHeader action=` now hosts the single Add `SectionGlyphAction` (Plus) for both warm-ups (~890-913) and working sets (~963-981). Copy-previous-warmup control removed. `addWarmup` already reuses last/source observation; `addWorking` reuses `workingSets.at(-1)`. `SectionHeader` supports `action` slot (`src/ui/components/index.ts` ~530).

### UX-18 Remove instead of skip (HARD DELETE)
- Current skip path: `src/domains/workout/setCommands.ts` `skipWarmup`/`skipWorkingSet` → `workoutRepository.skipWarmup/skipWorkingSet`. No remove/delete command exists yet.
- Add: `removeWarmup`/`removeWorkingSet` domain commands + `workoutRepository` methods (`src/platform/sqlite/repositories/workoutRepository.ts`) that delete the set row inside the serialized `BEGIN IMMEDIATE` writer, recompute progress totals, and update the history snapshot. Wire through `workoutAppRuntime.tsx` and `ActiveWorkoutScreen` (replace onSkip with onRemove; SetRow glyph becomes a delete/trash action). Preserve idempotency-key/receipt discipline and expected-revision checks. Must add regression + migration-safe reasoning (deleting planned rows vs completed rows; disallow removing an already-completed set unless spec says otherwise — clarify in discuss).

### UX-19 More-actions dialog
- `ActiveWorkoutScreen.tsx` More dialog ~1178+ (`title="More workout actions"`, `closeMoreActions`). Remove: zero-set save, finish-workout-later, Close. Size dialog to content (the dialog/sheet component likely has a fixed min height — check `ConfirmationSheet`/modal styles in `src/ui/components/index.ts`).

### UX-20 Plan reorder rows + schedule drag + day editor
- Reorder row: `src/ui/components/PlanEditorFields.tsx` `PlanEditorReorderableRow` (~175): position label ~403-409; up/down IconActions ~410-425; drag handle/gesture ~277-314/359-395 (KEEP). Remove up/down + position label. Replace control lives in consumer `OwnedPlanEditorScreen.tsx` ~1264-1272 — convert to a right-aligned glyph within the row.
- Plan activation schedule: `StarterActivationScreen.tsx` `ScheduleMode` ~184-225, `ScheduleBindings` ~227-305 (rows ~269-302 use plain up/down IconActions ~287-298, NO drag). Wrap rows in `PlanEditorReorderableRow` and route `onMoveTo` → existing `move()`.
- Owned-plan schedule editor already has rotation drag: `src/ui/components/ScheduleBindingEditor.tsx` `RotationEditor` ~210-247 (uses `PlanEditorReorderableRow`); `WeekdayEditor` ~103-208 has no drag — add if in scope.
- Day editor single-day: `OwnedPlanEditorScreen.tsx` — days modeled as array (`draft.days`), listed ~1165-1208; editor renders only `selectedDay` (memo ~597-602, gated ~1210), `selectedDayId` init to `days[0].id`. By design single-active-day with the day list as switcher. Clarify with owner in discuss: do they want visible day tabs / all-days expanded, or is making the day-switcher obvious enough?

### UX-21 Rest-timer audio
- `src/ui/components/RestDock.tsx`: countdown effect ~196-228 drives `remainingMs`; `onExpired` fires once at 0 (~213-228). `thresholdMessage` ~54-60 gives 60/30/10/… announcements. Add an audio cue: short beep at remaining 3/2/1s, long beep at 0. No audio dep installed (`expo-haptics`, `expo-notifications` only). Add `expo-audio` (SDK 57) → new native module → regenerate CNG. Consider a small `restCountdownAudioPort` adapter for testability; keep foreground-only and non-authoritative. Existing notification-channel sound (`expoForegroundRestFeedbackAdapter`) stays for the terminal alert.

### UX-22 App icon
- `app.config.ts` ~20-32: `icon` `./assets/images/icon.png` (1024²); adaptive `foregroundImage` (512²), `backgroundImage` (512²), `monochromeImage` (432²); splash `splash-icon.png`. Generate candidate marks, get owner confirmation, replace assets, keep dimensions.

## Verification obligations (inherited)
- Native dep + config changes (expo-audio, icon assets) rerun clean CNG generation and the full matrix.
- Screens never execute SQL; removal uses the repository-owned serialized writer with expected-revision checks; source mutation + durable effects commit atomically before UI acknowledgement.
- Strict typecheck, lint, boundaries, behavior tests, integrity-critical 100% coverage for touched integrity modules, redacted diagnostics, accessibility semantics, `git diff --check`.
- Phase 6 evidence flows (progress-library, calendar-date-reorder, navigation-accessibility) must be updated to match the new IA (gear settings entry, removed Today actions, single-row sets, remove vs skip) and stay green on the fresh candidate.

## WIP already on branch `fix/phase6-ux-polish` (committed `493b14b` + uncommitted)
- UX-11 done (nav highlight) + test.
- UX-15 partial: top notices trimmed to "Reviewing another exercise"; header first action → `plan` icon; `plan` glyph added.
- UX-17 partial: single Add + button in section header for warm-ups and working sets; copy-warmup UI removed (port/handler cleanup still pending).
