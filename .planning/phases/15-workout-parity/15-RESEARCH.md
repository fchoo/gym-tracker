# Phase 15: Workout Parity - Research

**Researched:** 2026-10-06
**Domain:** Expo/React Native workout presentation over SQLite-authoritative workout, rest, history, and recovery contracts
**Confidence:** HIGH for repository architecture and current gaps; MEDIUM for external framework guidance; TIM-01 remains owner-gated

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Source: [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:18-32]

#### Workout root and active list
- **D15-01:** Warm editorial Workout shows real current identity/action immediately, then the full scrollable exercise preview. Running plan and Garmin are contextual entries.
- **D15-02:** Active Workout is one vertically scrollable session. Full long names wrap to two lines; headers own grip/name/metadata/trend/menu.
- **D15-03:** One continuous 4dp yellow active-exercise edge is the only structural marker. Current set uses amber fill, highlighted number, clock, and accessible Current state—never a second stripe.
- **D15-04:** Warm-ups precede working sets, number W1/W2 independently, and insert after warm-ups. Working sets remain 01/02 and alone drive working progress/rest.

#### Commands and recovery
- **D15-05:** Tap any set row to edit; no Edit button. Explicit Save applies the correct shipped metric profile. Complete acknowledges only the committed result and preserves values on failure.
- **D15-06:** Add Exercise and Complete Set share the compact bottom row. Rest replaces it with a full-width dock containing countdown, −15, +15, Pause/Resume, Skip.
- **D15-07:** Final committed set collapses the exercise. Toasts never cover the dock. Drag reorder retains Move up/down alternatives and cancelled gestures do not commit.
- **D15-08:** Exercise menu contains only flat between-set rest (`sec`), replace, delete. Trend stays separate. No cadence, rest-between-reps, nested Advanced Timing, or plan cue settings.
- **D15-09:** Preserve add/replace/delete, corrections, Undo recovery, finish complete/partial/later, discard, completion evidence, and explicit default-No plan write-back.

#### Owner-review checkpoint
- **TIM-01:** Retain legacy cadence/cluster facts and resume set/pointer/rest state. Disabling hidden authoring/reconciliation/playback is proposed and must be checkpointed with tests before removal.

### Claude's Discretion

Source: [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:34-35]

- Internal component boundaries when existing primitives own the same behavior.

### Deferred Ideas (OUT OF SCOPE)

Source: [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:72-75]

No in-app run recorder, per-rep cadence, nested timing screen, or new progression logic.
</user_constraints>

<phase_requirements>
## Phase Requirements

The requirement wording below is copied verbatim from the project source. [VERIFIED: .planning/REQUIREMENTS.md:51-88]

| ID | Description | Research Support |
|----|-------------|------------------|
| WRK-01 | Present the workout identity, summary, full scrollable exercise preview and Start/Resume action before secondary controls. | Recompose `TodayScreen` over the Phase 13 typed Today read model; keep route mutation wiring in `TodayRoute`. |
| WRK-02 | Select real plan-day previews with selected state and keyboard alternatives without silently advancing schedule rotation. | Add a non-mutating Workout day selector; do not reuse the current plan-editor reorder semantics as-is. |
| WRK-03 | Handle scheduled, rest/recovery and no-plan states with truthful action availability; retain starting-plan activation and empty-workout entry. | Preserve the existing `TodayView` state branches while adapting them to the richer Phase 13 snapshot. |
| WRK-04 | Preserve explicit scheduled-day, alternate-day and Start empty workout choices with cancel and focus restoration. | Reuse the start-sheet command split and Phase 14 modal/focus primitive. |
| WRK-05 | Start the selected occurrence and resume the exact saved active session after background or process death; display recovered context and retry failed reads/starts. | Bind start to the full Phase 13 selection identity; keep recovery keyed by session, never current plan. |
| WRK-06 | Provide View plan and Sync Garmin contextual actions for Running alongside Strength, backed by actual independent active schedules. | Consume Phase 13 Running/Strength Today facts; never invent `Start Run`. |
| WRK-07 | Render a full vertically scrollable exercise list with workout identity, working-set progress and compact per-exercise metadata. | Preserve `AdaptiveScreen` as the sole scroll owner and extract facts-only exercise presentation. |
| WRK-08 | Return from the active workout to its plan/root context without discarding the active session. | Keep route Back non-mutating and add route-context restoration tests. |
| WRK-09 | Expand/collapse each exercise by header tap or Enter/Space, retain full long names up to two lines, and keep trend/menu targets separate. | Extract disclosure presentation from the current monolith and preserve stable exercise IDs. |
| WRK-10 | Use one continuous 4px yellow active-exercise edge; current set uses amber fill, highlighted number, clock and Current label with no second stripe. | Add exact light/dark component and native screenshot assertions. |
| WRK-11 | Show Set, Previous, Target and State with completed check/green, current clock/amber and planned dash/neutral states. | Replace the current inline-editor row composition with a facts row and explicit state semantics. |
| WRK-12 | Open editing by tapping any planned, current or committed row; changes apply only after Save and closing leaves facts unchanged. | Move draft ownership to a shared bottom-sheet editor; delete blur-triggered persistence. |
| WRK-13 | Provide thumb-friendly kg/reps steppers and direct numeric input with units, nonnegative validation and explicit Save set values / Save committed set edit. | Reuse metric parsing/conversion and semantic fields; add explicit save-state tests. |
| WRK-14 | Use a duration-only editor for timed sets with sec labels and five-second decrement/increment controls. | Reuse duration parsing but add the required five-second controls inside the set editor. |
| WRK-15 | Retain load_reps, bodyweight_reps, added_load_reps, assisted_reps, timed_hold, fixed_distance, fixed_time, intervals and unscored facts and compatible editors. | Keep the metric registry authoritative and run the complete cross-profile matrix. |
| WRK-16 | Place warm-ups before working sets with independent W1/W2 and 01/02 ordinals; exclude warm-ups from working-set progress. | Preserve separate arrays and working-only progress; change presentation numbering only. |
| WRK-17 | Offer only Add warm-up set and Add working set from each exercise's + Add set menu; append warm-ups after existing warm-ups and before working sets. | Consolidate the current two inline add controls into one scoped menu without changing commands. |
| WRK-18 | Pair Add exercise with Complete set in one compact dock row; show Saving set… and suppress duplicate taps until the real commit result arrives. | Move completion from `SetRow` to a dock controller while retaining command in-flight guards. |
| WRK-19 | On failed set save, preserve the current row and entered values and expose Set not saved · Retry without false completion feedback. | Keep a retry-stable completion envelope and distinguish editor-save failure from completion failure. |
| WRK-20 | After the final set commits, collapse its exercise and reveal the next current exercise; warm-up completion advances without between-set rest. | Preserve authoritative post-commit pointer application and measured reveal. |
| WRK-21 | Replace completion controls with a full-width rest dock showing Resting/Rest paused, countdown and next-set context. | Remove the current collapsed-rest branch and render the complete dock whenever durable rest is running/paused. |
| WRK-22 | Provide −15, +15, Pause/Resume and Skip with accessible labels; expiry or skip restores the ready action without completing a set. | Reorder/show all existing rest commands and assert no set completion call. |
| WRK-23 | Recover the authoritative rest deadline/pause state and device-owned cues across backgrounding, process death and offline restart. | Retain timestamp/revision state, notification reconciliation, lifecycle tests, and native relaunch proof. |
| WRK-24 | Open trend via a dedicated icon and show Recent, Best, Change, six-session history and an accessible chart from comparable facts. | Add an Active-sheet adapter over existing metric-history domain output and `react-native-svg`. |
| WRK-25 | Limit exercise overflow to flat between-set timing, Replace exercise and Delete exercise; keep trend separate. | Replace the current advanced-timing action with a flat rest control and keep trend outside the menu. |
| WRK-26 | Use explicit sec controls for between-set rest and plan default rest; persist changes immediately without cadence, rest-between-reps, nested Advanced Timing or sound/haptic plan controls. | Add a typed preference/rest command boundary; do not overload advanced-timing configuration. |
| WRK-27 | Show plan identity and 1.25/2.5/5 weight-increment choices with saved selection; preserve the distinction between increment preference and existing set targets. | Persist an entry preference separately from immutable set targets and use it only for editor steps. |
| WRK-28 | Keep Edit plan after workout reachable and route to the real editor after the active session boundary, preserving schedule/history rules. | Queue only navigation intent while active; navigate after an authoritative outcome. |
| WRK-29 | Open the global Add exercise picker, search available exercises, choose an exercise and add it to the active session with loading/error/retry handling. | Retain the Phase 9 add command and replace the local modal with the shared Phase 14 sheet. |
| WRK-30 | Replace the chosen exercise through a contextual picker while retaining valid committed facts and requiring the domain's compatibility/impact rules. | Retain the Phase 9 replace receipt and history-preserving disposition. |
| WRK-31 | Require a second explicit Confirm delete action before removing an exercise and preserve committed source history and safe next-current selection. | Keep the repository `removeExercise` command; implement the two-activation label state in the menu. |
| WRK-32 | Support grip drag and accessible Move up/Move down alternatives while preserving current exercise/set identity; cancelled gestures must not commit a reorder. | Retain one revision-checked reorder command and change only the gesture/presentation adapter. |
| WRK-33 | Preserve shipped undo/edit-removal recovery through contextual feedback without adding a persistent Undo control to the approved compact dock. | Wire the already-exported `undoCompletedSet` runtime command into a Phase 14 top toast; keep removal refresh-failure paths. |
| WRK-34 | Preserve Finish workout, Finish as partial, Finish workout later, zero-set save and Discard workout with confirmation and error/retry states. | Keep the outcome repository transitions; add operation-specific pending/failure/retry UI. |
| WRK-35 | Preserve complete/partial summary, per-exercise results/effort, modified-from-plan status, details/return actions and failed-summary retry. | Recompose `WorkoutCompletionScreen` without changing its durable read source. |
| WRK-36 | Keep plan-change write-back explicit with preview/accept/cancel and failed-write retry; finishing never silently changes future targets. | Extend the preview model with factual current/proposed rows; retain default-No and revision-bound apply. |
</phase_requirements>

## Summary

Phase 15 is a presentation refactor plus a small set of missing typed application/storage seams, built on a proven workout engine. Phases 8–10 already shipped the one-scroll overview, commit-gated set transitions, stable-ID disclosure/scroll behavior, add/replace/remove/reorder receipts, default-No plan write-back, nine metric profiles, rest recovery, and advanced-timing storage. Those facts should be reused; the parity phase must not rewrite the repositories merely to match the prototype. [VERIFIED: .planning/milestones/v1.1-phases/08-session-overview-navigation/08-VERIFICATION.md:20-80; .planning/milestones/v1.1-phases/09-in-workout-exercise-editing/09-VERIFICATION.md:19-66; .planning/milestones/v1.1-phases/10-advanced-set-timing/10-VERIFICATION.md:20-87]

