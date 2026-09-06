# Phase 7: Post-Candidate UX Refinement - Pattern Map

**Mapped:** 2026-09-06  
**Files classified:** 55 planned source, configuration, asset, test, and evidence targets  
**Analogs found:** 49 / 55 (six targets require the Phase 7 research contract because the repository has no behavior-equivalent implementation)

## File Classification

The table includes the explicitly named Phase 7 files plus the small, implied seam files needed to make the locked UX-11 through UX-22 behavior testable. `New` paths are intentionally explicit where the research describes a new seam. The planner may fold a new port into its closest existing module only if it preserves the listed contract and test ownership.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/domains/workout/activeWorkout.ts` | model / repository contract | CRUD, event-driven | existing skip inputs and repository interface in same file | role-match |
| `src/domains/workout/setCommands.ts` | service / command | request-response | existing `completeSet` command | exact |
| `src/domains/workout/setCommands.test.ts` | test | request-response | existing command validation tests | exact |
| `src/platform/sqlite/repositories/workoutRepository.ts` | repository | CRUD, event-driven | existing skip/complete mutations in same file | composite |
| `src/bootstrap/workoutAppRuntime.tsx` | runtime / provider | request-response | `runWorkoutMutation` and command adapters | exact |
| `src/bootstrap/workoutAppRuntime.test.tsx` | test | request-response | existing repository forwarding tests | exact |
| `src/ui/screens/ActiveWorkoutScreen.tsx` | component / controller | request-response | existing add, skip, and committed-view paths | composite |
| `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` | test | request-response | existing fixture and command-port tests | exact |
| `tests/integration/complete-set.test.ts` | integration test | CRUD, event-driven | commit-before-acknowledgement coverage | role-match |
| `tests/integration/cross-profile-workout.test.ts` | integration test | CRUD | existing cross-profile set mutations | exact |
| `tests/sqlite-host/historyCommandRepository.test.ts` | host-SQLite integration test | CRUD, transform | atomic source-plus-derivative history tests | role-match |
| `src/ui/components/index.ts` | shared component | request-response | `ConfirmationSheet`, `IconAction`, `AppTabs` | exact |
| `src/ui/components/SetRow.tsx` | component | request-response | existing glyph-action/input layout | role-match |
| `src/ui/screens/TodayScreen.tsx` | component | request-response | header/sheet action composition | exact |
| `app/(tabs)/index.tsx` | route / controller | request-response | existing route-owned preference reads and action wiring | exact |
| `src/ui/components/RestAlertSettingsSheet.tsx` | component | request-response | serialized saved-preference/revert flow | exact |
| `app/more/index.tsx` | route | request-response | existing More route card layout | exact |
| `src/ui/__tests__/TodayScreen.test.tsx` | test | request-response | existing Today settings/history tests | exact |
| `src/ui/__tests__/foundation.test.tsx` | test | request-response | shared primitive and active-tab assertions | exact |
| `app/(tabs)/__tests__/index.test.tsx` | route test | request-response | existing deferred preference-read mocks | exact |
| `src/ui/__tests__/RestAlertSettingsSheet.test.tsx` | test | request-response | save/revert/permission cases | exact |
| `app/more/__tests__/index.test.tsx` (new) | route test | request-response | `app/more/__tests__/data-and-recovery.test.tsx` | role-match |
| `src/ui/components/PlanEditorFields.tsx` | shared component | event-driven | `PlanEditorReorderableRow` | exact |
| `src/ui/components/ScheduleBindingEditor.tsx` | component | transform | rotation binding using `PlanEditorReorderableRow` | role-match |
| `src/ui/screens/OwnedPlanEditorScreen.tsx` | component / controller | CRUD, transform | stable-ID selected-day and `moveDay` draft mutation | exact |
| `src/ui/screens/StarterActivationScreen.tsx` | component | transform | activation binding move/ordinal rebuild | role-match |
| `src/ui/__tests__/OwnedPlanEditor.test.tsx` | test | event-driven | drag, adjustable-action, reduced-motion tests | exact |
| `src/ui/__tests__/ScheduleEditor.test.tsx` | test | transform | current schedule move/save tests | exact |
| `src/ui/__tests__/StarterPlans.test.tsx` | test | transform | starter activation reorder tests | exact |
| `src/ui/components/RestDock.tsx` | component | event-driven | persisted countdown/one-shot expiry observer | exact |
| `src/ui/__tests__/RestDock.test.tsx` | test | event-driven | fake-clock expiry de-duplication tests | exact |
| `src/domains/rest/restNotificationPort.ts` | port / model | event-driven | existing foreground-feedback port | partial |
| `src/domains/rest/restCountdownCuePort.ts` (new) | port | event-driven | `ForegroundRestFeedbackPort` in `restNotificationPort.ts` | partial |
| `src/platform/audio/expoRestCountdownCueAdapter.ts` (new) | native adapter / service | event-driven, file-I/O | `expoForegroundRestFeedbackAdapter.ts` (structural only) | no analog |
| `src/platform/audio/expoRestCountdownCueAdapter.test.ts` (new) | test | event-driven | `expoForegroundRestFeedbackAdapter.test.ts` | role-match |
| `package.json` | config | batch | existing Expo dependency/scripts layout | exact |
| `package-lock.json` | lockfile config | batch | npm-generated lockfile for `package.json` | exact |
| `assets/audio/rest-cue-short.wav` (new) | asset | file-I/O | none | no analog |
| `assets/audio/rest-cue-long.wav` (new) | asset | file-I/O | none | no analog |
| `assets/images/icon.png` | asset | file-I/O | existing configured standard icon | role-match |
| `assets/images/android-icon-background.png` | asset | file-I/O | existing configured adaptive background | role-match |
| `assets/images/android-icon-foreground.png` | asset | file-I/O | existing configured adaptive foreground | role-match |
| `assets/images/android-icon-monochrome.png` | asset | file-I/O | existing configured monochrome layer | role-match |
| `assets/images/splash-icon.png` | asset | file-I/O | existing configured splash mark | role-match |
| `scripts/generate-concept-g-icons.mjs` (new) | utility | transform, file-I/O | repository Node-script conventions only | no analog |
| `scripts/concept-g-image-contract.test.mjs` (new) | test | file-I/O | repository `node:test` script tests only | no analog |
| `app.config.ts` | config | transform | current app-icon path wiring | exact |
| `scripts/check-cng-reproducible.sh` | utility / verification | batch, file-I/O | existing clean-prebuild byte-comparison script | exact |
| `scripts/run-phase6-maestro.mjs` (extend/rename for Phase 7) | evidence runner | batch, file-I/O | current candidate-bound Phase 6 runner | exact |
| `scripts/generate-phase6-attended-checklist.mjs` (extend/rename for Phase 7) | evidence utility | batch, transform | current Samsung N4 checklist generator | exact |
| `scripts/phase6-evidence-scripts.test.mjs` (extend/rename for Phase 7) | test | batch, file-I/O | current evidence-contract test suite | exact |
| `maestro/phase6/progress-library.yaml` (update or replace) | UI automation config | request-response | existing executed-flow contract | role-match |
| `maestro/phase6/calendar-date-reorder.yaml` (reuse/update) | UI automation config | event-driven | existing ordering flow | role-match |
| `maestro/phase6/calendar-date-reorder-verify.yaml` (reuse/update) | UI automation config | event-driven | existing native-drag verification | exact |
| `maestro/phase6/navigation-accessibility.yaml` (update or replace) | UI automation config | request-response | existing navigation/a11y flow | role-match |

## Pattern Assignments

### 1. Incomplete-set removal: command → exclusive SQLite transaction → runtime → committed UI

**Targets:** `activeWorkout.ts`, `setCommands.ts`, `setCommands.test.ts`, `workoutRepository.ts`, `workoutAppRuntime.tsx`, `workoutAppRuntime.test.tsx`, `ActiveWorkoutScreen.tsx`, `ActiveWorkoutScreen.test.tsx`, plus the three integrity suites.

**Best analogs:**

- `src/domains/workout/activeWorkout.ts:180-194,243-266` — typed skip inputs, session/set revision fields, and repository method interface.
- `src/domains/workout/setCommands.ts:149-167` — thin command validation/forwarding, then haptic/effect work only after a committed result.
- `src/platform/sqlite/repositories/workoutRepository.ts:1542-1572,1575-1665,1679-1859` — conditional session/set writes, active-pointer movement, replay/idempotency, revision increments, and durable rest/effect work.
- `src/platform/sqlite/serializedWriter.ts:35-73` — FIFO writer ownership and the `BEGIN IMMEDIATE` / commit / rollback boundary.
- `src/bootstrap/workoutAppRuntime.tsx:3279-3390` — runtime error mapping and post-commit trusted read; `completeSet` performs its special invalidation/effect drain after the repository committed.
- `tests/sqlite-host/historyCommandRepository.test.ts:266-608` and `tests/integration/complete-set.test.ts:549-785,927-1174` — no durable acknowledgement or derivative effect may survive a failed transaction.

**Repository transaction pattern to copy (composite):**

```ts
// SerializedWriteExecutor (serializedWriter.ts:35-73)
// 1. queue this write, 2. BEGIN IMMEDIATE, 3. run all source + derivative writes,
// 4. COMMIT only on success, otherwise ROLLBACK and rethrow.

