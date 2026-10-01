# Phase 8: Session Overview & Navigation - Research

**Researched:** 2026-09-15  
**Domain:** React Native active-workout presentation and navigation refactor  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Completed/earlier exercises auto-collapse to a one-line summary (name + top working set or "done"); tapping a collapsed exercise re-expands it. The active set is the default entry anchor, and after completing it the list auto-scrolls to the newly active set, animated unless `useAppTheme().reduceMotion` is true. The active screen is overview-only: retire `reviewExerciseId`, `reviewingEarlierOrLater`, `onReturnToCurrent`, the "REVIEWING WORKOUT" eyebrow, and the return banner. The active row mounts the full inline editor; non-active rows are compact until tapped. Empty/unplanned workouts use the same overview shell, contain zero set rows, and show a prominent Add-exercise affordance.

### Claude's Discretion

Choose collapsed-summary content, section-header styling, drag-handle placement, and whether the pinned Add-exercise affordance is disabled or Phase-9-stubbed. Choose `SectionList` versus a memoized `ScrollView` only if auto-scroll, auto-collapse, reduced motion, and lifecycle tests remain correct.

### Deferred Ideas (OUT OF SCOPE)

Exercise add/replace/remove/reorder behavior is Phase 9. Advanced timing is Phase 10. Supersets, per-exercise rest overrides, and sync status are out of Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| WORK-19 | A single scrollable overview renders all exercise/set statuses, anchors the active set, keeps Complete inline, and makes empty workouts overview-shaped. | Existing `ActiveWorkoutView.exercises`, set status, active identities, progress, and rest supply all needed presentation inputs without a model change. [VERIFIED: src/domains/workout/activeWorkout.ts:36-131] |
</phase_requirements>

## Project Constraints (from .trae/rules/rules.md)