The current presentation materially differs from the approved contract: the root still renders `Today`; `PlanDaySwitcher` is an editor reorder widget and is not used by the root; `SetRow` owns inline fields, blur-triggered persistence, Complete, Reset, and Remove; `RestDock` hides controls behind an expand toggle; `ActiveWorkoutScreen` still exposes advanced-timing controls; the active route loads/reconciles advanced timing; and the runtime Undo capability is not passed to the active screen. [VERIFIED: src/ui/screens/TodayScreen.tsx:350-479; src/ui/components/PlanDaySwitcher.tsx:27-93; src/ui/components/SetRow.tsx:402-455,681-727,1091-1234; src/ui/components/RestDock.tsx:162-201,332-455; app/workout/[sessionId].tsx:43-95,145-205; src/bootstrap/workoutAppRuntime.tsx:919-956,4238-4364]

The highest-risk work is not visual styling. It is preserving exact plan/schedule selection across the Phase 13 multi-plan contract, keeping every set/outcome acknowledgement behind the SQLite commit boundary, preserving all schema-21/27 timing bytes, and ensuring Phase 16 receives a facts-only presentation seam with no workout mutation capabilities. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:30-41,131-166; .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377]

**Primary recommendation:** use a strangler refactor: freeze/characterize the shipped commands first; extract facts-only Workout presentation; then replace root, editor, dock, rest, menus, and completion incrementally; gate all legacy timing runtime removal at TIM-01; finish with source, real-SQLite, native recovery, visual, accessibility, and performance evidence. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:225-248,252-370,410-595,643-773]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workout root selection and composition | Mobile client UI | Application/runtime | The UI selects a read-model occurrence; the runtime validates and starts the exact Phase 13 identity. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:131-141; src/bootstrap/workoutAppRuntime.tsx:2473-2513] |
| Active exercise/set presentation | Mobile client UI | Domain read model | `ActiveWorkoutScreen` consumes `WorkoutSessionView`; source facts remain repository-owned. [VERIFIED: app/workout/[sessionId].tsx:43-95,145-207; src/domains/workout/activeWorkout.ts:113-140] |
| Set draft/save/complete | Domain/application | Database/storage | Metric validation and revision/idempotency checks precede the exclusive repository transaction; presentation applies the returned view. [VERIFIED: src/domains/workout/setCommands.ts:66-129,214-247; src/platform/sqlite/repositories/workoutRepository.ts:3172-3375] |
| Rest countdown and controls | Domain/application | OS adapter | SQLite deadline/pause/revision is authoritative; the visible countdown and OS notification are projections. [VERIFIED: src/domains/rest/restState.ts:1-29,48-210; src/platform/notifications/restNotificationReconciler.ts:96-199] |
| Session exercise add/replace/delete/reorder | Domain/application | Database/storage | Existing bounded commands and separate immutable receipts own mutations; UI owns only intent and feedback. [VERIFIED: src/domains/workout/sessionExerciseCommands.ts:13-172; src/platform/sqlite/repositories/workoutRepository.ts:1536-1852] |
| Completion and plan write-back | Domain/application | Database/storage | Completion is durable before summary/write-back; plan apply is a separate preview/revision-bound operation. [VERIFIED: src/domains/workout/finishWorkout.ts:61-182; src/bootstrap/workoutAppRuntime.tsx:3949-4057] |
| Phase 16 historical/planned workout detail | Mobile client UI | Read-only domain ports | Calendar-origin details may disclose facts only and must receive no mutation, rest-effect, correction, removal, or resume capability. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:259-263,279-292,367-377] |
| Legacy cadence/cluster retirement | Application/runtime | Database/storage | UI removal is locked, but runtime playback/reconciliation retirement is owner-gated; stored facts remain intact. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:578-595; .planning/architecture/v1.2-multi-active-plans.md:151-166] |

## Project Constraints (from .trae/rules/rules.md)

- Read and follow repository `AGENTS.md`; its routing directs this task through the GSD planning/research workflow. [VERIFIED: .trae/rules/rules.md:1-3; AGENTS.md:1-18]
- Treat the specified product/design, engineering QA, approved core-workout image, and app-system image as project sources. The two Markdown filenames exist in this workspace with a `bytedance-` prefix; the approved images exist at the configured locations. [VERIFIED: .trae/rules/rules.md:5-12; filesystem probe]
- Keep SQLite source facts authoritative. [VERIFIED: .trae/rules/rules.md:14-16]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:16-17]
- Do not acknowledge a set before its exclusive transaction commits. [VERIFIED: .trae/rules/rules.md:17-18]
- Preserve bundled versus user-owned data boundaries. [VERIFIED: .trae/rules/rules.md:18-19]
- Keep the workout critical path offline. [VERIFIED: .trae/rules/rules.md:19-20]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. [VERIFIED: .trae/rules/rules.md:20-21]
- If commits are later authorized, use atomic commits and end every commit message with the exact trailer `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`. No commit is authorized in this research task. [VERIFIED: .trae/rules/rules.md:21-26]

## Current Baseline and Gap Map

| Surface | Reusable live seam | Gap the plan must close |
|---|---|---|
| Workout route/root | `TodayRoute` already routes activation, exact resume, scheduled/alternate/rest-day start, empty start, settings, and retry. [VERIFIED: app/(tabs)/index.tsx:18-140] | `startPlanDay(dayId, mode)` still rediscovers the active plan independently, and `TodayView` has no multi-plan occurrence identity or Running context. Phase 15 must consume the Phase 13 typed selection rather than preserve this singleton signature. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2473-2513; src/domains/workout/index.ts:60-104] |
| Workout root presentation | `TodayScreen` has factual loading/failure, scheduled, rest, active, and saved-partial branches. [VERIFIED: src/ui/screens/TodayScreen.tsx:82-162,173-338,350-542] | The visible heading is `Today`, the scheduled layout is card-first rather than editorial scan-first, and there is no five-day preview or Running/Garmin context. [VERIFIED: src/ui/screens/TodayScreen.tsx:195-272,460-479] |
| Day selector | `PlanDaySwitcher` has stable day IDs and accessible selected state. [VERIFIED: src/ui/components/PlanDaySwitcher.tsx:27-93] | It is an owned-plan reorder control and its only production use is the plan editor; reusing it unchanged would expose schedule mutation in a preview-only surface. [VERIFIED: src/ui/components/PlanDaySwitcher.tsx:27-44,54-89; src/ui/screens/OwnedPlanEditorScreen.tsx:1269] |
| Active route | `ActiveWorkoutRoute` loads a `WorkoutSessionView`, available exercises, and passes all existing command ports to `ActiveWorkoutScreen`. [VERIFIED: app/workout/[sessionId].tsx:43-107,145-207] | It also loads and exposes every advanced-timing command, has no direct Retry for a failed active read, does not pass `undoCompletedSet`, and has no trend loader/navigation capability. [VERIFIED: app/workout/[sessionId].tsx:51-95,109-133,147-191; src/bootstrap/workoutAppRuntime.tsx:665-671,919-956] |
| Active screen | Stable-ID owner resolution, committed-view application, revision-keyed measured scrolling, and separate mutation failure/recovery branches already exist. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:281-339,797-980,1380-1507,1718-1978] | The 3,275-line component owns too many independent concerns and still renders advanced timing, old menus, inline add controls, and incomplete dock composition. [VERIFIED: source line count; src/ui/screens/ActiveWorkoutScreen.tsx:982-1018,2072-2155,2388-2765,2767-3150] |
| Set row/editor | Formatting and observation construction cover all shipped metric shapes; the row preserves local draft strings. [VERIFIED: src/ui/components/SetRow.tsx:40-278,493-540,542-679] | It auto-persists on blur/time-field change and embeds Reset/Complete/Remove actions; this conflicts with tap-row → sheet → explicit Save and dock-owned completion. [VERIFIED: src/ui/components/SetRow.tsx:681-752,1091-1234; .planning/phases/15-workout-parity/15-UI-SPEC.md:281-316,410-427] |
| Rest | The domain derives time from absolute timestamps and persists `idle`, `running`, `paused`, and `expired`; commands are revision checked. [VERIFIED: src/domains/rest/restState.ts:1-29,48-210; src/domains/rest/restCommands.ts:8-47] | `RestDock` is collapsible, orders actions differently, exposes optional Undo inside the dock, and lacks the exercise name in next-set context. [VERIFIED: src/ui/components/RestDock.tsx:162-198,332-455] |
| Exercise editing/reorder | Add/replace/remove/reorder already use bounded IDs, SHA-256 request evidence, expected revisions, protected-history dispositions, and separate receipt authorities. [VERIFIED: src/domains/workout/activeWorkout.ts:175-255; src/domains/workout/sessionExerciseCommands.ts:13-172; src/platform/sqlite/repositories/workoutRepository.ts:1536-1852] | Current exercise action copy says `Configure timing` and `Remove exercise`; the approved menu requires flat `Timing`, `Replace exercise`, `Delete exercise`, plus a two-activation delete label. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:2824-2883; .planning/phases/15-workout-parity/15-UI-SPEC.md:320-406] |
| Reorder gesture | `PlanEditorReorderableRow` already routes drag and accessibility actions to the same callback and resets visual preview on finalize. [VERIFIED: src/ui/components/PlanEditorFields.tsx:174-275,277-331,342-429] | It activates after a `550` ms long press, whereas Phase 15 requires movement activation after `8dp`; make this behavior configurable or create a Workout-specific grip so plan-editor behavior does not silently change. [VERIFIED: src/ui/components/PlanEditorFields.tsx:57-75,277-305; .planning/phases/15-workout-parity/15-UI-SPEC.md:398-406] |
| Trend | The domain already groups only comparable metric evidence and exposes best/last/average plus source visits. [VERIFIED: src/domains/history/metricHistory.ts:19-50,63-210] | The current active screen has no trend action/port, and `ExerciseHistoryScreen` is a full route with Best/Average/Last rather than the required Active sheet with Recent/Best/Change, six rows, and accessible chart. [VERIFIED: app/exercise-history/[exerciseId].tsx:13-33; src/ui/screens/ExerciseHistoryScreen.tsx:44-50,140-166,236-289; src/ui/screens/ActiveWorkoutScreen.tsx:477-495] |
| Completion | Completion detail, effort, recommendation, and default-No write-back states already exist. [VERIFIED: src/ui/screens/WorkoutCompletionScreen.tsx:65-126,128-379; src/domains/workout/finishWorkout.ts:61-182] | The write-back preview exposes final `composition` but no explicit authoritative current-versus-proposed change rows, so presentation must not invent differences by comparing formatted strings. [VERIFIED: src/domains/plans/planImpactCommands.ts:134-154; .planning/phases/15-workout-parity/15-UI-SPEC.md:529-566] |
| Phase 16 reuse | `SessionDetail` is read-only data, but `SessionDetailScreen` still accepts correction, removal, history-navigation, and resume callbacks. [VERIFIED: src/domains/workout/sessionDetail.ts:103-134; src/ui/screens/SessionDetailScreen.tsx:109-125,376-430] | Do not pass `readOnly=true` to a mutation-capable Active or SessionDetail screen. Extract facts-only presentation components that cannot receive mutation ports. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377] |

## Standard Stack

### Core

No package addition or upgrade is needed. Reuse the lockfile-pinned stack. [VERIFIED: package.json:92-132]