// workoutRepository skip/complete family (workoutRepository.ts:1542-1859)
// Guard with active session + sessionRevision + setRevision (and metric identity
// where relevant), mutate the set and active pointer together, then increment
// session revision before emitting a committed result.
```

**Apply it to the locked removal semantics:**

1. Add distinct typed `RemoveWarmupInput` and `RemoveWorkingSetInput` contracts beside `SkipWarmupInput` / `SkipWorkingSetInput`; retain the conflict error type and revision fields.
2. The repository must hard-delete only an incomplete row. It must reject stale session/set revision, another profile/session, a completed row, and a missing row without partial writes. Recalculate active-set pointer and any derivative history/progress facts inside the same exclusive transaction.
3. Return a durable removal receipt (including the surviving focus target or enough identity to derive it) only after commit. Follow `completeSet` replay/idempotency handling where an already-applied command must be distinguishable from a failed command. The exact receipt fields are governed by `07-RESEARCH.md`; the existing skip flows are not an exact delete analogue.
4. `setCommands.ts` must not play haptic feedback, drain effects, or invalidate views until the command reports committed/replayed success.
5. `workoutAppRuntime.tsx` must add the adapter in the `runWorkoutMutation` family and refresh via `trustedRead` after success rather than optimistically splicing the old view.

**Runtime pattern to copy:**

```ts
// workoutAppRuntime.tsx:3279-3315
await repositoryMutation(input);
return trustedRead(); // read committed state only after repository success
```

**Screen pattern to copy:**

- `ActiveWorkoutScreen.tsx:481-516` serializes a UI draft write; use the same busy/error lifecycle for Remove.
- `ActiveWorkoutScreen.tsx:518-655` is the old warm-up/working-set completion/skip state machine to replace, not duplicate. Remove must first open `ConfirmationSheet`, leave the row present and busy while pending, and only move focus after a committed refreshed view is applied.
- `ActiveWorkoutScreen.tsx:547-627,880-1037` provides the same-section Add/reuse-last anchors. After success focus the next remaining row in that section, otherwise the corresponding Add action.
- `ActiveWorkoutScreen.tsx:1075-1170` is the obsolete More-sheet skip-action surface; remove those actions rather than adding a second route.

**Test pattern to copy:**

- Start command fixture/mocking from `src/domains/workout/setCommands.test.ts` and runtime forwarding fixtures from `src/bootstrap/workoutAppRuntime.test.tsx:2353-2354`.
- Start RNTL fixtures, focus assertions, and user action sequencing from `src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1-300,1141-1309`. Replace skip expectations with: confirmation shown, cancel produces no command, pending keeps row visible, success removes/refocuses, and failure preserves row/focus with actionable error.
- Extend `complete-set.test.ts`, `cross-profile-workout.test.ts:553-716`, and `historyCommandRepository.test.ts:266-608` for stale-revision/no-cross-profile/completed-row rejection and transaction rollback. Cover the derived-history/progress invariants from `07-RESEARCH.md`, not only the deleted source row.

### 2. Shared actions, confirmation, Settings IA, and row editing

**Targets:** `components/index.ts`, `SetRow.tsx`, `TodayScreen.tsx`, `app/(tabs)/index.tsx`, `RestAlertSettingsSheet.tsx`, `app/more/index.tsx`, and their component/route tests.

**Analog:** `src/ui/components/index.ts:388-471,807-921,1081-1153`.

```tsx
// Existing shared primitive family
<IconAction accessibilityLabel={label} onPress={onPress} />
<ConfirmationSheet
  visible={visible}
  onCancel={onCancel}
  onConfirm={onConfirm}