- Keep SQLite source facts authoritative. [VERIFIED: .trae/rules/rules.md:13]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:14]
- Do not acknowledge a set before its exclusive transaction commits. [VERIFIED: .trae/rules/rules.md:15]
- Preserve bundled versus user-owned data boundaries and keep the workout critical path offline. [VERIFIED: .trae/rules/rules.md:16-17]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. [VERIFIED: .trae/rules/rules.md:18]
- Use atomic commits; every message ends with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`. [VERIFIED: .trae/rules/rules.md:19-21]

## Summary

Phase 8 is a render-tree and route simplification, not a domain migration. `ActiveWorkoutView` already exposes the ordered `exercises`, active set/exercise identities, progress, and rest state; each exercise already exposes `status: "planned" | "active" | "completed" | "skipped"`, and each set exposes `status: "planned" | "draft" | "completed" | "skipped"`. [VERIFIED: src/domains/workout/activeWorkout.ts:36-68] The screen should consume those values directly and retain the existing repository commands and commit-first state transition.

The current active screen is explicitly a one-exercise screen: it derives `viewedExercise` from `reviewExerciseId` or `view.currentExercise`, renders only that exercise's warm-ups and working sets, and gates actions/rest/more-sheet presentation with `reviewingEarlierOrLater`. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:405-414] The overview eliminates that branch, iterates `view.exercises`, and retains command semantics; therefore all lifecycle guarantees remain owned by the existing runtime/domain/lifecycle layers rather than by new UI state.

**Primary recommendation:** Retain `AdaptiveScreen` as the sole outer scroll owner and render a memoized `ScrollView`-compatible sequence of exercise sections inside it; add a keyed measured scroll request to `AdaptiveScreen` so the active-row anchor can be animated or jumped deterministically. Do not introduce `SectionList` inside the existing `AdaptiveScreen` scroll container. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:149-206]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Ordered overview and collapse/editor visibility | Browser / Client | — | It is transient presentation state over existing read-model rows. [VERIFIED: src/domains/workout/activeWorkout.ts:105-131] |
| Commit-gated set completion and revision checks | API / Backend | Browser / Client | The UI submits expected revisions and applies only the returned view. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:501-540] |
| Rest state and notification reconciliation | API / Backend | Browser / Client | The dock renders authoritative `view.rest`; runtime/lifecycle owns commands and reconciliation. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:457-488] [VERIFIED: src/bootstrap/workoutLifecycle.test.ts:268-290] |
| Scroll anchor, reduced-motion behavior, focus restoration | Browser / Client | — | These are React Native layout/accessibility concerns. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:77-112] [VERIFIED: src/ui/theme/index.ts:254-294] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---:|---|---|
| React | `19.2.3` | Component/state composition | Already installed project runtime; use existing hooks and memoization only. [VERIFIED: package.json:104-104] |
| React Native | `0.86.3` | `ScrollView`, layout, accessibility and dimensions | Existing UI primitive stack; no dependency required. [VERIFIED: package.json:105-105] |
| Expo Router | `~57.0.19` | Remove obsolete review route parameter/route navigation | Existing route layer. [VERIFIED: package.json:115-115] |

### Supporting

| Asset | Purpose | Use in Phase 8 |
|---|---|---|
| `AdaptiveScreen` | Safe-area, sticky header, single `ScrollView`, dock space and scroll restore | Enhance/reuse; do not nest a virtualized list in its `ScrollView`. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:44-112] [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:169-205] |
| `SetRow` | Existing full row editor/Complete/correction/remove semantics | Preserve for active and explicitly expanded rows; add a compact presentation path rather than duplicating mutation logic. [VERIFIED: src/ui/components/SetRow.tsx:354-400] [VERIFIED: src/ui/components/SetRow.tsx:1021-1188] |
| `RestDock` | Rest timer and controls | Keep as the unchanged `AdaptiveScreen` dock. [VERIFIED: src/ui/components/RestDock.tsx:162-197] [VERIFIED: src/ui/components/RestDock.tsx:332-455] |

**Installation:** None. This phase requires no new package. [VERIFIED: package.json:1-143]

## Per-Decision Implementation Notes

### D-01 — Collapse completed/earlier exercises

Use local `Set<string>`/single-id UI state keyed by stable `ActiveWorkoutExercise.id`; default-expand the `activeExerciseId`, planned/upcoming exercises, and a user-tapped completed section. The collapsed summary must be a button with an exact accessible name/state and non-color status text/icon. The source model makes this safe because exercises have stable `id`, `name`, `status`, and their own warmups/working sets. [VERIFIED: src/domains/workout/activeWorkout.ts:56-68]

Do not infer completion from ordinal or render order: use the verbatim status value `"completed"`. [VERIFIED: src/domains/workout/activeWorkout.ts:63-67]

### D-02 — Active-set auto-scroll and reduced motion

Use a keyed scroll request after the next active row has laid out: store the target set id, obtain its measured y through the existing `SetRow` `onLayout`/`onRevealedLayout` pattern, then call the outer scroll owner once. Existing `AdaptiveScreen` currently holds its own `ScrollView` ref and restores on a changed `scrollRestoreKey` via `scrollTo({ animated: false, x: 0, y: scrollOffset })`. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:77-112] `SetRow` already reports a revealed row layout and focuses it. [VERIFIED: src/ui/components/SetRow.tsx:452-472] [VERIFIED: src/ui/components/SetRow.tsx:788-808]

Use `const { reduceMotion } = useAppTheme()` and set `animated: !reduceMotion`. The theme provider derives this from `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged`; existing sheets use `reduceMotion ? "none" : "fade"`. [VERIFIED: src/ui/theme/index.ts:254-294] [VERIFIED: src/ui/components/RestAlertSettingsSheet.tsx:171-176]

Pitfall: changing `scrollRestoreKey` before a new row measurement exists can execute the current restore effect with a stale `scrollOffset`; plan a request revision/key that changes only after the target layout is known. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:99-112] [VERIFIED: src/ui/components/SetRow.tsx:793-796]

### D-03 — Retire focus/review mode

Remove `reviewExerciseId` and `onReturnToCurrent` from `ActiveWorkoutScreenProps`, then remove `viewedExercise`, `reviewingEarlierOrLater`, `ReviewSetSummary`, the review `InlineNotice`, and conditionals that suppress the More sheet, RestDock, confirmation sheets, or action controls. These props and branches are all local to the active screen. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:332-349] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:405-414] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:923-986] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:1221-1305]

The routing touch points are `app/workout/[sessionId].tsx` (parses `reviewExerciseId` and forwards it) and `app/workout-plan/[sessionId].tsx` (creates that route parameter). [VERIFIED: app/workout/[sessionId].tsx:39-49] [VERIFIED: app/workout/[sessionId].tsx:250-269] [VERIFIED: app/workout-plan/[sessionId].tsx:81-97] `workoutAppRuntime.tsx` does not pass screen props: it exposes `getActiveWorkout`, which delegates to `workoutRepository.getWorkoutSession`. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2493-2495]

Retire `WorkoutPlanOverviewScreen` and `/workout-plan/[sessionId]` if nothing else consumes their review-only flow, and update the Phase-2 attended preview fixture which maintains the same `reviewExerciseId` destination state. [VERIFIED: src/ui/screens/WorkoutPlanOverviewScreen.tsx:44-50] [VERIFIED: app/__phase2-attended-preview.tsx:402-464]

### D-04 — Active editor; compact other rows

The existing `SetRow` owns input parsing, draft persistence, validation, Complete activation, correction, and safe removal. [VERIFIED: src/ui/components/SetRow.tsx:474-684] [VERIFIED: src/ui/components/SetRow.tsx:1021-1188] Preserve it as the rich row for `set.id === view.activeSetId` and for a local `expandedSetId`; render all other rows compactly from `formatObservation(observationForSet(set))`, its status, and an expand button. These helpers already provide target/default rendering without new domain data. [VERIFIED: src/ui/components/SetRow.tsx:47-158]

Only the active working set should call `completeCurrentSet`; that handler re-fetches the current set from `viewRef.current.currentExercise`, verifies `activeSetId`, sends expected revisions/idempotency material, then calls `applyView(result.view)`. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:501-540] During refactor, make lookup exercise-agnostic where a handler can be invoked from a non-current expanded section, but leave mutation inputs and commit gating unchanged.

### D-05/D-06 — Full-list entry anchor, overview-only surface

Render every entry from `view.exercises` in model order; `ordinal` exists but the read model supplies the already ordered collection. [VERIFIED: src/domains/workout/activeWorkout.ts:56-68] Establish the first anchor after the list has mounted using `activeSetId`, not `currentExercise` or the top of the list. [VERIFIED: src/domains/workout/activeWorkout.ts:105-115]

### D-07 — Empty workout inside overview

Move the `"state" in view` branch from the route into an overview shell component that accepts `WorkoutSessionView`. `EmptyWorkoutView` has no `exercises` or `currentExercise`, but it has `id`, `revision`, null active identities, zero progress, and `rest`; this requires a union-safe shell before rendering exercise sections. [VERIFIED: src/domains/workout/activeWorkout.ts:117-131] Keep the existing explicit zero-set save/discard confirmation behavior, but render the Add-exercise affordance and no set rows. The current separate empty branch is in the active route. [VERIFIED: app/workout/[sessionId].tsx:130-215]

## Architecture Patterns

### System Architecture Diagram

```text
Expo route /workout/[sessionId]
  -> runtime.getActiveWorkout(sessionId)
  -> WorkoutSessionView (ActiveWorkoutView | EmptyWorkoutView)
  -> overview shell
       -> ordered exercise sections -> compact or expanded SetRow
       -> active-set measurement -> AdaptiveScreen scroll request
       -> pinned Phase-9 Add-exercise affordance
  -> existing command handler -> repository commit -> returned ActiveWorkoutView
  -> applyView -> auto-collapse / target re-measure -> reduced-motion-aware scroll