| Library | Version | Purpose | Why Standard Here |
|---------|---------|---------|-------------------|
| Expo | `"expo": "~57.0.25"` | Native app runtime and SDK coordination | Existing project runtime; no upgrade belongs in a parity refactor. [VERIFIED: package.json:92-109] |
| React Native | `"react-native": "0.86.3"` | Native components, accessibility, app lifecycle | Existing UI platform and current source API surface. [VERIFIED: package.json:113-120] |
| Expo Router | `"expo-router": "~57.0.23"` | Workout, completion, plan, and history routing | Existing route ownership is already concentrated under `app/`. [VERIFIED: package.json:106; app/workout/[sessionId].tsx:1-6; app/completion/[sessionId].tsx:1-5] |
| Expo SQLite | `"expo-sqlite": "~57.0.3"` | Authoritative local data and exclusive mutations | Existing `SqliteKernel` serializes one writer and parameterizes repository queries. [VERIFIED: package.json:109; src/platform/sqlite/sqliteKernel.ts:22-60,124-176] |
| Zod | `"zod": "4.4.3"` | Exact metric/input boundary validation | Existing metric schemas are strict and versioned. [VERIFIED: package.json:123; src/domains/metrics/contracts.ts:1-39,76-255] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Expo Notifications | `"expo-notifications": "~57.0.21"` | Disposable OS rest alerts | Only through the existing rest notification port/reconciler. [VERIFIED: package.json:105; src/platform/notifications/expoRestNotificationAdapter.ts:68-143] |
| Gesture Handler / Reanimated / Worklets | `"~2.32.0"` / `"4.5.1"` / `"0.10.1"` | Reorder gesture and motion policy | Extend the existing reorder primitive; do not add another gesture package. [VERIFIED: package.json:115-122; src/ui/components/PlanEditorFields.tsx:1-24,174-331] |
| React Native SVG | `"15.15.4"` | Accessible six-session trend chart | Use with an adjacent written description and factual rows. [VERIFIED: package.json:121; .planning/phases/15-workout-parity/15-UI-SPEC.md:449-459] |
| Jest / jest-expo / RNTL | `"29.7.0"` / `"~57.0.5"` / `"14.0.1"` | Unit, component, SQLite-host, integration tests | Existing four-project test architecture. [VERIFIED: package.json:125-132; jest.config.js:1-90] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing `AdaptiveScreen` as sole vertical owner | Nested list or independent exercise scrollers | Rejected by the Phase 8/14 single-scroll contract. `ScrollView` renders all children, so retain it only with bounded representative-session performance evidence; do not nest another owner. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:50-84,177-255; .planning/milestones/v1.1-phases/08-session-overview-navigation/08-01-SUMMARY.md:21-37] [CITED: https://reactnative.dev/docs/scrollview] |
| Facts-only shared presentation | `readOnly` boolean on `ActiveWorkoutScreen` | Rejected because the current screen requires a large mutation command object and owns lifecycle effects; type-level absence of mutation capabilities is safer for Phase 16. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:119-192,477-554; .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292] |
| Existing metric registry | Route-local metric switch or new form library | Rejected because all nine versioned profiles and validation already exist. [VERIFIED: src/domains/metrics/contracts.ts:5-33,85-255; src/domains/metrics/registry.ts:30-173] |
| Existing SQLite settings/command patterns | `localStorage`, AsyncStorage, or component cache as authority | Rejected by the owner and UI contract; any new preference requires a typed SQLite-backed port and recovery/backup tests. [VERIFIED: .planning/v1.2-OWNER-BRIEF.md:41-64; .planning/phases/15-workout-parity/15-UI-SPEC.md:568-575,777-797] |

**Installation:** none. Do not change `package.json` or `package-lock.json` for Phase 15 unless an independently justified deviation is approved. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:62-77,818-824]

## Package Legitimacy Audit

Not applicable: the recommended implementation installs zero external packages and uses only dependencies already pinned in `package.json`. If a plan introduces a package, it must add a package-legitimacy checkpoint before installation; that would be a deviation from this research. [VERIFIED: package.json:92-132; .planning/phases/15-workout-parity/15-UI-SPEC.md:818-824]

## Architecture Patterns

Phase 15 consumes the canonical Phase 14 geometry: root bottom navigation is 74dp plus safe area and shared sheets/dialog content is capped at 82% of available height. No Phase 15 component may diverge from those upstream measurements.

### System Architecture Diagram

```text
Phase 13 typed Today/occurrence facts
                |
                v
Workout route -> Workout root presenter -> selected preview (read only)
                |                         |
                | explicit Start/Resume   | no schedule mutation
                v                         |
typed workout command --------------------+
                |
                v
       serialized SQLite writer
                |
        COMMIT / conflict / failure
                |
                v
 authoritative WorkoutSessionView
                |
                v
 Active controller -> facts-only session presentation -> set editor / menu / trend
        |                         |
        |                         +---- Phase 16 read-only adapters
        |                               (no command capabilities)
        v
 Complete / rest / edit / outcome commands
        |
        +---- durable rest state -> post-commit notification reconciliation -> OS
        |
        +---- completion fact -> summary projection -> explicit plan write-back
```

The flow preserves one source of truth: presentation proposes intent, domain commands validate, repositories commit through the serialized writer, and only returned/reloaded authoritative views drive success UI. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:22-60,124-176; src/domains/workout/setCommands.ts:214-232; src/bootstrap/workoutAppRuntime.tsx:3610-3648,3900-3923]

### Recommended Project Structure

```text
app/
├── (tabs)/index.tsx                    # existing Workout-root route adapter
├── workout/[sessionId].tsx             # existing active route/controller wiring
├── completion/[sessionId].tsx          # existing durable completion route
└── exercise-history/[exerciseId].tsx   # existing full history route
src/
├── domains/workout/                     # existing commands/types; add typed settings/read-model helpers here
├── platform/sqlite/repositories/        # existing exclusive persistence adapters
├── bootstrap/workoutAppRuntime.tsx      # existing application composition; expose narrow capabilities
└── ui/
    ├── screens/TodayScreen.tsx          # preserve export, render approved Workout root
    ├── screens/ActiveWorkoutScreen.tsx  # active-only controller after extraction
    ├── screens/WorkoutCompletionScreen.tsx
    └── components/
        ├── WorkoutSessionPresentation.tsx   # proposed facts-only shared shell
        ├── WorkoutSetFactsRow.tsx            # proposed non-mutating row
        ├── WorkoutSetEditorSheet.tsx         # proposed explicit-save editor
        ├── WorkoutActionDock.tsx             # proposed Add/Complete/Retry dock
        ├── WorkoutPlanSettingsSheet.tsx      # proposed flat rest/increment settings
        └── ExerciseTrendSheet.tsx             # proposed six-session factual trend
```

Existing file paths above were opened in this session; proposed component paths are recommendations under D15's component-boundary discretion, not claims that those files already exist. [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:34-35; filesystem inspection]

### Pattern 1: Facts-only presentation, capability-owned mutation

**What:** Extract the identity/progress/exercise/set visuals from `ActiveWorkoutScreen`; the extracted components receive immutable presentation data and disclosure state only. `ActiveWorkoutScreen` retains command orchestration, editor/menu state, optimistic-concurrency inputs, and recovery messages. Phase 16 adapts `SessionDetail` or a planned occurrence into the same facts view without importing or receiving workout commands. [VERIFIED: src/domains/workout/activeWorkout.ts:45-140; src/domains/workout/sessionDetail.ts:14-134; .planning/phases/16-calendar-parity/16-UI-SPEC.md:259-263,279-292]

**Why:** The current `SessionDetail.readOnly` fact does not make `SessionDetailScreen` capability-safe because that screen separately accepts correction, removal, and resume callbacks. [VERIFIED: src/domains/workout/sessionDetail.ts:103-134; src/ui/screens/SessionDetailScreen.tsx:109-125,376-430]

### Pattern 2: Explicit editor draft, one Save boundary

**What:** Initialize a local editor draft from `observationForSet`; steppers and direct input update only that draft; Close/Back/scrim discard it; Save validates once and invokes either `updateActiveSetDraft`/`updateWarmupDraft` or `reviseCompletedSet`. Completion reads only the latest authoritative saved observation. [VERIFIED: src/ui/components/SetRow.tsx:72-158,542-679; src/domains/workout/setCommands.ts:66-141,214-247; .planning/phases/15-workout-parity/15-UI-SPEC.md:285-316]

### Pattern 3: Commit-result-driven UI transitions

**What:** Retain in-flight suppression and revision/idempotency inputs. Green/check state, progress, collapse, next pointer, rest, toast, haptic, and navigation occur only after a committed result; an `already_completed` replay renders authoritative state but does not replay effects. [VERIFIED: src/domains/workout/activeWorkout.ts:314-333; src/domains/workout/setCommands.ts:214-232; src/platform/sqlite/repositories/workoutRepository.ts:3172-3375]

### Pattern 4: Durable rest, disposable platform projection

**What:** Derive countdown from persisted timestamps, use revision-checked ±15/pause/resume/skip/expire commands, and reconcile the single stable OS notification after commit and lifecycle transitions. Keep the 1-second visual tick inside `RestDock` so the whole exercise list does not rerender each second. [VERIFIED: src/domains/rest/restState.ts:48-210; src/platform/notifications/restNotificationReconciler.ts:92-199; src/ui/components/RestDock.tsx:217-330]

### Pattern 5: Reorder preview versus commit

**What:** Gesture movement changes only local preview geometry. Only successful end invokes the same revision-checked reorder command used by Move up/down. Cancel/finalize clears preview; commit applies the returned order and leaves active exercise/set identities unchanged. [VERIFIED: src/ui/components/PlanEditorFields.tsx:57-95,225-331; src/domains/workout/activeWorkout.ts:235-255; src/platform/sqlite/repositories/workoutRepository.ts:1743-1852]

### Anti-Patterns to Avoid

- **UI-only multi-plan patch:** never pass a day ID and let runtime rediscover whichever plan is active; use the exact Phase 13 plan/day/schedule/version/opportunity identity. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:21-23]
- **`readOnly` boolean on a mutation-capable component:** it can accidentally leak keyboard/accessibility handlers even when buttons are visually hidden. Use a component that has no mutation props. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377]
- **Blur-as-save:** current `SetRow` persists on blur and duration changes; Phase 15 requires explicit Save and dismissal with no source change. [VERIFIED: src/ui/components/SetRow.tsx:681-752,1103-1151; .planning/phases/15-workout-parity/15-UI-SPEC.md:285-316]
- **UI-only cadence retirement:** hiding controls while foreground reconciliation and queued callbacks remain active can emit invisible cues. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2348-2380,3192-3235; .planning/architecture/v1.2-multi-active-plans.md:151-166]
- **Target rewrite for increment preference:** `incrementGrams` is part of versioned metric target facts; the preference must remain separate from current targets, completed facts, and history. [VERIFIED: src/domains/metrics/contracts.ts:85-105,131-147; .planning/phases/15-workout-parity/15-UI-SPEC.md:343-385]
- **Success from timeout/animation:** a timeout or unknown outcome must reload source state; do not infer completion from a toast, timer, animation, or stale cache. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:487-500,568-575]

## Exact Component and Symbol Responsibilities