/>
```

`ConfirmationSheet` focuses Cancel when opened and uses `restoreFocusRef` to restore the invoking control when dismissed (`components/index.ts:807-921`). It is the required destructive-confirmation primitive: do not introduce a custom alert that changes focus behavior.

**Apply this family:**

- In `SetRow.tsx:347-389,994-1130`, replace skip props/actions with contextual Remove plus the new reset control within the existing `GlyphAction`/values/actions layout. Completed rows retain their correction path (`SetRow.tsx:857-980`); only incomplete rows receive hard removal. Do not make reset/remove a replacement for completed correction/undo.
- In `ActiveWorkoutScreen.tsx:360-389`, replace the single plan/more affordance pattern with the locked header action model: a Settings gear routes to `/more`, while per-row destructive actions remain in their own context.
- Update the `TodayScreen.tsx:249-275,557-668` schedule/header surface and `app/(tabs)/index.tsx:128-206` wiring together. Remove the obsolete schedule act/weekday skip affordances; do not leave unreachable handlers or a duplicated preference owner.
- Treat `/more` as Settings. Retain its card/secondary-action hierarchy from `app/more/index.tsx:26-66`, but update title/copy and entry points to the locked Settings IA.
- Preserve preference ownership in the route/sheet pattern: `RestAlertSettingsSheet.tsx:51-169` serializes saves and reverts failed persistence; `:171-338` owns loading, permission, and switch states. The rest-sound setting is persisted preference data, not an audio-adapter-local flag.
- Update `AppTabs` selected state with its current primitive/styles (`components/index.ts:1081-1153`) and the corresponding test asserts. Phase 7's selected tab must have an unambiguous visual distinction; do not regress to transparent/no-border selection.

**Test ownership:**

- `TodayScreen.test.tsx` is the one owner for changed Today action composition.
- `foundation.test.tsx:641-654` is the one owner for AppTabs selected-state primitives.
- `app/(tabs)/__tests__/index.test.tsx` owns Settings route wiring and deferred preference-read behavior (replace the old “History and data” assertion near line 276).
- `RestAlertSettingsSheet.test.tsx` continues to own persistence, revert, and permission gates. Add the small new `app/more/__tests__/index.test.tsx` only for the Settings route's own title/card/link contract; do not duplicate preference persistence tests there.

### 3. Drag reorder with non-visual accessibility equivalents

**Targets:** `PlanEditorFields.tsx`, `ScheduleBindingEditor.tsx`, `OwnedPlanEditorScreen.tsx`, `StarterActivationScreen.tsx`, and their three test files.

**Primary analog:** `src/ui/components/PlanEditorFields.tsx:175-425`.

```tsx
// Keep this interaction family
onLongPress={startDrag}
accessibilityRole="adjustable"
onAccessibilityAction={handleAccessibilityAction}
// Existing implementation maps increment/decrement to row movement.
```

The primary primitive already supplies long-press/displacement drag (`:175-330`) and TalkBack adjustable increment/decrement actions (`:359-395`). The visible ordinal plus “Move … up/down” controls at `:403-425` are precisely the Phase 7 UI to remove.

**Apply this family:**

- Extend the primitive, not each consumer, for keyboard/D-pad Shift+Arrow equivalents required by the UI specification. Keep long press and programmatic accessibility actions. Do not expose `Position N`, visible Up, or visible Down copy.
- `OwnedPlanEditorScreen.tsx:530,575-602,865-892,1157-1229` is the canonical stable-ID, draft-only reorder model. Preserve selected-day identity through an order change and normalize ordinals at the draft boundary; do not use array index as selection identity.
- `ScheduleBindingEditor.tsx:103-246` has two consumers: Weekday currently uses plain rows, Rotation already uses the shared primitive. Bring both through the same movement/normalization capability so parity does not rely on visible buttons.
- `StarterActivationScreen.tsx:227-305` has a local move/ordinal rebuild. Replace only its old up/down glyph UI with the shared primitive/contract; retain its activation-specific draft data and save boundary.

**Tests:** copy gesture, adjustable-action, reduced-motion, hierarchy, and 200% patterns from `OwnedPlanEditor.test.tsx:708-1038,1226-end`. Update `ScheduleEditor.test.tsx:215-260` and `StarterPlans.test.tsx` near line 566 to assert drag/a11y actions and saved normalized order—not visible “Move … up” buttons.

### 4. Foreground-only 3/2/1/0 rest cues

**Targets:** `RestDock.tsx`, `RestDock.test.tsx`, existing/rest countdown ports, a new Expo audio adapter and test, `package.json`, `package-lock.json`, and two tone files.

**Structural analog:** `src/platform/notifications/expoForegroundRestFeedbackAdapter.ts:12-46` and `src/domains/rest/restNotificationPort.ts:37-40`.

```ts
// Existing port shape (restNotificationPort.ts:37-40)
interface ForegroundRestFeedbackPort {
  playTone(input: { sessionId: string }): Promise<void>;
  vibrate(): void;
}
```

The existing Expo foreground feedback adapter uses singleton initialization and returns a frozen implementation (`expoForegroundRestFeedbackAdapter.ts:12-46`); its Jest native-module mock is the test model. It is only a structural analog. Do **not** call `expo-notifications` to produce countdown tones and do **not** overload background notification-channel sound mapping in `expoRestNotificationAdapter.ts`.

**Apply this family:**

1. Define a narrow testable countdown-cue port (`short` for 3/2/1 and `long` for 0) whose only responsibility is best-effort foreground playback. It must not own persisted rest state or issue rest commands.
2. Inject an `expo-audio` adapter behind that port. It observes foreground ticks from `RestDock`, honors persisted Rest sound, deduplicates each threshold per rest session, and safely ignores unavailable/failed native playback.
3. Preserve `RestDock.tsx:196-228` as the countdown source of truth: it derives state from persisted rest/timestamp and guards terminal `onExpired()` through `expiredRef`. The cue observer never invokes expiry or modifies remaining time.
4. Use `RestDock.test.tsx:1-60,172-207` fake-now and one-shot expiry patterns to test `3,2,1,0`, no duplicate across rerenders, muted setting, foreground-only behavior, and non-authority.
5. Add `expo-audio@~57.0.4` only after the required `checkpoint:human-verify` for package legitimacy documented in `07-RESEARCH.md`; then update `package.json` and the npm-generated lockfile together.

### 5. Deterministic Concept G assets, CNG, and exact-candidate evidence

**Targets:** five current icon/splash images, the new deterministic generator and contract test, `app.config.ts`, CNG verifier, Phase 6 runner/checklist/test scripts, and four Maestro flows.

**Config and generation references:**

- `app.config.ts:20-48` is the source of truth for standard, adaptive foreground/background/monochrome, and splash paths. Preserve those stable references; generated Android output is never hand-edited.
- `scripts/check-cng-reproducible.sh:1-92` clean-prebuilds twice and byte-compares Android snapshots. Keep it as the regression gate after asset or config changes.

**Required generated-output contract:**

| Asset | Required output |
|---|---|
| `icon.png` | 1024 x 1024 opaque Concept G icon |
| `android-icon-background.png` | 512 x 512 opaque `#F6F8FB` |
| `android-icon-foreground.png` | 512 x 512 RGBA; all important mark pixels inside x/y 128–384 |
| `android-icon-monochrome.png` | 432 x 432 tintable RGBA; mark inside x/y 108–324 |
| `splash-icon.png` | 228 x 213 transparent Concept G mark |