view.rest (running|paused) -> unchanged RestDock -> existing revision-checked rest commands
```

### Recommended Project Structure

```text
app/workout/[sessionId].tsx               # union-safe route, command wiring, no review query parameter
src/ui/screens/ActiveWorkoutScreen.tsx    # overview shell and existing command handlers
src/ui/components/SetRow.tsx              # reusable full editor; optional compact/expanded API
src/ui/layout/AdaptiveScreen.tsx          # single scroll owner plus keyed scroll request support
src/ui/__tests__/ActiveWorkoutScreen.test.tsx
maestro/...                               # updated lifecycle-visible overview assertions
```

### Scroll Container Recommendation

**Use a memoized section component tree inside the existing `AdaptiveScreen` `ScrollView`, not `SectionList`.** `AdaptiveScreen` already creates the scroll view and owns sticky header/dock spacing, so nesting a virtualized `SectionList` would create two vertical scroll owners. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:149-206] Phase 8 sections are bounded to a single workout and D-01/D-04 intentionally avoid mounting every full editor, so memoized sections provide simpler testable deterministic layout. [ASSUMED]

Implement an imperative/keyed scroll request in `AdaptiveScreen` rather than trying `scrollToIndex`; `ScrollView.scrollTo` directly supports the measured y value the existing screen already obtains. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:77-112] This is more reliable for variable-height expanded editors and collapse animation than an index-based virtual list. [ASSUMED]

### Reusable Assets

| Asset | Reuse / change | Evidence |
|---|---|---|
| `src/ui/screens/ActiveWorkoutScreen.tsx` | Reuse all command handlers; replace only focused single-exercise render tree. | [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:501-894] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:923-1312] |
| `src/ui/components/SetRow.tsx` | Reuse full editor/Complete/correction/remove behavior; add compact expand surface without duplicating persistence. | [VERIFIED: src/ui/components/SetRow.tsx:354-400] [VERIFIED: src/ui/components/SetRow.tsx:1021-1188] |
| `src/ui/layout/AdaptiveScreen.tsx` | Reuse single scroll/dock/header behavior; expose or add keyed scroll command to control animation. | [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:44-112] [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:149-227] |
| `src/ui/components/RestDock.tsx` | Unchanged; pass next active set index/target from the overview's active set. | [VERIFIED: src/ui/components/RestDock.tsx:162-197] [VERIFIED: src/ui/components/RestDock.tsx:332-455] |
| `src/ui/screens/WorkoutPlanOverviewScreen.tsx` | Borrow status label/card conventions only; its navigation-to-review behavior is retired. | [VERIFIED: src/ui/screens/WorkoutPlanOverviewScreen.tsx:31-42] [VERIFIED: src/ui/screens/WorkoutPlanOverviewScreen.tsx:155-208] |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Set edit/validation/complete behavior | A second overview-only set editor | Existing `SetRow` + existing screen command handlers | It already serializes draft saves, validates metric profiles, retains values on failure, and exposes semantic activation. [VERIFIED: src/ui/components/SetRow.tsx:613-671] [VERIFIED: src/ui/components/SetRow.tsx:1128-1151] |
| Rest/Undo/reconciliation | A new timer or completion state machine | Existing `RestDock`, rest commands, lifecycle | Timer and feedback state are authoritative outside the layout. [VERIFIED: src/ui/components/RestDock.tsx:217-330] [VERIFIED: src/bootstrap/workoutLifecycle.test.ts:268-290] |
| Motion preferences | Local device preference | `useAppTheme().reduceMotion` | The provider already subscribes to system changes. [VERIFIED: src/ui/theme/index.ts:254-294] |

## Integration Points

1. **Route:** `app/workout/[sessionId].tsx` currently fetches `WorkoutSessionView`, owns the separate empty branch, maps runtime commands, and forwards review-mode props. Make it render the unified overview for both union arms and remove review parameter handling. [VERIFIED: app/workout/[sessionId].tsx:39-80] [VERIFIED: app/workout/[sessionId].tsx:130-270]
2. **Runtime:** retain `getActiveWorkout(sessionId) -> workoutRepository.getWorkoutSession(sessionId)` so resumed/empty sessions preserve their union type. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2493-2495]
3. **Screen:** adapt handler lookups that currently use `currentExercise` so a full-list render never applies a row event to the wrong exercise. The current handlers reference `currentExercise` for completion, drafts, add/remove, correction, and skip. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:514-534] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:543-578] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:646-678] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:782-828]
4. **Review-only route:** delete or repurpose `app/workout-plan/[sessionId].tsx`, which currently routes review selection to `/workout/[sessionId]?reviewExerciseId=...`. [VERIFIED: app/workout-plan/[sessionId].tsx:35-97]
5. **Preview/test fixture:** remove review destination state from `app/__phase2-attended-preview.tsx`; keep it compiling against the simplified screen props. [VERIFIED: app/__phase2-attended-preview.tsx:402-464]

## Common Pitfalls

### Handler scope drift
**What goes wrong:** A row displayed for a non-current exercise uses a handler that searches `currentExercise`, causing a no-op or wrong input. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:514-518]  
**Avoid:** resolve by `set.id` across `view.exercises` for presentation only, but retain command expected revisions and the server/domain active-set check.

### Completion acknowledged before commit
**What goes wrong:** Local UI changes status or starts rest before `commands.completeSet` returns.  
**Avoid:** retain `applyView(result.view)` only after the awaited command; failure must retain row values and show the existing retry notice. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:501-540] [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1051-1114]

### Two vertical scroll owners
**What goes wrong:** A `SectionList` nested under `AdaptiveScreen` conflicts with outer scroll, dock padding, and Maestro traversal.  
**Avoid:** one `AdaptiveScreen` outer scroll owner. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:169-205]

### Index-based selector collisions
**What goes wrong:** Current `SetRow` testIDs are `working-set-${index}-row` and warmup equivalents; repeated indexes across exercise sections collide in a session overview. [VERIFIED: src/ui/components/SetRow.tsx:788-800]  
**Avoid:** add namespaced overview selectors such as `active-workout-exercise-${exercise.id}` and `active-workout-set-${set.id}` while retaining role/name selectors for accessibility. [ASSUMED]

### Lost anchor after expansion/collapse
**What goes wrong:** offsets change after an editor expands or a completed section collapses.  
**Avoid:** target set-id + post-layout measurement, not a precomputed index. [ASSUMED]

## Test and Verification Surface

### Existing selector conventions

- The outer screen exposes `active-workout`, `active-workout-scroll`, and its sticky header derives `active-workout-sticky-header`. [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:1219-1220] [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:164-187]
- Current row IDs are `working-set-${index}-row`, `warmup-W${index}-row`, and matching `-actions`/`-control-band`; use stable set-id namespacing for the overview because indexes repeat per exercise. [VERIFIED: src/ui/components/SetRow.tsx:788-815] [VERIFIED: src/ui/components/SetRow.tsx:1033-1035] [VERIFIED: src/ui/components/SetRow.tsx:1113-1116]
- Existing exact primary action names include `Complete Set 1` and `Complete warm-up W1`. [VERIFIED: src/ui/components/SetRow.tsx:421-424] [VERIFIED: src/ui/components/SetRow.tsx:1128-1151]
- Set completion exposes a D-pad/screen-reader `activate` accessibility action; keep it in the active inline path. [VERIFIED: src/ui/components/SetRow.tsx:1128-1149]

### Tests to update/remove

| Test/flow | Required change |
|---|---|
| `src/ui/__tests__/ActiveWorkoutScreen.test.tsx:308-364` | Replace current/review identity assertions with one overview header + all-section/render/expand assertions; remove `active-workout-identity-review` and `REVIEWING WORKOUT`. [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:308-364] |
| `src/ui/__tests__/ActiveWorkoutScreen.test.tsx:484-576` | Remove review-route expectations and assert that all listed exercises/sets stay in one active surface without a return banner. [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:484-576] |
| `src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx:108-191` | Remove if the review-only route is removed; preserve its stale-route loading discipline in the active route if fetch behavior moves. [VERIFIED: src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx:108-191] |
| `maestro/phase2/remediation-workout.yaml:406-434` | Remove the Today-plan → review exercise → return-to-current sequence; replace with in-overview traversal/expand evidence. [VERIFIED: maestro/phase2/remediation-workout.yaml:406-434] |
| Maestro assertions containing `FOCUSED WORKOUT` | Update title/eyebrow assertions across listed active-workout flows; do not remove their completion/rest/recovery assertions. [VERIFIED: maestro/phase2/remediation-workout.yaml:19-33] [VERIFIED: maestro/phase5/core-workout-lifecycle.yaml:30-53] [VERIFIED: maestro/phase7/workout-removal-audio.yaml:30-71] |

### Guarantees that must re-pass

- **Commit-gated completion/retry:** test `Saving set…`, no optimistic completed status, exact retry inputs, and retained values. [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1051-1114]
- **RestDock:** running/paused state disables row Complete/remove; pause/resume/adjust/skip send revision-checked inputs and ready state re-enables Complete. [VERIFIED: src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1778-1901]
- **Process death and rest recovery:** existing Maestro flows complete a set, kill/relaunch, resume, retain dock state, and continue with the next Complete action. [VERIFIED: maestro/smoke/phase1-full-loop.yaml:45-74] [VERIFIED: maestro/lifecycle/rest-recovery.yaml:84-135]
- **Rotation/background recovery:** existing lifecycle Maestro changes orientation before completion, then process-death/relaunches rest; keep that flow and add active-overview anchor visibility after resume. [VERIFIED: maestro/lifecycle/rest-recovery.yaml:35-83] [VERIFIED: maestro/lifecycle/rest-recovery.yaml:90-135]
- **Notification reconciliation:** preserve the denied/late/stale notification flow and runtime lifecycle tests; it remains independent of layout. [VERIFIED: maestro/smoke/phase1-denied-late-notifications.yaml:26-112] [VERIFIED: src/bootstrap/workoutLifecycle.test.ts:268-290]
- **Accessibility/layout:** component tests must cover exact labels, visible focus/D-pad activation, status icon plus text, 48dp controls, System/Light/Dark, compact/medium/expanded widths, 200% text, and reduced-motion non-animated anchor. The inherited requirement is binding. [VERIFIED: .planning/REQUIREMENTS.md:64-73]

### Validation Architecture

| Property | Value |
|---|---|
| Framework | Jest 29.7.0 with `@testing-library/react-native` 14.0.1. [VERIFIED: package.json:139-142] |
| Config | `jest.config.js`; component tests include `app/**/*.test.tsx` and `src/ui/**/*.test.tsx`. [VERIFIED: jest.config.js:1-81] |
| Quick component command | `npm run test:components -- --runInBand --runTestsByPath src/ui/__tests__/ActiveWorkoutScreen.test.tsx` [VERIFIED: package.json:18-19] |
| Full local suite | `npm run test:all` [VERIFIED: package.json:48-48] |
| Lifecycle-visible E2E | Maestro is installed (`2.8.0`); project scripts include phase suites through `test:maestro:phase7`. [VERIFIED: package.json:23-29] |

**Wave 0 gaps**
- [ ] Add/replace component tests for multi-exercise rendering, status/collapse behavior, active/editor default, compact-row tap expansion, entry and post-completion anchoring, and reduced-motion scroll request.
- [ ] Add union-safe empty-overview component/route test: Add-exercise affordance visible, zero rows, existing zero-set/discard confirmations survive.
- [ ] Update a Maestro lifecycle flow to assert session overview plus resume/anchor and preserve existing rest/notification path.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | Phase 8 adds no account or authentication surface. [VERIFIED: .planning/phases/08-session-overview-navigation/08-CONTEXT.md:7-12] |
| V3 Session Management | Yes | Preserve route session-id handling and repository-backed session revision checks. [VERIFIED: app/workout/[sessionId].tsx:39-80] [VERIFIED: src/ui/screens/ActiveWorkoutScreen.tsx:521-534] |
| V4 Access Control | No | Single-owner local presentation refactor; no new authorization decision. [ASSUMED] |
| V5 Input Validation | Yes | Reuse `SetRow` validation and existing mutation inputs; do not add raw input paths. [VERIFIED: src/ui/components/SetRow.tsx:474-610] |
| V6 Cryptography | No | No new cryptographic operation or dependency. [VERIFIED: package.json:104-143] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A memoized non-virtualized section tree is sufficient for expected one-session size. | Scroll Container Recommendation | Long custom workouts could need virtualization. |
| A2 | A target-id measured scroll request is more robust than index scrolling for dynamic editor heights. | Scroll Container Recommendation / Pitfalls | Implementation may need native-device tuning. |
| A3 | No V4 control applies to this local, single-owner presentation refactor. | Security Domain | A future remote/shared surface could change the threat model. |

## Open Questions

1. **Exact overview header copy and the disabled/Phase-9-stub behavior of Add exercise.**
   - What we know: D-03 removes `FOCUSED WORKOUT` / review mode, and D-07 requires a prominent Add-exercise affordance. [VERIFIED: .planning/phases/08-session-overview-navigation/08-CONTEXT.md:31-52]
   - Recommendation: lock copy in UI planning and make a disabled control expose why it is unavailable, or a clearly labelled Phase-9 stub; do not pretend mutation exists.
2. **Whether `WorkoutPlanOverviewScreen` remains useful after review navigation is retired.**
   - What we know: its only UI interaction invokes `onReviewExercise`, which creates the retired query route. [VERIFIED: src/ui/screens/WorkoutPlanOverviewScreen.tsx:155-208] [VERIFIED: app/workout-plan/[sessionId].tsx:81-97]
   - Recommendation: delete both review-only screen/route in this phase unless a separately specified read-only plan destination exists.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | Typecheck/tests | Yes | `v26.8.2` | — |
| npm | Package scripts | Yes | `11.19.1` | — |
| Maestro | Lifecycle-visible overview proof | Yes | `2.8.0` | Component tests only are insufficient for lifecycle proof. |

## Sources

### Primary (HIGH confidence)
- Worktree sources cited inline, especially `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/domains/workout/activeWorkout.ts`, `app/workout/[sessionId].tsx`, and `src/ui/layout/AdaptiveScreen.tsx`.
- Phase constraints: `.planning/phases/08-session-overview-navigation/08-CONTEXT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing installed stack and no package change.
- Architecture: HIGH — read model, render tree, route, and scroll owner inspected in this worktree.
- Pitfalls: HIGH for handler/commit/scroll ownership evidence; MEDIUM for performance selection because expected session size is not specified.

**Research date:** 2026-09-15  
**Valid until:** 2026-10-15 for this source snapshot.

## RESEARCH COMPLETE