| File / symbol | Phase 15 responsibility | Preserve / change |
|---|---|---|
| `app/(tabs)/index.tsx` / `TodayRoute` | Adapt Phase 13 Today/occurrence data into Workout-root props and route exact start/resume/context actions. | Preserve route ownership; change the start call only after Phase 13 provides explicit identity. [VERIFIED: app/(tabs)/index.tsx:18-140; .planning/architecture/v1.2-multi-active-plans.md:131-141] |
| `src/ui/screens/TodayScreen.tsx` / `TodayScreen` | Render the approved Workout root ordering and truthful states. | Preserve factual branches; replace visual hierarchy and add selected preview state. [VERIFIED: src/ui/screens/TodayScreen.tsx:350-542; .planning/phases/15-workout-parity/15-UI-SPEC.md:179-223] |
| `src/ui/components/PlanDaySwitcher.tsx` / `PlanDaySwitcher` | Remain plan-editor reorder UI. | Do not silently change its semantics for Workout preview. Introduce a separate selector or a clearly typed read-only variant. [VERIFIED: src/ui/components/PlanDaySwitcher.tsx:27-93; src/ui/screens/OwnedPlanEditorScreen.tsx:1269] |
| `app/workout/[sessionId].tsx` / `ActiveWorkoutRoute` | Load/retry authoritative workout, wire narrow active commands, pass root/plan return context. | Remove advanced-timing wiring only after TIM-01; add Undo/trend/settings capabilities explicitly. [VERIFIED: app/workout/[sessionId].tsx:43-95,109-207] |
| `src/ui/screens/ActiveWorkoutScreen.tsx` / `ActiveWorkoutScreen` | Own active-only orchestration and authoritative view application. | Preserve stable-ID state and command handlers; extract facts rendering and break up independent sheets/docks. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:119-339,477-554,797-980] |
| `src/ui/components/SetRow.tsx` / `SetRow`, `observationForSet`, `formatObservation` | Present row facts and format all metric observations. | Preserve exported formatters; remove inline persistence and embedded Complete from the row. [VERIFIED: src/ui/components/SetRow.tsx:40-278,402-468,681-727,1091-1234] |
| `src/ui/components/SemanticNumberField.tsx` / `SemanticNumberField` | Direct numeric input with canonical draft owned by caller. | Reuse; domain validation still decides Save. [VERIFIED: src/ui/components/SemanticNumberField.tsx:19-84,85-169] |
| `src/ui/components/TimeDurationField.tsx` / `TimeDurationField` | Seconds/duration input and focus restoration. | Reuse parsing; add five-second controls at the Phase 15 editor level rather than changing all consumers. [VERIFIED: src/ui/components/TimeDurationField.tsx:30-101,102-147] |
| `src/ui/components/RestDock.tsx` / `RestDock` | Render full-width durable rest state and all controls. | Remove `expanded`; order all four controls exactly; move Undo to the shared top-toast path. [VERIFIED: src/ui/components/RestDock.tsx:162-198,332-455; .planning/phases/15-workout-parity/15-UI-SPEC.md:429-445] |
| `src/ui/components/PlanEditorFields.tsx` / `PlanEditorReorderableRow` | Reuse drag preview and Move up/down dispatch if configurable without breaking plan editing. | Current long-press activation is not the Phase 15 8dp contract; isolate the change. [VERIFIED: src/ui/components/PlanEditorFields.tsx:57-75,174-331] |
| `src/domains/workout/activeWorkout.ts` / `ActiveWorkoutRepository`, request/result types | Preserve all revision, metric identity, receipt, pointer, and result contracts. | Add only narrow preference/rest capabilities and any Phase 13 provenance needed by the read model. [VERIFIED: src/domains/workout/activeWorkout.ts:39-140,142-397] |
| `src/platform/sqlite/repositories/workoutRepository.ts` / `createWorkoutRepository` | Keep set/edit/reorder/Undo transitions atomic and source-authoritative. | Add the missing revision-fenced session-exercise `default_rest_seconds` command; return/reload the authoritative view and never mutate current rest. Do not rewrite proven transitions for layout. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1536-1852,2195-2313,3172-3375,3449-3603] |
| `src/bootstrap/workoutAppRuntime.tsx` / `RuntimeValue`, `runWorkoutMutation`, `runRestCommand` | Compose narrow ports, refresh/invalidate after commits, and map failure/recovery. | Split read capabilities from mutations for route consumers; do not expose the full runtime to Phase 16. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:592-963,3133-3266,3580-3697,3880-4072] |
| `src/domains/history/metricHistory.ts` / `buildExerciseMetricHistory` | Own compatible grouping and factual history selection. | Add a pure six-session trend projection if needed; presentation must not compare incompatible segments. [VERIFIED: src/domains/history/metricHistory.ts:19-50,63-210] |
| `src/ui/screens/WorkoutCompletionScreen.tsx` / `WorkoutCompletionScreen` | Render durable complete/partial summary and default-No write-back. | Add source-provided change rows/no-difference state; retain effort as optional and non-blocking. [VERIFIED: src/ui/screens/WorkoutCompletionScreen.tsx:65-126,128-379] |
| `src/domains/plans/planImpactCommands.ts` / `SessionExerciseEditsForPlanPreview` | Own canonical plan-write preview and apply payload. | Extend the domain preview with factual current/proposed rows; never compare display strings in UI. [VERIFIED: src/domains/plans/planImpactCommands.ts:36-154] |

## Safest Refactor and Execution Order

1. **Prerequisite gate:** verify Phase 13's exact typed multi-plan Today/start/provenance ports and Phase 14's shared tokens, `BottomSheet`, `ConfirmationDialog`, `SemanticToast`, focus, and root-shell exports exist. Stop rather than reconstruct either dependency inside Phase 15. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:9-35,58-79; .planning/phases/14-prototype-visual-shell/14-CONTEXT.md:9-33,49-58]
2. **Characterize before extraction:** add/retain tests for every current metric, complete/replay/failure branch, rest transition, reorder receipt, outcome, write-back, and process-death path. This establishes a behavioral safety net before changing the 3,275-line active screen. [VERIFIED: current source line count; jest.config.js:26-90; .planning/milestones/v1.1-phases/08-session-overview-navigation/08-VERIFICATION.md:82-109; .planning/milestones/v1.1-phases/09-in-workout-exercise-editing/09-VERIFICATION.md:53-66; .planning/milestones/v1.1-phases/10-advanced-set-timing/10-VERIFICATION.md:89-140]
3. **TIM-01 pre-checkpoint proof:** add retirement characterization for every advanced state, foreground subscription, queued callback, relaunch, manual restore, automatic replacement, and new snapshot/set path. Present the checkpoint before deleting/gating runtime behavior. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:57-80; .planning/phases/15-workout-parity/15-UI-SPEC.md:578-595]
4. **Extract facts-only presentation with no visual change:** introduce `WorkoutSessionPresentation`/`WorkoutSetFactsRow` (recommended names), adapt current Active data to it, and prove no command or persistence calls occur from presentation-only rendering/disclosure. This is the Phase 16 seam. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:259-263,279-292,354-377]
5. **Deliver Workout root:** consume the Phase 13 selected occurrence object, add the non-mutating five-day preview selector and Running context, then preserve start/resume/start-alternative failure and focus behavior. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:181-223]
6. **Replace set editing and command dock:** add `WorkoutSetEditorSheet`; render factual rows; Save through existing metric/domain commands; move warm-up/working completion to `WorkoutActionDock`; keep in-flight and retry identities stable. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:252-316,410-427; src/domains/workout/setCommands.ts:120-175,214-247]
7. **Recompose exercise controls:** add the sole active edge, exact header target order, scoped Add-set menu, separate trend, flat Timing/Replace/Delete menu, two-step delete, and 8dp drag activation while retaining the same Phase 9 command payloads. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:239-248,320-406]
8. **Flatten rest/settings:** expand `RestDock` permanently; add the revision-fenced session-exercise `default_rest_seconds` command and saved/draft/pending/failure/retry/reload UI; add the typed plan-scoped SQLite preference port. After both ports exist, wire `weightIncrementGrams` to subsequent editor step actions and resolve a later eligible rest from exercise override then plan `defaultRestSeconds`, without changing target JSON or an already-running rest. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:343-445; src/domains/rest/restState.ts:1-29,48-210]
9. **Close outcomes/completion:** add operation-specific pending/failure/retry states, deferred plan-editor navigation, factual complete/partial composition, and domain-produced write-back difference rows. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:463-575]
10. **Apply the accepted TIM-01 branch:** if retirement is approved, remove UI authoring and gate every runtime entry/reconciliation/callback while retaining storage and restore parsing; if it is not approved and zero-cue isolation cannot be proved, block Phase 15 cutover and retain the reviewed compatibility path. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:151-166]
11. **Run the full parity gate:** source tests, 100% integrity-critical branch coverage, real SQLite, exact-HEAD Android, process death/offline/notification, visual overlay, accessibility, and performance. Do not reuse v1.1 native artifacts as v1.2 proof. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:643-665,724-773; .planning/research/v1.2/SUMMARY.md:87-93]

## Phase 16 Read-Only Reuse Seam

Use three layers:

1. **Source adapters:** one adapter maps live `WorkoutSessionView`; a later Phase 16 adapter maps `SessionDetail`; another maps a planned occurrence without fabricating a session ID. [VERIFIED: src/domains/workout/activeWorkout.ts:113-140; src/domains/workout/sessionDetail.ts:103-134; .planning/phases/16-calendar-parity/16-UI-SPEC.md:259-263,281-290]
2. **Facts-only components:** identity/progress strip, exercise disclosure, table header, and set facts row accept immutable display models and presentation-only disclosure events. They contain no runtime import, command port, completion callback, rest effect, editor opening, reorder, correction, resume, or removal action. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:259-263,279-292,354-377]
3. **Active-only controller:** `ActiveWorkoutScreen` composes the facts-only layer with set-editor, trend, exercise menu, reorder grip, action/rest dock, toasts, and mutation/recovery states. Phase 16 imports only the facts-only layer. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:225-248,252-445]

Test the boundary structurally: the Phase 16 presentation fixture must render without creating `ActiveWorkoutCommands`; tapping disclosure may change only local expanded state; route tests assert zero calls to set, rest, correction, resume, removal, write-back, or schedule commands. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:283-292,354-377]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite concurrency | Route-local transactions or direct screen SQL | Existing `SqliteKernel.write` and repository commands | The kernel serializes writes and translates commit/rollback failures. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:38-82,139-205] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/] |
| Metric validation/conversion | Ad-hoc per-screen parsers | `MetricIdentitySchema`, metric registry, `parseMetricObservation`, existing formatting helpers | Nine profiles and two timed-hold contract versions already have strict schemas. [VERIFIED: src/domains/metrics/contracts.ts:5-39,85-255; src/domains/metrics/registry.ts:30-173] |
| Set completion idempotency | Boolean-only debounce | Existing revision plus `completionIdempotencyKey` command/repository contract | Replay distinguishes `committed` from `already_completed`; side effects run only for committed. [VERIFIED: src/domains/workout/activeWorkout.ts:314-333; src/domains/workout/setCommands.ts:214-232] |
| Rest countdown authority | Decrementing a persisted counter | `remainingRestMs` over durable deadline/paused remainder | Background/process time is derived rather than guessed. [VERIFIED: src/domains/rest/restState.ts:48-57,59-210] |
| Rest notifications | Direct Expo calls from UI | Existing `RestNotificationPort` and `createRestNotificationReconciler` | It lists/cancels/schedules stable session requests and treats platform failure as non-authoritative. [VERIFIED: src/platform/notifications/restNotificationReconciler.ts:68-199; src/platform/notifications/expoRestNotificationAdapter.ts:68-143] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/] |
| Exercise edit/reorder persistence | Array mutation followed by generic save | Existing Phase 9 commands and receipt ledgers | They preserve immutable history, pointer/rest repair, replay, and stale-revision rejection. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1536-1852] |
| Comparable trend selection | Cross-profile string comparison | `buildExerciseMetricHistory` and metric comparators | Existing logic groups compatible evidence before best/last/aggregate selection. [VERIFIED: src/domains/history/metricHistory.ts:63-210] |
| Sheets/toasts/focus | Route-local `Modal` clones | Phase 14 shared overlay/focus primitives | The dependency explicitly owns keyboard safety, modal focus, restoration, and dock-safe top toasts. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-CONTEXT.md:19-33,49-58] |
| Trend chart package | New chart dependency | Existing `react-native-svg` plus written facts/description | The dependency is already pinned, while accessible text remains authoritative. [VERIFIED: package.json:121; .planning/phases/15-workout-parity/15-UI-SPEC.md:449-459] |