The generator must own the deterministic drawing inputs and write all five files; the image-contract test must decode/output-check dimensions, alpha mode, background color, and safe-zone bounds. No existing repository image pipeline is close enough to copy, so use the exact pixel contract in `07-UI-SPEC.md` and `07-RESEARCH.md` rather than creating a manually edited binary workflow.

**Exact-candidate runner/checklist pattern:**

- `scripts/run-phase6-maestro.mjs:64-102,219-244,600-623,693-893` is the Phase 7 runner template. Keep the N4 pending-human condition, candidate/APK identity checks, hashed copied flows, screenshot requirements, and evidence validation. Extend/rename it for Phase 7; do not weaken it into a generic local-run recorder.
- `scripts/generate-phase6-attended-checklist.mjs:29,139-174` is the attended Samsung checklist template. Preserve `SAMSUNG_MODEL = "SM-S916B"`, installed APK hash validation, candidate-bound observations/attachments, and the prohibition on emitting approval/release authority.
- `scripts/phase6-evidence-scripts.test.mjs:81-141,889-end,1087-1123` is the `node:test` contract owner. Add Phase 7 runner argument, evidence-tamper, Samsung fixture, and package-script wiring assertions before relying on manual evidence.
- `maestro/phase6/progress-library.yaml`, `calendar-date-reorder.yaml`, `calendar-date-reorder-verify.yaml`, and `navigation-accessibility.yaml` are executable evidence, not documentation. Update assertions for the Settings gear/route, removed Today actions, row removal confirmations, and reorder accessibility while retaining native drag verification where applicable.
- Use `scripts/create-release-candidate-manifest.mjs` only as the immutable-manifest analog; its exact-byte/hash behavior must remain intact. A Phase 7 runner consumes a freshly signed candidate, reruns CNG/full matrix, and binds all evidence to that same candidate identity.