**Key insight:** the hard behavior already exists in domain/repository code; Phase 15 should reduce presentation coupling and add narrow missing ports, not rebuild workout state machines. [VERIFIED: .planning/milestones/v1.1-phases/08-session-overview-navigation/08-VERIFICATION.md:20-80; .planning/milestones/v1.1-phases/09-in-workout-exercise-editing/09-VERIFICATION.md:19-66; .planning/milestones/v1.1-phases/10-advanced-set-timing/10-VERIFICATION.md:20-87]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | SQLite database name is quoted verbatim as `"gym-tracker.db"`. Current migration registry ends with `advancedTimingTargetOwnershipMigration`; `CURRENT_SCHEMA_VERSION` is computed from registered migrations. Schema 21 stores `advanced_timing_default_json`, nullable `advanced_timing_override_json`, immutable `advanced_timing_resolved_json`, and `session_advanced_timing_states`; schema 27 adds cross-session target ownership triggers. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:399; src/platform/sqlite/migrations/index.ts:1-60; src/platform/sqlite/migrations/0021_advanced_set_timing.ts:77-150; src/platform/sqlite/migrations/0027_advanced_timing_target_ownership.ts:4-33] | No destructive migration. Preserve legacy timing bytes, session/set identities, receipts, pointer, and rest. If flat preferences need a new schema after Phase 13, use the actual next migration number and add backup/restore/merge coverage. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:63-110,149-166] |
| Live service config | No remote workout service is in this phase. Local notification requests are an external projection listed/cancelled/rescheduled from durable rest state. [VERIFIED: src/platform/notifications/restNotificationReconciler.ts:96-199] | Keep reconciliation post-commit and on lifecycle recovery. Do not let TIM-01 disable supported rest notifications/cues. [VERIFIED: src/bootstrap/workoutLifecycle.ts:277-420; .planning/architecture/v1.2-multi-active-plans.md:155-166] |
| OS-registered state | Rest notification IDs are quoted verbatim as `` `rest:${sessionId}` ``; the adapter creates Android channels and schedules/cancels notifications. [VERIFIED: src/platform/notifications/restNotificationReconciler.ts:92-94,134-193; src/platform/notifications/expoRestNotificationAdapter.ts:23-48,68-143] | Reconcile stale/duplicate notifications after rest mutations, Undo, finish, process restart, and restore. Advanced timing has a React Native foreground subscription and in-process cue callbacks that TIM-01 must explicitly gate. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2348-2380,3192-3235] |
| Secrets/env vars | Scoped source search found no workout/rest/timing secret or production environment-variable contract; the matching environment references are development/native fixture selectors. [VERIFIED: scoped repository search] | No secret migration. Keep diagnostics aggregate/code-only and never log workout values or owner notes. [VERIFIED: /Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-design-20260815-132500.md:1278-1282; .planning/architecture/v1.2-migration-risks.md:98-100] |
| Build artifacts / installed packages | No `artifacts/native` files and no `node_modules` directory are present in this worktree; prior Phase 8–10 evidence is historical and cannot prove Phase 15. [VERIFIED: filesystem/environment probe; .planning/phases/15-workout-parity/15-UI-SPEC.md:38-42,814] | Install exact lockfile dependencies before source tests, then build one fresh Phase 15 release development-test APK and bind native evidence to its source digest and installed bytes. Do not modify or treat archived evidence as current. [VERIFIED: package.json:6-9,72-90; scripts/build-current-native-test-apk.sh:129-172] |

## TIM-01 Decision Checkpoint

The planner must create `checkpoint:decision` after characterization tests and before any deletion/gating of advanced-timing runtime code. The decision must present exactly two safe paths: **approve retirement** (recommended in the ADR) or **retain the reviewed legacy recovery path and block Phase 15 cutover until it is compatible with the no-authoring UI**. Silence is not approval. [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:31-32; .planning/phases/15-workout-parity/15-UI-SPEC.md:578-595; .planning/architecture/v1.2-multi-active-plans.md:151-166]

Before the checkpoint, tests must snapshot and compare all legacy timing data and exercise every quoted state value: `"idle"`, `"running"`, `"paused"`, `"stopped"`, `"expired"`, `"cluster_ready"`, `"cluster_gap_running"`, `"cluster_gap_paused"`; they must also prove between-set rest remains independent. [VERIFIED: src/domains/advancedTiming/advancedTimingState.ts:6-89; src/domains/rest/restState.ts:1-29]

If retirement is approved:

- Remove `AdvancedTimingIndicator` and `AdvancedTimingConfigSheet` from Workout/plan authoring surfaces, but do not delete schema columns/tables or rewrite old JSON. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:155-164]
- Gate `getAdvancedTimingContext`, all configure/start/gap/pause/resume/reconcile/stop commands, the foreground subscription, and queued callbacks; new session/set snapshots resolve to the exact off value `{"version":1,"mode":"off"}` while old source values remain readable. [VERIFIED: app/workout/[sessionId].tsx:51-95,145-188; src/bootstrap/workoutAppRuntime.tsx:919-948,2348-2380,3192-3370; src/domains/advancedTiming/advancedTimingConfig.ts:8-28]
- Prove zero cadence/cluster cues after foreground, queued callback, relaunch, manual restore, automatic replacement, and merge while supported rest sound/haptic and rest recovery remain correct. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:78-80]

If retirement is not approved, do not destroy facts or silently leave hidden playback. Retain the old recovery path and treat the Phase 15 release gate as blocked until the owner accepts an explicit compatibility presentation. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:164-166]

## Common Pitfalls

### Pitfall 1: Starting the wrong plan-day pair
**What goes wrong:** a selected day ID is combined with whichever plan/schedule a later singleton query returns. **Why:** the current runtime accepts only `dayId` and `mode`. **Avoid:** use Phase 13's exact selected plan/day/schedule/version/opportunity and validate ownership/revisions in the start transaction. **Warning sign:** `startPlanDay(dayId, mode)` remains in the final Phase 15 route. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2473-2513; .planning/architecture/v1.2-migration-risks.md:21-23]

### Pitfall 2: A visual refactor changes commit semantics
**What goes wrong:** row color, collapse, pointer, rest, toast, or haptic advances before SQLite commits. **Why:** moving Complete out of `SetRow` tempts local optimistic state. **Avoid:** retain `CompleteSetResult`, await it, and apply only its `view`; do not synthesize an updated row. **Warning sign:** any success transition occurs before `commands.completeSet` resolves. [VERIFIED: src/domains/workout/activeWorkout.ts:314-333; src/domains/workout/setCommands.ts:214-232; .planning/phases/15-workout-parity/15-UI-SPEC.md:420-427]

### Pitfall 3: Explicit Save still auto-saves on blur
**What goes wrong:** closing the sheet changes SQLite despite no Save. **Why:** current `SetRow` calls persistence from numeric blur and duration change. **Avoid:** keep all field/stepper changes in a sheet-local draft; only Save calls the domain. **Warning sign:** `onBlur` or `onChangeText` awaits a repository/runtime command. [VERIFIED: src/ui/components/SetRow.tsx:681-752,1103-1151]

### Pitfall 4: All-nine metric support regresses during editor extraction
**What goes wrong:** timed/fixed/interval/unscored facts are squeezed into load/reps or invalid zero values. **Avoid:** drive one table from `METRIC_PROFILES` and the existing strict schemas; test both draft and completion validation. The exact profile values are `"load_reps"`, `"bodyweight_reps"`, `"added_load_reps"`, `"assisted_reps"`, `"timed_hold"`, `"fixed_distance"`, `"fixed_time"`, `"intervals"`, `"unscored"`. [VERIFIED: src/domains/metrics/contracts.ts:5-15,85-255]

### Pitfall 5: Warm-ups contaminate progress or rest
**What goes wrong:** W rows increment working progress or start rest. **Avoid:** keep warm-up and working arrays/commands separate and compute progress only from working sets. **Warning sign:** a warm-up uses `completeSet` rather than `completeWarmup`. [VERIFIED: src/domains/workout/activeWorkout.ts:45-76,108-124; src/ui/screens/ActiveWorkoutScreen.tsx:1509-1606]

### Pitfall 6: Rest becomes a visual countdown
**What goes wrong:** backgrounding or process death resets/decrements stale local state, or Skip completes a set. **Avoid:** derive from `endsAtMs`/`remainingMs`, write through revision-checked rest commands, and keep the UI tick non-authoritative. [VERIFIED: src/domains/rest/restState.ts:1-29,48-210; src/domains/rest/restCommands.ts:17-47]

### Pitfall 7: Reorder mutates immutable creation order
**What goes wrong:** history/progression linkage changes or cancelled drag writes. **Avoid:** preserve `ordinal`, write only `display_ordinal` through the exact-membership receipt command, and invoke it only on successful gesture end or accessible move. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1743-1852; .planning/milestones/v1.1-phases/09-in-workout-exercise-editing/09-06-SUMMARY.md:29-37]

### Pitfall 8: Delete becomes hard-delete for completed history
**What goes wrong:** a presentation rename from Remove to Delete bypasses protected-history semantics. **Avoid:** keep the existing `removeExercise` command and render its `"deleted_provisional"` or `"skipped_history_preserved"` result truthfully. [VERIFIED: src/domains/workout/activeWorkout.ts:207-233; src/platform/sqlite/repositories/workoutRepository.ts:1645-1740]

### Pitfall 9: Undo is lost because it is absent from the current route
**What goes wrong:** the new dock ships without the required contextual recovery. **Avoid:** wire `RuntimeValue.undoCompletedSet` into Active, show it in a top toast for the durable eight-second window, and reconcile rest after undo. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:949-956,3925-3947; src/platform/sqlite/repositories/workoutRepository.ts:3449-3600; .planning/phases/15-workout-parity/15-UI-SPEC.md:443-445]

### Pitfall 10: Completion preview is fabricated in UI
**What goes wrong:** formatted values are compared and unsupported target changes are offered. **Avoid:** extend the domain preview to carry factual changed rows and explicit units; UI only renders it. [VERIFIED: src/domains/plans/planImpactCommands.ts:134-154; .planning/phases/15-workout-parity/15-UI-SPEC.md:529-566]

### Pitfall 11: Legacy timing appears removed but still emits cues
**What goes wrong:** hidden foreground reconciliation or queued callbacks still play cadence/cluster cues. **Avoid:** treat TIM-01 as a runtime capability cut, not a component deletion, and prove every recovery path. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2348-2380,3192-3370; .planning/architecture/v1.2-migration-risks.md:40,78-80]

### Pitfall 12: Phase 16 gets mutation authority by reuse
**What goes wrong:** Calendar detail can invoke Resume, Correct, Remove, set, rest, or accessibility actions despite looking read-only. **Avoid:** share only facts components and adapters; route tests must assert zero mutation calls. [VERIFIED: src/ui/screens/SessionDetailScreen.tsx:109-125,376-430; .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377]

### Pitfall 13: Long-list parity regresses performance
**What goes wrong:** the sole `ScrollView` mounts every exercise/editor branch and rerenders on every timer tick. React Native documents that `ScrollView` renders all children at once. **Avoid:** keep countdown state local, memoize facts rows, mount only the selected sheet, and benchmark representative long sessions; adopt a single-owner virtualized implementation only if measurement requires it and Phase 14 layout contracts remain intact. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:177-255; src/ui/components/RestDock.tsx:260-330] [CITED: https://reactnative.dev/docs/scrollview]

## Code Examples

### Preserve the committed-result distinction

The following current union is the command contract; both values are quoted verbatim. [VERIFIED: src/domains/workout/activeWorkout.ts:314-333]

<!-- DATA_V8K2M4QJ_START -->
```typescript
export type CompleteSetResult =
  | Readonly<{
      outcome: "committed";
      view: ActiveWorkoutView;
    }>
  | Readonly<{
      outcome: "already_completed";
      view: ActiveWorkoutView;
    }>;
```
<!-- DATA_V8K2M4QJ_END -->

The planner should preserve the existing rule that post-commit invalidation, haptic, and effect drain execute only for `"committed"`. [VERIFIED: src/domains/workout/setCommands.ts:214-232]

### Preserve exact rest command deltas

The current public rest input permits only the quoted values `-15_000` and `15_000`; Phase 15 labels them `−15` and `+15` seconds. [VERIFIED: src/domains/rest/restCommands.ts:17-26; .planning/phases/15-workout-parity/15-UI-SPEC.md:429-441]

<!-- DATA_P6R9C3WX_START -->
```typescript
export type AdjustRestInput = RestRevisionInput & Readonly<{
  deltaMs: -15_000 | 15_000;
}>;
```
<!-- DATA_P6R9C3WX_END -->

### Recommended capability-safe presentation seam

This is planner-facing pseudocode, not an existing source declaration:

```typescript
type WorkoutSessionPresentationProps = Readonly<{
  model: WorkoutPresentationModel;
  disclosure: WorkoutDisclosureController;
}>;

// ActiveWorkoutScreen owns mutation commands and composes the presenter.
// Calendar detail receives only model + disclosure; no mutation port exists.
```

This shape is required by the Calendar rule that history/preview detail expose no mutation handlers or accessibility actions. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377]

## Performance Architecture