## Shared Patterns

### Exclusive mutation and durable derivatives

**Sources:** `src/platform/sqlite/serializedWriter.ts:35-73`; `src/platform/sqlite/repositories/workoutRepository.ts:1542-1859`; `tests/sqlite-host/historyCommandRepository.test.ts:266-608`.

```ts
// Required ordering for every committed removal
queue -> BEGIN IMMEDIATE -> validate revisions/ownership -> source mutation
     -> active pointer + history/progress derivatives -> session revision
     -> COMMIT -> acknowledged receipt -> runtime read/effects
// Any failure before COMMIT rolls back all pre-commit state.
```

Apply to warm-up and working-set removal. A UI success message, haptic, effect drain, view invalidation, or focus move is post-commit work.

### Runtime and UI observe committed state

**Sources:** `src/bootstrap/workoutAppRuntime.tsx:3279-3390`; `src/ui/screens/ActiveWorkoutScreen.tsx:481-655`.

```ts
const committed = await repositoryMutation(input);
const refreshed = await trustedRead();
// Apply refreshed view; only then drive post-commit UI behavior.
```

This protects the offline-critical path from optimistic stale data and makes conflict/error handling consistent across Add, Complete, and Remove.

### Shared modal/accessibility semantics

**Sources:** `src/ui/components/index.ts:404-471,807-921`; `src/ui/components/PlanEditorFields.tsx:175-425`.

- Use `IconAction`/existing glyph action semantics for touch target, accessible label, disabled state, and icon presentation.
- Use `ConfirmationSheet` for hard deletion; Cancel receives initial focus, and cancelled dismissal restores the invoking control.
- Reorder affordance remains drag plus non-visual adjustable and keyboard/D-pad alternatives. The old visible ordinal/up/down controls are prohibited by the Phase 7 UI contract.

### Test conventions

**Sources:** `src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1-300`; `src/ui/__tests__/OwnedPlanEditor.test.tsx:708-1038`; `src/ui/__tests__/RestDock.test.tsx:1-60`; `scripts/phase6-evidence-scripts.test.mjs:81-141`.

- UI: render a command-port fixture, invoke accessible labels/roles, then assert screen-level committed consequences.
- Time: use a controllable fake clock; assert threshold de-duplication and expiry one-shot behavior.
- SQLite: assert rejection and rollback using persisted facts/derivatives, not implementation call counts alone.
- Candidate tooling: use `node:test` fixtures that tamper hashes/model/flow paths and must fail closed.

### Deterministic generated native inputs

**Sources:** `app.config.ts:20-48`; `scripts/check-cng-reproducible.sh:1-92`; `scripts/create-release-candidate-manifest.mjs`.

Keep assets reproducible from script inputs, retain stable config paths, and prove CNG output reproducibility. Evidence must name the exact signed candidate and device model before it can satisfy a Phase 7 acceptance gate.