- Preserve the existing minimum-device working-set commit-to-dock budget: at least `100` samples, `p95 <= 150 ms`, and ordinary Active Workout JS task `<= 50 ms`. These values are quoted verbatim from the existing benchmark contract. [VERIFIED: scripts/benchmark-phase1.mjs:23-30,49-105,489-580; .planning/PROJECT.md:123]
- Add Phase 15 measurement around the actual rendered dock transition; the current Phase 1 harness records the first invalidation callback, not a native rendered-frame timestamp. [VERIFIED: src/bootstrap/phase1Benchmark.ts:148-194]
- Keep rest countdown state inside `RestDock`; do not update the entire `ActiveWorkoutScreen` tree every second. [VERIFIED: src/ui/components/RestDock.tsx:260-330]
- Test a representative long session because `AdaptiveScreen` uses a `ScrollView`, which eagerly renders children. Preserve the one-scroll accessibility/anchor contract while measuring memory and frame work. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:177-255] [CITED: https://reactnative.dev/docs/scrollview]
- Phase 15 source tests must not claim native performance. Final evidence must bind source digest, manifest, retained APK, installed bytes, device/API/ABI, sample count, and raw percentiles. [VERIFIED: scripts/benchmark-phase1.mjs:414-590; .planning/research/v1.2/SUMMARY.md:87-93]

## Validation Architecture

The final visual verifier pins the full approved.json, approved-hybrid.html, checked-in source-manifest, and six reference PNG SHA-256 values declared in UI-SPEC. Every native visual case must also record full native screenshot, overlay, and difference hashes plus derivation metadata binding the native and reference input hashes; a missing or mismatched link fails closed.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `29.7.0`, jest-expo `~57.0.5`, React Native Testing Library `14.0.1`; native Maestro `2.8.0`. [VERIFIED: package.json:125-132; environment probe] |
| Config file | `jest.config.js`; projects are quoted verbatim as `"unit"`, `"components"`, `"sqlite-host"`, `"integration"`. [VERIFIED: jest.config.js:26-90] |
| Quick run command | `npm run test:components -- --runInBand src/ui/__tests__/TodayScreen.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx src/ui/__tests__/RestDock.test.tsx src/ui/__tests__/WorkoutCompletionScreen.test.tsx` [VERIFIED: package.json:23-28; existing test paths] |
| Domain/integration command | `npm run test:unit -- --runInBand src/domains/workout/setCommands.test.ts src/domains/workout/sessionExerciseCommands.test.ts src/domains/workout/outcomes.test.ts src/domains/rest/restState.test.ts && npm run test:integration -- --runInBand tests/integration/cross-profile-workout.test.ts tests/integration/rest-lifecycle.test.ts tests/integration/session-exercise-editing.test.ts tests/integration/workout-outcomes.test.ts` [VERIFIED: jest.config.js:26-90; existing test paths] |
| Full suite command | `npm run test:all -- --runInBand && npm run test:coverage -- --runInBand` [VERIFIED: package.json:28,72] |

`node_modules` is absent, so no Jest command was executed during research. This is an environment limitation, not a test failure. [VERIFIED: environment probe]

### Existing Tests That Must Be Preserved or Deliberately Rewritten

| Area | Existing coverage | Phase 15 action |
|---|---|---|
| All metric profiles | `ActiveWorkoutMetricProfiles.test.tsx`; `metricContracts.test.ts`; `cross-profile-workout.test.ts`; `metric-profiles.test.ts`. [VERIFIED: existing test paths; src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx:131-368,510-730; tests/integration/cross-profile-workout.test.ts:556-725] | Rewrite inline-control assertions into row → sheet → explicit Save; keep snapshot/draft/complete/replay and incompatible-generation cases for all nine profiles. |
| Set command integrity | `setCommands.test.ts`; `complete-set.test.ts`; active component failure/retry tests. [VERIFIED: src/domains/workout/setCommands.test.ts:108-537; tests/integration/complete-set.test.ts:928-968; src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1216-1674] | Add duplicate dock tap, save-before-complete sequencing, cancelled editor, commit failure, committed-refresh failure, final-exercise collapse, and no premature feedback. |
| Rest | `restState.test.ts`; `RestDock.test.tsx`; `rest-lifecycle.test.ts`; notification adapter/reconciler tests; `workoutLifecycle.test.ts`. [VERIFIED: src/domains/rest/restState.test.ts:28-193; src/ui/__tests__/RestDock.test.tsx:108-600; tests/integration/rest-lifecycle.test.ts:205-706; src/bootstrap/workoutLifecycle.test.ts:269-942] | Replace collapse/expand assertions with always-visible ordered controls; retain timestamp, pause/resume, bounds, expiry, cue isolation, notification denial, foreground, process-death, and Undo reconciliation. |
| Reorder/edit | `sessionExerciseCommands.test.ts`; `session-exercise-editing.test.ts`; `ActiveWorkoutScreen.test.tsx`; Phase 9 Maestro. [VERIFIED: src/domains/workout/sessionExerciseCommands.test.ts:122-338; tests/integration/session-exercise-editing.test.ts:172-787; src/ui/__tests__/ActiveWorkoutScreen.test.tsx:649-1005; maestro/phase9/in-workout-exercise-editing.yaml] | Retain exact membership/revision/hash/receipt assertions; add 8dp activation, cancel-no-command, current identity, endpoint disablement, two-step Delete, and new menu hierarchy. |
| Outcomes/completion | `outcomes.test.ts`; `workout-outcomes.test.ts`; `WorkoutCompletionScreen.test.tsx`; completion route test; Phase 9 write-back Maestro. [VERIFIED: src/domains/workout/outcomes.test.ts:89-357; tests/integration/workout-outcomes.test.ts:354-1701; src/ui/__tests__/WorkoutCompletionScreen.test.tsx:182-739; app/__tests__/completion-route.test.tsx:114] | Add pending/failure/retry for Finish/Partial/Later/Zero-set/Discard, concrete all-profile write-back rows, long/no-difference preview, and deferred Edit-plan route. |
| Recovery | `workoutLifecycle.test.ts`; `rest-lifecycle.test.ts`; Phase 8 overview/recovery Maestro; Phase 9 relaunch/write-back Maestro; Phase 10 timing Maestro. [VERIFIED: src/bootstrap/workoutLifecycle.test.ts:269-942; maestro/lifecycle/rest-recovery.yaml; maestro/phase8/session-overview.yaml; maestro/phase9/in-workout-exercise-editing.yaml; maestro/phase10/advanced-set-timing.yaml] | Add Phase 15 exact-HEAD native flows for selected occurrence, editor draft dismissal, commit crash window, recovered pointer/rest, edit/reorder refresh failure, completion retry, and accepted TIM-01 branch. |

### Complete Retained Regression Inventory

- **Metric:** `src/domains/metrics/metricContracts.test.ts`, `src/domains/metrics/migrateCustomExerciseMetricProfile.test.ts`, `src/domains/history/metricHistory.test.ts`, `src/testing/contracts/phase2Metrics.contract.test.ts`, `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx`, `tests/integration/cross-profile-workout.test.ts`, `tests/integration/metric-profile-migration.test.ts`, and `tests/sqlite-host/metric-profiles.test.ts`. [VERIFIED: current test-file inventory]
- **Rest and notification:** `src/domains/rest/restState.test.ts`, `src/platform/audio/expoRestCountdownCueAdapter.test.ts`, `src/platform/notifications/expoForegroundRestFeedbackAdapter.test.ts`, `src/platform/notifications/expoRestNotificationAdapter.test.ts`, `src/platform/notifications/restNotificationReconciler.test.ts`, `src/platform/preferences/restAlertPreferenceStore.test.ts`, `src/ui/__tests__/RestAlertSettingsSheet.test.tsx`, `src/ui/__tests__/RestDock.test.tsx`, `src/bootstrap/workoutLifecycle.test.ts`, `tests/integration/rest-lifecycle.test.ts`, `tests/sqlite-host/foreground-rest-feedback.test.ts`, `maestro/lifecycle/rest-recovery.yaml`, and `maestro/phase2/remediation-rest-alerts.yaml`. [VERIFIED: current test-file inventory]
- **Exercise editing and reorder:** `src/domains/workout/sessionExerciseCommands.test.ts`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`, `src/ui/__tests__/ScheduleEditor.test.tsx`, `src/ui/__tests__/OwnedPlanEditor.test.tsx`, `tests/integration/session-exercise-editing.test.ts`, `maestro/phase9/in-workout-exercise-editing.yaml`, and the Phase 9 evidence-script tests. [VERIFIED: current test-file inventory]
- **Set completion and workout outcomes:** `src/domains/workout/setCommands.test.ts`, `src/domains/workout/outcomes.test.ts`, `src/ui/__tests__/WorkoutCompletionScreen.test.tsx`, `app/__tests__/completion-route.test.tsx`, `tests/integration/complete-set.test.ts`, `tests/integration/workout-outcomes.test.ts`, `tests/integration/plan-impact-replacement.test.ts`, `tests/integration/today-schedule-workout.test.ts`, and the two Phase 9 plan-write-back Maestro flows. [VERIFIED: current test-file inventory]
- **Process/rebuild recovery:** `src/bootstrap/workoutAppRuntime.test.tsx`, `src/bootstrap/workoutLifecycle.test.ts`, `src/domains/portability/restoreCommands.test.ts`, `tests/sqlite-host/cleanInstallRestore.test.ts`, `tests/sqlite-host/logicalRestoreRepository.test.ts`, `tests/sqlite-host/restoreReconciliationRepository.test.ts`, Phase 8 overview/recovery Maestro, Phase 9 relaunch/write-back Maestro, and Phase 10 timing-relaunch Maestro. [VERIFIED: current test-file inventory]

These files are the minimum regression set. Tests that encode the superseded inline editor, collapsible rest dock, or visible cadence controls must be rewritten to the new contract; tests of their underlying domain/storage behavior remain intact. [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1216-1674,2307-2639,2640-3884; src/ui/__tests__/RestDock.test.tsx:108-600; .planning/phases/15-workout-parity/15-UI-SPEC.md:252-316,410-445,578-595]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRK-01 | Root order, identity, full preview, primary action | component | `npm run test:components -- --runInBand src/ui/__tests__/TodayScreen.test.tsx` | ✅ extend |
| WRK-02 | Preview selection and keyboard navigation without schedule mutation | component + integration | `npm run test:components -- --runInBand src/ui/__tests__/TodayScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` | ✅ extend |
| WRK-03 | Scheduled/rest/no-plan/empty states | component | same Today command | ✅ extend |
| WRK-04 | Start alternatives, cancel, focus restore | component | same Today command | ✅ extend |
| WRK-05 | Exact start/resume, read/start retry, process death | route + integration + native | `npm run test:components -- --runInBand 'app/(tabs)/__tests__/index.test.tsx' && npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` | ✅ extend; native Wave 0 |
| WRK-06 | Running contextual routes from independent schedule facts | component + route | same root command | ✅ extend after Phase 13 |
| WRK-07 | Full active list, identity, progress, metadata | component | `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx` | ✅ rewrite/extend |
| WRK-08 | Back preserves active session/context | route + native | `npm run test:components -- --runInBand app/__tests__/workout-route.test.tsx` | ❌ Wave 0 |
| WRK-09 | Disclosure, two-line names, separate targets | component | ActiveWorkout command | ✅ extend |
| WRK-10 | Sole edge/current state | component + screenshot | ActiveWorkout command | ✅ extend; native screenshot Wave 0 |
| WRK-11 | Table columns and row states | component | `npm run test:components -- --runInBand src/ui/__tests__/SetRow.test.tsx` | ✅ rewrite |
| WRK-12 | Any row opens editor; Save/cancel boundary | component | `npm run test:components -- --runInBand src/ui/__tests__/WorkoutSetEditorSheet.test.tsx` | ❌ Wave 0 |
| WRK-13 | kg/reps steppers/direct entry/validation | component + domain | editor test plus `src/domains/workout/setCommands.test.ts` | ❌ editor; ✅ domain |
| WRK-14 | duration-only ±5 sec editor | component + domain | editor test plus metric tests | ❌ editor; ✅ domain |
| WRK-15 | all nine profiles | component + integration | `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx && npm run test:integration -- --runInBand tests/integration/cross-profile-workout.test.ts` | ✅ rewrite/retain |
| WRK-16 | W/working order and progress exclusion | component + integration | ActiveWorkout command plus cross-profile/complete-set integration | ✅ extend |
| WRK-17 | exact Add-set menu/order/retry | component | ActiveWorkout command | ✅ extend |
| WRK-18 | compact dock, saving, duplicate suppression | component + integration | ActiveWorkout command plus complete-set integration | ✅ extend |
| WRK-19 | failed save preserves values/current row | component + integration | metric profile and complete-set commands | ✅ rewrite/extend |
| WRK-20 | committed final-set collapse/advance; no warm-up rest | component + integration | ActiveWorkout command plus complete-set/rest lifecycle | ✅ extend |
| WRK-21 | mutually exclusive full rest dock | component | `npm run test:components -- --runInBand src/ui/__tests__/RestDock.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx` | ✅ rewrite |
| WRK-22 | ordered ±15/pause/resume/skip; no completion | unit + component | RestDock command plus `src/domains/rest/restState.test.ts` | ✅ extend |
| WRK-23 | deadline/pause/cues recovery | integration + native | `npm run test:integration -- --runInBand tests/integration/rest-lifecycle.test.ts && npm run test:unit -- --runInBand src/bootstrap/workoutLifecycle.test.ts` | ✅ retain; native Wave 0 |
| WRK-24 | comparable six-session trend/chart/empty | unit + component | `npm run test:unit -- --runInBand src/domains/history/metricHistory.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ExerciseTrendSheet.test.tsx` | ❌ sheet |
| WRK-25 | exact exercise menu and separate trend | component | ActiveWorkout command | ✅ extend |
| WRK-26 | revision-fenced exercise default_rest_seconds, saved plan default, ordered later-rest resolution; no advanced UI or active-rest mutation | unit + SQLite-host + integration + component | ActiveWorkout command, preference, session-exercise editing, rest lifecycle, and settings tests | ❌ Wave 0 |
| WRK-27 | saved 1.25/2.5/5 preference drives later editor steppers without target rewrite | unit + SQLite-host + integration + component | preference persistence/portability, editor stepper, stale/reload/failure/noninterference tests | ❌ Wave 0 |
| WRK-28 | deferred real plan editor route | route + component | proposed workout-route/plan-navigation tests | ❌ Wave 0 |
| WRK-29 | add picker search/loading/error/retry | component + integration | ActiveWorkout command plus session-exercise integration | ✅ extend |
| WRK-30 | replacement compatibility/history preservation | domain + integration + component | sessionExerciseCommands + session-exercise-editing + ActiveWorkout commands | ✅ extend |
| WRK-31 | two-step delete and safe next current | component + integration | ActiveWorkout command plus session-exercise-editing integration | ✅ extend |
| WRK-32 | 8dp drag/cancel/fallback/identity | component + integration + native | ActiveWorkout command plus session-exercise-editing integration | ✅ extend; gesture native Wave 0 |
| WRK-33 | contextual Undo and edit/removal recovery | unit + integration + component | `npm run test:integration -- --runInBand tests/integration/complete-set.test.ts tests/integration/session-exercise-editing.test.ts` plus ActiveWorkout | ✅ extend |
| WRK-34 | all five outcomes, confirmations, failures/retries | unit + integration + component | outcomes + workout-outcomes + ActiveWorkout commands | ✅ extend |
| WRK-35 | complete/partial/effort/results/retry | component + route | `npm run test:components -- --runInBand src/ui/__tests__/WorkoutCompletionScreen.test.tsx app/__tests__/completion-route.test.tsx` | ✅ extend |
| WRK-36 | concrete default-No preview/apply/cancel/retry | domain + integration + component + native | completion command plus `tests/integration/plan-impact-replacement.test.ts` | ✅ extend |

### Sampling Rate

- **Per task commit:** the smallest affected unit/component/integration command above, plus `npm run typecheck` and `npm run lint`. [VERIFIED: package.json:19-28]
- **Per wave merge:** all Phase 15 component/domain/integration suites plus `npm run test:coverage -- --runInBand`. [VERIFIED: package.json:23-28]
- **Phase gate:** `npm run test:all -- --runInBand`, 100% branch coverage for every new/changed integrity-critical module, fresh real-SQLite device contracts, Phase 15 Maestro, benchmark, and visual/accessibility evidence. [VERIFIED: .trae/rules/rules.md:14-26; scripts/run-coverage-gate.mjs:16-123,140-203; .planning/phases/15-workout-parity/15-UI-SPEC.md:643-665]

### Wave 0 Gaps

- [ ] Add a route test for `app/workout/[sessionId].tsx` covering retry, Back context, no mutation on unmount, and exact command capability wiring. [VERIFIED: current test inventory]
- [ ] Add component tests for the proposed Workout day selector, facts-only session presentation, set editor sheet, action dock, plan settings, and exercise trend sheet. [VERIFIED: current test inventory; .planning/design/v1.2-prototype-parity-matrix.md:77-112]
- [ ] Add a typed plan-scoped preference/domain/repository suite plus a revision-fenced session-exercise default_rest_seconds command. Cover saved/draft/pending/failure/retry/reload, stale revision, invalid input, backup/restore/merge, editor weightIncrementGrams wiring, exercise-override then plan-default later-rest creation, and no target/history/set/write-back/active-rest mutation. [VERIFIED: current source gap; .planning/phases/15-workout-parity/15-UI-SPEC.md:356-385]
- [ ] Add TIM-01/TIM-02/TIM-03 characterization and accepted-branch tests before changing advanced-timing runtime wiring. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:78-80]
- [ ] Add `scripts/run-phase15-maestro.mjs`, its fail-closed source contract, Phase 15 flows, and a package script; no Phase 15 runner currently exists. [VERIFIED: package.json:29-39,83-90; current filesystem inventory]
- [ ] Extend or wrap the Phase 1 benchmark to measure the actual Phase 15 rendered dock transition and long-session rendering, retaining the exact `100` / `150 ms` / `50 ms` gates. [VERIFIED: scripts/benchmark-phase1.mjs:23-30,489-580; src/bootstrap/phase1Benchmark.ts:148-194]
- [ ] Add native fixtures for Light/Dark/System, seven viewport/orientation rows, text scale `1.0`/`2.0`, touch/keyboard/D-pad, standard/reduced motion, all metric editor shapes, and outcome/recovery failures. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:643-676]

## Security Domain

Security enforcement is enabled at ASVS level `1`. [VERIFIED: .planning/config.json:20-49]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Personal local workout flow introduces no authentication boundary. Keep Google/backup authentication outside this phase. [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:9-12] |
| V3 Session Management | No for authentication; yes for workout lifecycle integrity | Do not confuse `workout_sessions` with auth sessions; protect workout lifecycle using status/revision/idempotency rules. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:136-164; src/domains/workout/outcomes.ts:1-42] |
| V4 Access Control | Yes | Enforce least capability: Phase 16 Calendar detail receives no mutation ports. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377] |
| V5 Input Validation | Yes | Validate metric observations, IDs, hashes, revisions, timestamps, reorder membership, rest deltas, and preference bounds before repository writes. [VERIFIED: src/domains/metrics/contracts.ts:27-83,85-255; src/domains/workout/sessionExerciseCommands.ts:13-129; src/domains/rest/restCommands.ts:17-47] |
| V6 Cryptography | No new cryptographic control | Existing SHA-256 request evidence is idempotency/canonical payload evidence, not authentication; do not create custom security primitives. [VERIFIED: src/domains/workout/sessionExerciseCommands.ts:13-15,28-43,93-129; src/ui/screens/ActiveWorkoutScreen.tsx:318-339,1738-1773] |

### Known Threat Patterns for the Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale or replayed mutation | Tampering | Expected revisions plus stable request ID/hash and immutable receipt replay; changed payload under same request conflicts. [VERIFIED: src/domains/workout/activeWorkout.ts:175-255; src/platform/sqlite/repositories/workoutRepository.ts:1536-1852] |
| UI claims success before commit | Spoofing / Tampering | Await repository result; only `committed` triggers success feedback/effects. [VERIFIED: src/domains/workout/setCommands.ts:214-232] |
| Calendar-origin detail gains workout commands | Elevation of privilege | Facts-only component boundary with no mutation capability; route tests assert zero command calls. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,354-377] |
| Raw SQL or malformed metric input reaches storage | Tampering | Screens call typed domain ports; repository uses bound parameters; strict Zod schemas reject extra/invalid fields. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:22-31,124-176; src/domains/metrics/contracts.ts:27-39,85-255] |
| Stale OS notification survives source change | Spoofing | Stable session identifier, payload rest revision/deadline, list/cancel/reconcile after every relevant commit and launch. [VERIFIED: src/platform/notifications/restNotificationReconciler.ts:68-199; src/platform/notifications/expoRestNotificationAdapter.ts:89-139] |
| Hidden legacy timing emits an invisible cue | Spoofing / Denial of service | TIM-01 gated runtime capability cut plus queued/foreground/relaunch/restore tests; preserve rest cues separately. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:40,78-80] |
| Sensitive workout values leak through diagnostics/evidence | Information disclosure | Emit codes, versions, counts, hashes, and scoped IDs only; no workout payloads, notes, or set values. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:98-100] |

React Native provides `accessibilityState`, `accessibilityActions`/`onAccessibilityAction`, Android `accessibilityLiveRegion`, and reduce-motion APIs; use the Phase 14 wrappers so touch, keyboard, D-pad, and assistive activation share handlers. [CITED: https://reactnative.dev/docs/accessibility] [CITED: https://reactnative.dev/docs/accessibilityinfo]

## State of the Art

| Old / Shipped Approach | Phase 15 Approach | Change Point | Impact |
|------------------------|-------------------|--------------|--------|
| Inline expanded set editor with blur persistence and per-row Complete | Facts row opens shared explicit-Save editor; Complete moves to compact dock | Revision 18 parity contract | Removes accidental writes and restores one dominant action. [VERIFIED: src/ui/components/SetRow.tsx:681-752,1091-1234; .planning/phases/15-workout-parity/15-UI-SPEC.md:252-316,410-427] |
| Collapsible rest with hidden controls and optional dock Undo | Full-width rest with four always-visible ordered controls; Undo is transient top feedback | Revision 18 parity contract | Keeps recovery action visible without adding a fifth persistent control. [VERIFIED: src/ui/components/RestDock.tsx:332-455; .planning/phases/15-workout-parity/15-UI-SPEC.md:429-445] |
| Phase 10 per-rep/cluster authoring and playback | Hidden authoring; runtime retirement only after TIM-01; stored data retained | v1.2 owner decision, pending checkpoint | Avoids destructive migration and invisible-cue regressions. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:149-166] |
| Separate Active and mutation-capable session-detail presentations | Shared facts-only Workout presentation plus active-only commands | Phase 15 → Phase 16 dependency | Calendar can render Active-shaped history without gaining mutation authority. [VERIFIED: .planning/phases/16-calendar-parity/16-CONTEXT.md:28-30,50-59] |
| Singleton `TodayView`/start API | Phase 13 exact selected occurrence identity | Phase 13 dependency | Prevents cross-plan day/session mismatch. [VERIFIED: src/domains/workout/index.ts:60-104; .planning/architecture/v1.2-migration-risks.md:21-23] |

**Deprecated/outdated for Phase 15 presentation:** current inline blur-save tests, collapsible-rest assertions, visible advanced-timing controls, generic `Today` root copy, and current full-route trend as the only trend surface. They remain historical behavior until Phase 15 tests are rewritten and must not be deleted without replacement proof. [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1006-1674,2640-3884; src/ui/__tests__/RestDock.test.tsx:108-600; src/ui/screens/TodayScreen.tsx:460-479; app/exercise-history/[exerciseId].tsx:13-33]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RESOLVED — the plans define a versioned plan-scoped SQLite Workout preference keyed by stable Phase 13 plan identity; it stores `defaultRestSeconds`, `weightIncrementGrams`, and revision without mutating metric targets. | Architecture / Safe order | Resolution is explicit in 15-06; backup/restore/merge remap and independent-plan tests prevent accidental global ownership. |

## Resolved Questions

1. **Preference ownership — RESOLVED**
   - 15-06 defines a versioned plan-scoped preference object keyed by stable Phase 13 plan identity. It stores `defaultRestSeconds`, `weightIncrementGrams`, and revision in SQLite, participates in backup/clean restore/merge remapping, and never rewrites `MetricTarget.incrementGrams`.
   - 15-07 performs the ordered integration only after that port exists: saved `weightIncrementGrams` drives subsequent editor step actions; saved `defaultRestSeconds` is the fallback for a later eligible rest after any exercise-specific override. Stale/failure/reload/noninterference and active-rest invariance are explicit tests.

2. **Upstream Phase 13/14 symbols — RESOLVED BY FAIL-FAST PREFLIGHT**
   - 15-01 requires completed 13-10 and 14-12 summaries, reads the actual exported symbols, and halts before edits if exact occurrence/start/provenance or AppRootShell/BottomSheet/ConfirmationDialog/SemanticToast/focus/token contracts are absent. Phase 15 does not guess names or duplicate upstream layers.

3. **TIM-01 disposition — RESOLVED BY BLOCKING ROUTE**
   - 15-02 refreshes characterization, then uses a `gate="blocking-human"` decision with exact `retire-playback` or `retain-compatibility` values. Only the recorded retirement choice unlocks the one-way runtime cut; retain-compatibility blocks Phase 15 cutover. Legacy facts and recovery remain preserved in both branches.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Typecheck/tests/scripts | ✓ | `v24.19.0` | — [VERIFIED: environment probe; .nvmrc:1] |
| npm | Exact lockfile install/tests | ✓ | `11.17.0` | — [VERIFIED: environment probe; package.json:6-9] |
| `node_modules` | Local Jest/typecheck | ✗ | — | Run `npm ci --ignore-scripts` from the lockfile before source verification; no dependency change. [VERIFIED: environment probe; package-lock.json present] |
| Java 17 | Android build | ⚠ available but project doctor mismatch | Zulu `17.0.20.1`; doctor expects exact `17.0.20` | Select/install the pinned Temurin runtime before native evidence. [VERIFIED: environment probe; scripts/doctor-android.sh:5-9,55-59] |
| Android SDK | Native build/device tests | ✓ | API `36`, Build Tools `36.0.0` present | — [VERIFIED: environment probe; scripts/build-current-native-test-apk.sh:79-88,159-172] |
| adb | Device evidence | ✓ via project fallback, but no device connected | platform-tools present | Start/connect the existing API-36 emulator/device before the native gate. [VERIFIED: environment probe; scripts/run-phase8-maestro.mjs:66-70] |
| Maestro | Native UI evidence | ✓ | `2.8.0` | — [VERIFIED: environment probe; scripts/doctor-android.sh:86-90] |
| Revision 18 prototype | Visual oracle | ✓ | approved source files present | Use the pinned source hashes from UI-SPEC and compare native output later. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:31-42; filesystem probe] |

**Missing dependencies with no fallback:** a connected Android target is required for fresh native/process-death/visual/performance evidence; the current Java runtime does not satisfy the exact doctor contract. [VERIFIED: environment probe; scripts/doctor-android.sh:55-59,92-103]

**Missing dependencies with fallback:** `node_modules` can be recreated from the committed lockfile without changing dependency versions. [VERIFIED: package.json:6-9; package-lock.json present]

## Sources

### Primary (HIGH confidence)

- `.planning/phases/15-workout-parity/15-CONTEXT.md` — locked Phase 15 boundary, decisions, TIM-01, discretion, and deferred scope. [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:6-77]
- `.planning/phases/15-workout-parity/15-UI-SPEC.md` — approved composition, exact states/copy, accessibility, responsive, TIM-01, and WRK traceability. [VERIFIED: .planning/phases/15-workout-parity/15-UI-SPEC.md:19-59,179-595,643-838]
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — WRK-01 through WRK-36 and Phase 15 goal/dependency/success criteria. [VERIFIED: .planning/REQUIREMENTS.md:51-88,262-297; .planning/ROADMAP.md:118-136]
- `.planning/design/v1.2-prototype-parity-matrix.md` and `.planning/design/v1.2-prototype-inventory.json` — 36 Phase 15 rows, routes/components/selectors/tests/evidence status. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:73-112; machine inventory query]
- `.planning/architecture/v1.2-multi-active-plans.md` and `.planning/architecture/v1.2-migration-risks.md` — singleton migration, legacy timing policy, test matrix, and performance boundary. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:14-41,131-166,197-227; .planning/architecture/v1.2-migration-risks.md:8-96]
- Shipped Phase 8–10 summaries/verifications — existing overview, editing/reorder/write-back, timing, coverage, and native evidence. [VERIFIED: .planning/milestones/v1.1-phases/08-session-overview-navigation/08-VERIFICATION.md:20-109; .planning/milestones/v1.1-phases/09-in-workout-exercise-editing/09-VERIFICATION.md:19-80; .planning/milestones/v1.1-phases/10-advanced-set-timing/10-VERIFICATION.md:20-140]
- Live routes/components/domain/runtime/repositories/tests cited throughout this document. [VERIFIED: repository inspection]

### Secondary (MEDIUM confidence)

- https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ — exclusive transaction scope and async-write caveat. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/]
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ — schedule/list/cancel local notification APIs. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/]
- https://reactnative.dev/docs/accessibility — state, actions, and live-region semantics. [CITED: https://reactnative.dev/docs/accessibility]
- https://reactnative.dev/docs/accessibilityinfo — reduce-motion status/change APIs. [CITED: https://reactnative.dev/docs/accessibilityinfo]
- https://reactnative.dev/docs/scrollview — eager child rendering and FlatList tradeoff. [CITED: https://reactnative.dev/docs/scrollview]

### Tertiary (LOW confidence)

- None used as implementation authority.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — exact versions and test scripts are pinned in the repository; no install is proposed. [VERIFIED: package.json:6-9,14-132]
- Architecture: HIGH — recommendations follow locked Phase 15/16 contracts and opened live command/repository boundaries. [VERIFIED: .planning/phases/15-workout-parity/15-CONTEXT.md:15-60; .planning/phases/16-calendar-parity/16-CONTEXT.md:15-60]
- Pitfalls: HIGH — each risk is visible in current source or the accepted parity/migration contract. [VERIFIED: cited source ranges in Common Pitfalls]
- External framework guidance: MEDIUM — official documentation was fetched through the research seam fallback and classified by `gsd-tools` as MEDIUM when verified. [CITED: official URLs above]

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 for repository architecture; re-check framework docs and dependency outputs after Phases 13–14 execute.