## No Analog Found

| File / concern | Role | Data Flow | Why no close analog exists | Planning direction |
|---|---|---|---|---|
| `src/platform/audio/expoRestCountdownCueAdapter.ts` | native adapter | event-driven, file-I/O | The existing notification adapter is structural only; no foreground countdown-audio implementation exists. | Follow the adapter lifecycle/API in `07-RESEARCH.md`; keep it behind the narrow cue port and never use notification channels as the cue mechanism. |
| `assets/audio/rest-cue-short.wav` | asset | file-I/O | No local audio-asset pipeline exists. | Use the short-tone contract in `07-RESEARCH.md`; license/source, duration, and deterministic packaging must be explicit. |
| `assets/audio/rest-cue-long.wav` | asset | file-I/O | No local audio-asset pipeline exists. | Use the terminal long-tone contract in `07-RESEARCH.md`; test it through the adapter, not native notification sound. |
| `scripts/generate-concept-g-icons.mjs` | utility | transform, file-I/O | No existing deterministic raster/icon generator exists. | Implement from `07-UI-SPEC.md` pixel/safe-zone requirements and make it the sole writer of the five committed assets. |
| `scripts/concept-g-image-contract.test.mjs` | test | file-I/O | No image decoder/dimension/safe-zone test exists. | Follow research/UI asset contracts and fail closed on dimension, alpha/background, or safe-zone drift. |

The Expo audio adapter itself has a useful *structural* analog (`expoForegroundRestFeedbackAdapter.ts`) but no behavior-identical analog. The plan must include `checkpoint:human-verify` before `npx expo install expo-audio` because research marks the package leg as SUS.

## Metadata

**Analog search scope:** `src/domains`, `src/platform`, `src/bootstrap`, `src/ui`, `app`, `tests`, `scripts`, `maestro`, `assets`, root config.  
**Strong analog families:** 5.  
**Files scanned:** 50+ source, test, script, config, and flow files; analog search stopped after the five families above.  
**Pattern extraction date:** 2026-09-06.  
**Current reference commit:** `3c07f78` (`wip(ux/phase7): nav highlight, header icons, notices, add-set button, copy-warmup removal`).
