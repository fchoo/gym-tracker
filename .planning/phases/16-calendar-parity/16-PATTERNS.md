# Phase 16: Calendar Parity - Pattern Map

**Mapped:** 2026-10-06
**Core implementation/evidence roles mapped:** 34
**Live-or-planned contract coverage:** 34 / 34
**Execution prerequisites:** Phase 13 typed Calendar range read plus exact `loadPlannedStrengthOccurrence`; Phase 15 shared Active-shaped read-only presenter; Phase 17 Running detail; Phase 18 imported-activity detail and Calendar-origin route registration

## Pattern Map Scope

This map covers only the Calendar controller/worklet split, shared Calendar components, civil-date and event transforms, read ports, read-only detail/preview surfaces, routes, tests, and native evidence named by `16-CONTEXT.md`, `16-UI-SPEC.md`, and `16-RESEARCH.md`.

The current `CalendarScreen` is a seam, not the visual or data oracle. The planner must preserve its useful civil-date, focus, loading, and repository boundaries while replacing its Sunday-first 42-cell grid, status glyphs, fixed-distance JS-thread swipe, selected-session cards, snapshot clearing, and direct mutable session route.

## File Classification

| New / Modified File | Role | Data Flow | Closest Live Analog | Match Quality |
|---|---|---|---|---|
| `src/domains/scheduling/localDate.ts` | utility | transform | same file: `parseLocalDate`, `addLocalDays`, `weekdayForLocalDate` | exact extension |
| `src/domains/history/calendar.ts` | utility | transform | same file: pure switch/order helpers | exact role; superseded DTO |
| `src/ui/calendar/calendarPorts.ts` + test | adapter/test | request-response | `src/bootstrap/customExerciseRuntimeReadPort.ts` | strong narrow-`Pick`/null-on-missing boundary |
| `src/ui/calendar/calendarTransitionController.ts` | controller | event-driven | `src/domains/advancedTiming/advancedTimingState.ts` | strong role/data-flow match |
| `src/ui/calendar/CalendarMonthViewport.tsx` | component/worklet | event-driven | `src/ui/components/PlanEditorFields.tsx#PlanEditorReorderableRow` | strong worklet/measurement match |
| `src/ui/calendar/CalendarWeekRow.tsx` | component | transform + event-driven | `src/ui/screens/CalendarScreen.tsx#CalendarGrid`; `FocusablePressable` | partial; presentation is superseded |
| `src/ui/calendar/CalendarAgenda.tsx` | component | event-driven | `src/ui/components/NavigationRow.tsx#NavigationRow` | strong single-target row match |
| `src/ui/screens/CalendarScreen.tsx` | component/controller host | request-response + event-driven | same file; `ExerciseDetailScreen` source-state pattern | exact seam; core replaced |
| Phase 13 `trainingCalendarRepository.ts` / runtime read-port exports | repository/service | CRUD read + batch | `historyRepository.ts#createHistoryRepository`; `customExerciseRuntimeReadPort.ts` | partial; final upstream symbol absent |
| Phase 13 `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence` | service | exact-ID query | `customExerciseRuntimeReadPort.ts#loadExercise` | exact planned contract; implementation prerequisite |
| `src/ui/calendar/CalendarReadOnlyWorkout.tsx` | component/provider | request-response | `ActiveWorkoutScreen` disclosure hierarchy; `SessionDetailScreen` factual detail | partial; final Phase 15 presenter absent |
| `src/ui/screens/PlannedWorkoutDetailScreen.tsx` | component | request-response | `ExerciseDetailScreen` load/missing/error states | strong state match |
| `app/(tabs)/calendar.tsx` | route/provider | request-response | same file; Library route focus lifecycle | exact seam; dispatch replaced |
| `app/calendar/plan/[occurrenceId].tsx` | route/provider | request-response | `app/library/exercise/[exerciseId].tsx` | strong route lifecycle match |
| `app/session/[sessionId].tsx` | route/provider | request-response | same file | exact seam; capability split required |
| `src/domains/scheduling/localDate.test.ts` | test | transform | same file's table-driven civil arithmetic tests | exact |
| `src/domains/history/calendar.test.ts` | test | transform | same file's pure ordering tests | exact role; assertions replaced/extended |
| `src/ui/__tests__/CalendarTransitions.test.tsx` | test | event-driven | `advancedTimingState.test.ts`; `useCsvExportController.test.tsx` | strong state/race match |
| `src/ui/__tests__/CalendarScreen.test.tsx` | test | request-response + event-driven | same file | exact seam; many assertions superseded |
| `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` | test | request-response | `WorkoutCompletionScreen.test.tsx`; route test pattern | strong |
| Phase 13 `tests/sqlite-host/trainingCalendarRepository.test.ts` | test | CRUD read + batch | `tests/sqlite-host/historyRepository.test.ts` | role match; final upstream file absent |
| `src/bootstrap/phase16CalendarTestControls.ts` + test | dev-test adapter | event-driven | `src/bootstrap/phase12BackupTestControls.ts` | exact production-rejection/fixture-seam pattern |
| `app/__tests__/calendar-cross-destination-route.test.tsx` | integration test | request-response | Phase 17/18 real route tests | exact cross-route role; waits for real destinations |
| `maestro/v1.2/calendar.yaml` | test/config | event-driven | `maestro/phase6/gesture-smoke.yaml` | role match only; final-state smoke is insufficient |
| `scripts/run-v12-maestro.mjs` | utility/test runner | batch + file-I/O | `scripts/run-phase12-maestro.mjs` | exact evidence-envelope match |
| `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json` | contract | deterministic mapping | `.planning/design/v1.2-browser-evidence/source-manifest.json` | exact source-identity map |
| `scripts/compare-v12-calendar.mjs` | utility/test comparator | batch + image/file-I/O | Phase 20 `scripts/compare-v12-visual.mjs` plan contract | exact role; Phase 16 Calendar shard |
| `scripts/v12-calendar-comparison.test.mjs` | test | adversarial file-I/O | Phase 20 comparison-test contract | exact role; Calendar-only cases |
| `scripts/fixtures/v12-calendar-{comparison,evidence}/complete.json` | test fixtures | bounded file-I/O | Phase 9/12 evidence test fixtures | exact adversarial positive-control role |
| `scripts/verify-v12-native-evidence.mjs` | utility/test verifier | batch + file-I/O | `scripts/verify-phase9-v20-native-evidence.mjs` | exact verifier role match |
| `scripts/v12-evidence-scripts.test.mjs` | test | batch + file-I/O | `scripts/phase9-v20-native-evidence.test.mjs` | exact adversarial-verifier match |
| `scripts/benchmark-v12-interactions.mjs` | utility/test | batch + streaming samples | `scripts/benchmark-phase3.mjs` | strong diagnostic envelope; Phase 20 owns release/profile acceptance |
| `scripts/run-coverage-gate.mjs` | config/test runner | batch | same file integrity-critical list | exact extension |
| `package.json` Phase 16 scripts | config | batch | existing phase-specific runner/verifier scripts | exact additive script-alias pattern; dependencies unchanged |

## Pattern Assignments

### `src/domains/scheduling/localDate.ts` (utility, transform)

**Analog:** `src/domains/scheduling/localDate.ts`

Preserve branded `LocalDate`, stable validation errors, integer-only civil arithmetic, and the `0001-01-01` through `9999-12-31` boundary. Extend this module instead of leaving month arithmetic in the screen.

**Civil arithmetic pattern** (`src/domains/scheduling/localDate.ts:129-162`):

```typescript
export function parseLocalDate(value: string): LocalDate {
  componentsOf(value);
  return value as LocalDate;
}

export function addLocalDays(value: LocalDate, dayCount: number): LocalDate {
  if (!Number.isSafeInteger(dayCount)) {
    throw new LocalDateValidationError("local_date_day_count_invalid");
  }
  return formatComponents(civilFromDays(ordinal(value) + dayCount));
}

export function weekdayForLocalDate(value: LocalDate): Weekday {
  const weekdayIndex = ((ordinal(value) + 4) % 7 + 7) % 7;
  return WEEKDAYS[weekdayIndex]!;
}
```

Add month-start, days-in-month, add-month-with-day-clamp, Monday-first week-start, and variable four/five/six-row grid helpers beside these functions. Reuse `componentsOf`, `formatComponents`, and `addLocalDays`; do not use `new Date("YYYY-MM-DD")`, milliseconds-per-day, or duplicate `daysInMonth` in UI.

**Test pattern** (`src/domains/scheduling/localDate.test.ts:21-36,73-102`): use `it.each` for leap, century, month/year, negative, invalid, and lower/upper-bound cases. Add December↔January, shorter-month clamp, leap February, Monday-grid start, and exact four/five/six-row month cases.

---

### `src/domains/history/calendar.ts` (utility, transform)

**Analog:** `src/domains/history/calendar.ts`

Keep the pure, exhaustive switch/order style, but replace date-flattened `CalendarDayState` outputs with helpers that order typed Phase 13 events without erasing event identity.

**Pure ordering pattern** (`src/domains/history/calendar.ts:22-44`):

```typescript
export function calendarStateForSession(
  status: HistorySessionStatus,
  source: HistorySource,
): CalendarDayState {
  if (source === "manual" || status === "manual_visit") return "manual";
  return status === "partial" ? "partial" : "completed";
}

export function orderedCalendarStates(
  states: readonly CalendarDayState[],
): readonly CalendarDayState[] {
  const present = new Set(states);
  return Object.freeze(order.filter((state) => present.has(state)));
}
```

The function boundary is worth copying; the state-flattening behavior is not. The Phase 16 helper must preserve every durable event ID, source order, sport, status, full title/source, and discriminated destination. Two same-date events must remain two independently routable values.

---

### `src/ui/calendar/calendarTransitionController.ts` (controller, event-driven)

**Primary analog:** `src/domains/advancedTiming/advancedTimingState.ts`
**Async freshness supplement:** `src/ui/portability/useCsvExportController.ts`

Use a discriminated immutable state/event model. Validate numeric/identity inputs at the boundary, return new frozen state, advance one monotonic revision/epoch per accepted or cancelled transition, and reject or no-op invalid stale completions.

**Discriminated immutable state pattern** (`src/domains/advancedTiming/advancedTimingState.ts:6-35,96-124`):

```typescript
export type AdvancedTimingStateV1 =
  | Readonly<{ version: 1; state: "idle"; revision: number; targetSessionSetId: null }>
  | Readonly<{
      version: 1;
      state: "running";
      revision: number;
      targetSessionSetId: string;
      nextBoundaryAtMs: number;
    }>;

export class AdvancedTimingStateTransitionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdvancedTimingStateTransitionError";
  }
}
```

**Guarded transition pattern** (`src/domains/advancedTiming/advancedTimingState.ts:153-194`): validate first, reject invalid source state, return `Object.freeze(...)`, and increment revision exactly once.

**Stale completion pattern** (`src/ui/portability/useCsvExportController.ts:25-44,69-76`):

```typescript
const currentGeneration = ++generation.current;
const next = await inputRef.current.create();
if (!mounted.current || currentGeneration !== generation.current) {
  await inputRef.current.discard(next).catch(() => undefined);
  return;
}
// publish only the current result
```

Calendar-specific controller state must cover stable month/date, preview title, pointer intent, settling, month/focused mode, expand/collapse/adjacent sequence, transition epoch, reduced-motion policy, Back priority, focus target, and request generation. Motion commands are outputs; Reanimated values, SQLite, refs, and router calls do not belong in this file.

Required pure predicates include:

```typescript
Math.abs(dx) >= viewportWidth * 0.25 // inclusive, shared by preview and release
Math.max(-viewportWidth, Math.min(viewportWidth, dx))
Math.abs(dx) >= Math.abs(dy) * 1.15 // after 7dp slop
```

Velocity must not be an input. Reduced motion changes execution, never the semantic destination/order.

---

### `src/ui/calendar/CalendarMonthViewport.tsx` (component/worklet, event-driven)

**Analog:** `src/ui/components/PlanEditorFields.tsx#PlanEditorReorderableRow`

Copy the execution-plane pattern: shared values and animated styles own per-frame geometry; bounded semantic notifications cross to React with `scheduleOnRN`; layout is measured; completion/finalization returns to one stable state.

**Imports and UI-thread bridge** (`src/ui/components/PlanEditorFields.tsx:12-24`):

```typescript
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
```

**Bounded worklet pattern** (`src/ui/components/PlanEditorFields.tsx:277-316`):

```typescript
const dragGesture = React.useMemo(() => Gesture.Pan()
  .onUpdate((event) => {
    const boundedTranslation = Math.max(
      minimumTranslation,
      Math.min(maximumTranslation, event.translationY),
    );
    translationY.value = boundedTranslation;
    scheduleOnRN(updatePreview, boundedTranslation);
  })
  .onFinalize(() => {
    translationY.value = withTiming(0, { duration: motion.setCommitMs });
    scheduleOnRN(publishPreview, null);
  }), [/* stable dependencies */]);
```

**Measurement pattern** (`src/ui/components/PlanEditorFields.tsx:333-345`): record `event.nativeEvent.layout.height` and avoid state churn when unchanged. Phase 16 additionally needs row `y`, viewport width, week-start key, invalidation on rotation/font/layout/background, and `measure(...) === null` cancellation/remeasure behavior.

Do not copy `GestureHandlerRootView` from `PlanEditorFields.tsx:343-429`; the app root already owns it. Do not copy its `scheduleOnRN` call on every update: Calendar translation stays entirely on the UI thread and crosses only when the 25% preview identity changes or a guarded transition completes.

Use manual activation for the locked 7dp / 1.15 intent ratio. Use exact `withTiming` durations/easings, `cancelAnimation`, and the controller epoch. No spring, resistance, overshoot, scale, velocity, JS-thread pan, or crossfade-only row replacement.

---

### `src/ui/calendar/CalendarWeekRow.tsx` (component, transform/event-driven)

**Seam analog:** `src/ui/screens/CalendarScreen.tsx#CalendarGrid`
**Interaction primitive:** `src/ui/components/index.ts#FocusablePressable`

Preserve one date as one focusable target with selected state, arrow-key civil-day navigation, a full semantic label, and decorative children hidden from accessibility.

**Focusable target pattern** (`src/ui/screens/CalendarScreen.tsx:237-291`):

```typescript
<FocusablePressable
  accessibilityLabel={accessibilityLabel}
  accessibilityRole="button"
  accessibilityState={{ selected }}
  focusable
  onKeyDown={/* ArrowLeft/Right = +/-1; ArrowUp/Down = +/-7 */}
  onPress={() => onSelectDate(date)}
>
  {/* visual children */}
</FocusablePressable>
```

**Shared focus primitive** (`src/ui/components/index.ts:215-264`): `FocusablePressable` forwards a host `View` ref and supplies Enter/Space activation when no custom key handler is present. Phase 14 replaces the legacy 2dp outline with the approved shared 3dp focus token; Phase 16 consumes that owner rather than defining a private focus width.

Replace the current Sunday labels, fixed 42 cells, glyphs, and `14.285%` layout (`CalendarScreen.tsx:54-56,136-165,283-303,498-513`). One `CalendarWeekRow` and one day/event renderer must be reused in month, selected, and following rows with Monday-first geometry, fixed date/event tracks, up to two titled events plus `+N`, and full untruncated spoken event identity/status/source.

---

### `src/ui/calendar/CalendarAgenda.tsx` (component, event-driven)

**Analog:** `src/ui/components/NavigationRow.tsx#NavigationRow`

Copy the render-only ownership boundary and one full-row target. The parent/controller owns workflow state and exact destination dispatch.

**Single-target row pattern** (`src/ui/components/NavigationRow.tsx:9-19,33-57`):

```typescript
export type NavigationRowProps = Readonly<{
  title: string;
  supportingText?: string;
  onPress(): void;
}>;

/** A render-only full-row destination/action; its owner retains all workflow state. */
<Pressable
  accessibilityLabel={title}
  accessibilityRole="button"
  onPress={onPress}
>
  <View>{/* title and supporting text */}</View>
  <ChevronRight accessible={false} />
</Pressable>
```

Replace its private focus implementation with shared `FocusablePressable`. Add the locked `5dp rail / content / 24dp chevron`, compact result/target, `Sport · status`, source, wrapping/200% behavior, and event-keyed forwarded ref. Do not place Resume/View/Match buttons or any nested action inside the row.

---

### `src/ui/screens/CalendarScreen.tsx` (screen/controller host, request-response + event-driven)

**Analog:** same file for the composition seam; `ExerciseDetailScreen` for source states.

Preserve:

- Props injected from the route rather than importing SQLite/router directly (`CalendarScreen.tsx:67-77`).
- Explicit `parseLocalDate` at input boundaries (`CalendarScreen.tsx:373-376`).
- Accessible screen/header, skeleton, error copy, and retry concepts (`CalendarScreen.tsx:416-447`).
- Arrow navigation by `addLocalDays`, selected semantics, and shared focus primitive.
- Cleanup/freshness concept from `CalendarScreen.tsx:382-396`, upgraded to monotonic request identity.

Replace:

- Private month/date helpers (`CalendarScreen.tsx:79-120`) with `localDate.ts` exports.
- `calendarMonthDirectionForHorizontalSwipe` fixed 72dp end-only decision (`122-134`) with controller predicates based on measured width.
- `CalendarGrid` (`189-306`) with `CalendarMonthViewport` + shared week rows.
- `SelectedDateSessions` cards (`308-363`) with compact `CalendarAgenda` typed events.
- `setSnapshot(null)` on every request and full-screen refresh error (`382-447`) with last-good snapshot + `Updating Calendar` + inline retry.
- `AdaptiveScreen` primary/secondary split (`449-495`) with the Phase 14 full-height root shell and anchored focused agenda.

**Load/missing/error state analog** (`src/ui/screens/ExerciseDetailScreen.tsx:195-222,273-340`): use an explicit state union, injected load port, retry generation, stable skeleton, distinct missing identity (`null`) and read error. Calendar must improve this analog by retaining last-good data during refresh and comparing request generation/range before publish.

Calendar owns visible month, selected date, focused/month mode, agenda scroll anchor, invoking event ID, date/event refs, and Back priority. Destination screens must not own or reset Calendar return state.

---

### Phase 13 typed Calendar repository/read port (repository/service, bounded batch read)

**Closest analogs:**

- `src/platform/sqlite/repositories/historyRepository.ts#createHistoryRepository`
- `src/bootstrap/customExerciseRuntimeReadPort.ts#createCustomExerciseRuntimeReadPort`

There is no live `trainingCalendarRepository.ts`, typed `CalendarEvent` range export, or `tests/sqlite-host/trainingCalendarRepository.test.ts` in this checkout. The first Phase 16 task must resolve Phase 13's implemented names. If absent, stop as an unmet dependency; do not create a competing Phase 16 status model.

**Read-only service narrowing** (`src/bootstrap/customExerciseRuntimeReadPort.ts:71-77`):

```typescript
export type CustomExerciseReadServices = Readonly<{
  customExerciseRepository: Pick<
    CustomExerciseRepository,
    "listExercisePlanReferences"
  >;
  kernel: SqliteKernel;
}>;
```

**Parameterized exact-ID read and missing state** (`customExerciseRuntimeReadPort.ts:177-227`): query with `WHERE ... = ?`, pass `[exerciseId]`, return `null` when absent, batch independent supporting reads with `Promise.all`, and return frozen DTOs (`228-266`).

**Repository factory pattern** (`customExerciseRuntimeReadPort.ts:389-398`):

```typescript
export function createCustomExerciseRuntimeReadPort(services: ReadServices) {
  return Object.freeze({
    loadExercise: (exerciseId: string) => readDetail(services, exerciseId),
  });
}
```

Preserve from history truth:

- Effective overlay replaces raw facts and voided history does not enter ordinary Calendar (`historyRepository.ts:568-645`).
- Inputs are validated as `LocalDate` and range bounds are parameterized (`760-795`).
- Results are immutable and deterministically ordered (`842-863`).

Replace from current `loadCalendarMonth`:

- Full history scan and per-session count N+1 (`760-819`).
- `Map<string, CalendarDayState[]>` flattening (`826-849`).
- Selected-date-only Strength session output (`850-863`).

The Phase 13 port must return one stable typed event per source identity across a bounded previous/current/next/following-week range, with LocalDate/timezone, sport, status, full title/source, and a discriminated destination identity. Screens never execute SQL or infer a destination from title/color/status.

---

### `src/ui/calendar/CalendarReadOnlyWorkout.tsx` (read-only presenter)

**Hierarchy analog:** `src/ui/screens/ActiveWorkoutScreen.tsx`
**Factual DTO/presentation analog:** `workoutOutcomeRepository.ts#loadSessionDetail` and `SessionDetailScreen.tsx`

The final Phase 15 presenter symbol is not live. Preflight Phase 15 exports and consume it through a query-only capability. Do not duplicate a Calendar-specific set presenter unless the plan records why the shared Phase 15 presentation cannot satisfy the contract.

**Active-shaped disclosure pattern** (`src/ui/screens/ActiveWorkoutScreen.tsx:2155-2225`): one exercise header is a `FocusablePressable`, exposes `accessibilityState={{ expanded: !collapsed }}`, states `N of N working sets`, and toggles only the local disclosure set.

**Factual detail builder** (`src/platform/sqlite/repositories/workoutOutcomeRepository.ts:1641-1774`): load exact session rows, resolve effective overlay, preserve exercise/set source order and status, build immutable/factual `SessionDetail`, and set `readOnly: true`. Calendar must receive only a narrow loader such as `Pick<WorkoutOutcomeRepository, "getSessionDetail">`, never the combined repository/runtime.

**Current omission test worth preserving and strengthening** (`src/ui/__tests__/WorkoutCompletionScreen.test.tsx:433-465`): omitted Correct/Remove callbacks yield no buttons and completed detail remains factual. Phase 16 must go further: make mutation props unrepresentable in the Calendar capability and assert no mutation imports/calls, keyboard/accessibility actions, or source digest changes.

Do not copy these current management affordances:

- `SessionDetailScreen` requires `onOpenExerciseHistory` and `onResume` (`SessionDetailScreen.tsx:109-125`).
- It renders exercise-history buttons (`273-276`), Correct/Remove/Resume (`376-396`), and a removal confirmation (`400-430`).
- `SetRow` usage in Active Workout receives edit/complete/remove/correction callbacks (`ActiveWorkoutScreen.tsx:2635-2693`).

Calendar read-only detail exposes only Back, exercise disclosure, committed/partial set facts, and focus restoration. No Correct, history-edit jump, Resume, Remove, complete, edit, reorder, settings, Start, keyboard command, or accessibility action.

---

### `src/ui/screens/PlannedWorkoutDetailScreen.tsx` (screen, request-response)

**Analog:** `src/ui/screens/ExerciseDetailScreen.tsx`

Copy the injected exact-ID loader and explicit `loading | ready | empty | error` model (`ExerciseDetailScreen.tsx:95-123,181-222`). Copy the separate skeleton, missing, and retry surfaces (`273-340`), but use exact Phase 16 copy and query-only props.

Use the exact Phase 13 contract: `src/domains/workout/index.ts` exports `PlannedStrengthOccurrenceDetail`; `src/bootstrap/trainingFoundationRuntime.ts` exports `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>`; and `createPlansWorkoutRepository(...).loadPlannedStrengthOccurrence(occurrenceId)` in `src/platform/sqlite/repositories/plansWorkoutRepository.ts` performs the query-only exact-provenance lookup. The result is deeply immutable and target-bearing; stale/mismatched plan/day/schedule/version/source revision returns `null` with no current-activation fallback. Phase 16 must fail fast if any part is absent. It must not fabricate a session ID, completed set, observation/result, rest effect, or Start action. [PLANNED: .planning/phases/13-multi-plan-running-foundation/13-02-PLAN.md]

Do not copy `ExerciseDetailScreen`'s mutation props/actions (`98-119,224-270,513-618`). The planned preview should be structurally unable to receive them.

---

### Routes: `app/(tabs)/calendar.tsx`, `app/calendar/plan/[occurrenceId].tsx`, `app/session/[sessionId].tsx`

**Root seam analog:** current `app/(tabs)/calendar.tsx`
**Exact-param/focus analog:** `app/library/exercise/[exerciseId].tsx`
**Capability split seam:** current `app/session/[sessionId].tsx`

Preserve from the Calendar root:

- Runtime/port injection and device-local civil-date construction (`app/(tabs)/calendar.tsx:13-29`).
- Screen remains router-free.

Replace direct session dispatch (`calendar.tsx:30-31`) with an exhaustive switch on the Phase 13 destination discriminant. Every push includes durable identity plus Calendar origin/return identity; never inspect title/source/date or coerce occurrence/activity IDs into session IDs. Phase 16 may test this union before downstream phases finish, but the final route wiring and CAL-17/CAL-20 integration evidence must wait for the real Phase 17 Plan 17-08 Running detail and Phase 18 Plans 18-08/18-14 imported-activity detail/Calendar registration. A mocked router call, href assertion, fixture route, or placeholder screen is not completion.

**Route-param normalization and return-focus lifecycle** (`app/library/exercise/[exerciseId].tsx:19-38`):

```typescript
const resolvedId = Array.isArray(id) ? id[0] ?? "" : id ?? "";
const [focusGeneration, setFocusGeneration] = useState(0);

useFocusEffect(useCallback(() => {
  setFocusGeneration((current) => current + 1);
}, []));
```

Calendar needs stronger behavior than remounting by key: retain its state and, after Back/layout, restore agenda scroll then focus the event-keyed host ref. The Library route test shows how to mock and fire `useFocusEffect` (`app/(tabs)/__tests__/library.test.tsx:15-23,50-72`).

Split `app/session/[sessionId].tsx` by explicit origin/capability before props are created. Current lines `92-125` always inject correction, removal, exercise history, and resume; that entire branch is management-only. Calendar origin passes a query-only presenter/capability and exact missing-state copy. Management origin must preserve current Correct/Remove/Resume behavior unchanged for CAL-22/23.

`app/calendar/plan/[occurrenceId].tsx` follows the exact-param/injected-screen pattern, returns missing rather than `"unknown"` fallback, and injects only the occurrence loader plus Back.

---

## Test Pattern Assignments

### Pure controller and civil transforms

**Analog:** `src/domains/advancedTiming/advancedTimingState.test.ts`

Copy explicit state fixtures and direct transition-result assertions (`advancedTimingState.test.ts:28-67`). Cover valid sequences and invalid source states (`88-147`), exact boundary behavior, revision/epoch increments, no-op stale completions, cancellation, and input validation (`408-465`).

`CalendarTransitions.test.tsx` must cover at minimum:

- 10%, 24.9%, exact 25%, 25.1%, both directions.
- Cross threshold then retreat below; cancel; vertical/diagonal yield; high-velocity sub-threshold snap-back.
- Previous/Next/Today equivalence; shorter-month clamp; exact one-month maximum.
- Expand first/middle/last row; collapse; adjacent-week collapse → select/focus → expand.
- Normal/reduced destinations identical; runtime toggle during every transition.
- Second drag/tap while settling; stale animation completion/fallback; stale query response.
- Back priority and focus target outputs.

Register `calendarTransitionController.ts` in `scripts/run-coverage-gate.mjs` if the planner classifies it integrity-critical. The existing list-and-loop pattern is `run-coverage-gate.mjs:16-123,171-188`; all statements/branches/functions/lines must then be 100%.

### Component and route tests

Preserve the `renderCalendar` provider harness and injected jest ports from `CalendarScreen.test.tsx:70-86`, but replace flattened `CalendarMonth` fixtures with typed event fixtures.

Keep these useful assertions in updated form:

- Civil date selection and no `Date` conversion (`113-138`).
- Adjacent-date selection and LocalDate lower/upper boundaries (`215-285`).
- Button/keyboard/gesture routes through one semantic decision (`179-213`), with measured percentage replacing fixed pixels.
- Light/Dark shared tokens (`308-331`), updated to Phase 14 Revision 18 tokens.

Replace these superseded assertions:

- `Sun` and exactly 42 cells (`93-100,140-177`). Require Monday-first and exact four/five/six rows.
- Status glyph/flattened state and selected session card checks (`97-110`). Require full event titles, sport/status/source, two-event overflow, source order, and exact destination ID.
- Fixed `-96/96/24` swipe helper (`210-212`). Use viewport percentages and the pure controller.
- The misleading refresh/error test (`287-306`) only proves initial failure then retry. Add deferred promises proving a last-good populated grid remains visible, stale responses cannot publish, exact retry identity is retained, and no fixture data appears.

Read-only detail tests should copy the negative-role assertions at `WorkoutCompletionScreen.test.tsx:433-465,641-662`, then add compile-time/query-capability and mock-runtime assertions that all mutation methods remain uncalled. Planned preview tests copy exact durable fixture construction from route tests (`app/__tests__/completion-route.test.tsx:24-57,100-132`) but assert exact occurrence load, `0 of N`, Planned dashes, missing/stale identity, Back, and absence of Start/session/results.

### SQLite/read-port tests

Follow repository host-test conventions: real `node:sqlite` fixture, source-backed rows, parameterized range, deterministic order, immutable identities. Required cases include effective correction replacing raw facts, void exclusion, planned Strength/Running, imported Running, same-date multiple events, past/future visibility, selected/following week across month boundary, missing identity, bounded query count, and no N+1 per-session count query.

Do not create `tests/sqlite-host/trainingCalendarRepository.test.ts` under Phase 16 if Phase 13 has already delivered an equivalent renamed file; resolve and extend the live Phase 13 test instead.

## Native Evidence Patterns

### Runner and evidence envelope

**Analog:** `scripts/run-phase12-maestro.mjs`

Copy:

- Exact package/flow/stage constants (`run-phase12-maestro.mjs:6-10`).
- Manifest checks for schema, suite, profile, embedded bundle, base HEAD, source digest, APK path/hash (`12-15,25-33`).
- Fresh report directory, per-stage JUnit, zero failures/skips, report hashes (`34-43`).
- Final evidence envelope bound to manifest/HEAD/source/APK (`44-56`).

Phase 16 stages must identify each CAL trace/capture and the exact normal/reduced-motion, viewport, theme, orientation, text scale, and input fixture.

### Reference mapping and visual differences

Create `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json` as the executable Calendar-only mapping from every requirement/state/fixture/configuration to one immutable Revision 18 reference and source-manifest hash. `scripts/compare-v12-calendar.mjs` generates individual reference/native/overlay/absolute-difference/mask files plus a canonical JSON record and hashes for every mapped capture; `scripts/v12-calendar-comparison.test.mjs` rejects missing/duplicate/extra mappings, stale reference hashes, path escapes/symlinks, mismatched configurations, missing constituent images, changed semantics/authority/focus/target geometry, unknown classifications, and unexplained differences. Contact sheets index individual evidence but cannot replace it.

Use the shared v1.2 verdict/classification contract. DEV-01/DEV-02 are dated approved adaptations: incomplete evidence remains `REVIEW_REQUIRED`, failed evidence is `FAIL`, and only complete passing evidence uses `accepted_deviation`. A pixel score never overrides semantic, routing, accessibility, or read-only failures.

### Adversarial verifier

**Analog:** `scripts/verify-phase9-v20-native-evidence.mjs`

Copy exact identity comparisons (`47-74`), exact expected-case set/no duplicates (`75-87`), and optional live device/package checks (`88-97`). Extend the schema to validate timestamped intermediate geometry/semantics, not merely pass status:

- Pointer dx and panel transform at 10/24.9/25/25.1% in both directions.
- Immediate title switch and retreat reversal.
- Selected/following row origin, intermediate, and destination coordinates.
- Focus identity and Back restoration.
- Pre/post source digest equality and zero mutation-command ledger.
- Raw frame samples, missed frames, refresh rate, profiler overhead, query samples.

**Verifier test analog:** `scripts/phase9-v20-native-evidence.test.mjs:14-35` builds temporary manifest/result fixtures, accepts one complete exact suite, and rejects missing/mismatched/stale/duplicate/APK evidence. Phase 16 must add malformed timestamps, missing intermediate samples, wrong threshold semantics, mutation digest differences, and incomplete appearance/viewport matrices.

### Performance diagnostics

**Analog:** `scripts/benchmark-phase3.mjs`

Copy exact manifest identity (`41-52`), exact ledger order (`54-62`), raw-duration/sample/p95 computation (`64-95`), and current source/APK validation (`102-123`). Replace the deferred generator (`144-159`) with real development-test collection for at least 100 representative query samples and 100 complete drag/expand/collapse sequences. Phase 16 records diagnostics without assigning a release/profile PASS or FAIL against 250ms/16.67ms; Phase 20 Plan 20-08 owns those acceptance verdicts on its immutable release/profile evidence.

### Maestro is orchestration, not motion proof

`maestro/phase6/gesture-smoke.yaml:8-18` and `app/__phase6-gesture-smoke.tsx:24-95` are useful only for opening a dev-test route, performing a native gesture, and asserting a final visible state. They do not prove Phase 16's intermediate 1:1 displacement, exact 25% boundary, measured row travel, or frame budget. Do not count final text/screenshots or Jest animation mocks as parity evidence.

## Current Calendar: Replace vs Preserve

| Current Symbol / Lines | Preserve | Replace |
|---|---|---|
| `CalendarScreenProps`, `CalendarScreen.tsx:67-77` | Inject ports/callbacks into a router/SQL-free screen | `loadCalendarMonth`/`onOpenSession` become typed range/read-port and discriminated destination APIs |
| `monthStart`, `nextMonth`, `daysInMonth`, `79-109` | Civil-only intent | Move to `localDate.ts`; add clamp/Monday-grid helpers; remove duplication |
| `calendarMonthDirectionForHorizontalSwipe`, `122-134` | Pure decision testability | Replace fixed 72dp/end-only rule with measured inclusive 25% controller; no velocity |
| `completeGridDates`, `136-145` | Use `addLocalDays` and handle supported boundaries | Monday-first exact four/five/six weeks, plus following week range |
| `stateLabel/stateGlyph`, `147-165` | Text semantics remain mandatory | Replace glyphs/flattened states with typed event chips and sport/status separation |
| `CalendarGrid`, `189-306` | One date target, selected semantics, arrow keys, focus | Replace JS-thread end swipe, 42-cell wrap, Sunday header, glyph body with viewport/worklets/shared week rows |
| `SelectedDateSessions`, `308-363` | Source-backed facts and durable session ID | Replace card list with compact all-event agenda and exact destination union |
| load effect, `382-396` | Cleanup/freshness guard and retry intent | Never clear last-good snapshot; add generation/range guard and retained inline error |
| error/loading branches, `416-447` | Exact calm copy, skeleton/retry concepts | Initial-only full skeleton; refresh/error remain in Calendar context |
| `AdaptiveScreen` composition, `449-495` | Shared shell dependency | Replace secondary pane with full-height Phase 14 root + focused spatial agenda |
| `app/(tabs)/calendar.tsx:13-29` | Runtime injection and local civil today | Exact Phase 13 read port and Calendar return token |
| `app/(tabs)/calendar.tsx:30-31` | None | Exhaustive durable destination switch; no universal `/session/{id}` |
| `app/session/[sessionId].tsx:37-56` | Exact-ID async load with cleanup/refresh generation | Distinct missing state and explicit origin capability |
| `app/session/[sessionId].tsx:92-125` | Preserve unchanged for management origin | Calendar origin must not construct/import correction, removal, exercise-history, or resume handlers |
| `AppearanceProvider`, `src/ui/theme/index.ts:243-295` | Runtime `reduceMotionChanged` subscription and shared `reduceMotion` value | Phase 14 supplies Revision 18 fonts/colors/tokens; do not copy old Source Sans/grey palette |

## Shared Cross-Cutting Patterns

### Query-Only Capability

Apply to `CalendarScreen`, `CalendarReadOnlyWorkout`, planned preview, and Calendar-origin routes. Narrow with `Pick<..., "readMethod">` or a dedicated frozen read port. Never inject `WorkoutAppRuntime`, `WorkoutOutcomeRepository`, or mutation callbacks and rely on hidden pixels.

### Immutable Source-Backed DTOs

Apply to repositories/read ports/controllers. Validate IDs/LocalDates at boundaries, parameterize SQL, preserve durable identities/source order, and return `Object.freeze(...)`. A missing/stale ID yields explicit `null`/missing state, never a fallback record or fixture.

### Generation/Epoch Freshness

Apply to query response, animation completion, fallback timer, adjacent expansion, rotation/background, and runtime reduced-motion changes. Only the current epoch may publish. Cancellation increments epoch and cancels UI-thread animation before resolving one stable state.

### Focus and Keyboard

Use `FocusablePressable` refs and the same activation handler for touch/Enter/Space/D-pad. Date arrows move civil +/-1 or +/-7. Store refs by LocalDate/event ID. Modal, collapse, route Back, and adjacent re-expansion restore the exact contracted focus target.

### Runtime Reduced Motion

Use `useAppTheme().reduceMotion` from `src/ui/theme/index.ts:243-295`. Do not create a competing preference or use Reanimated startup `useReducedMotion` as the only source. Dispatch the same controller transitions; omit row travel/timer dependence only.

### Evidence Identity and Privacy

Bind all native evidence to exact HEAD/source tree/package/APK/device. Use deterministic synthetic workout fixtures and aggregate/raw timing numbers; do not record personal workout rows, filenames, or sensitive payloads. Navigation/disclosure evidence includes a before/after source digest proving zero mutation.

## Anti-Patterns — Do Not Copy

| Anti-Pattern | Live Example / Evidence | Required Replacement |
|---|---|---|
| Fixed-distance end-only swipe | `CalendarScreen.tsx:55-56,122-134,208-220` | Measured viewport, continuous 1:1 worklet, inclusive 25%, no velocity |
| `.runOnJS(true)` for pan | `CalendarScreen.tsx:209-220` | UI-thread shared value; bounded semantic bridge only |
| Sunday-first fixed 42 cells | `CalendarScreen.tsx:54-65,136-145` | Monday-first exact four/five/six rows |
| Flatten same-day events to statuses | `historyRepository.ts:826-849` | Stable typed events with independent identities/destinations |
| N+1 count reads | `historyRepository.ts:796-819` | One range-indexed/batched Phase 13 query |
| Clear snapshot on every request | `CalendarScreen.tsx:382-396` | Retain last-good grid, update/error notice, generation guard |
| Direct Calendar → mutable session route | `app/(tabs)/calendar.tsx:30-31`; `app/session/[sessionId].tsx:92-125` | Discriminated route + compile-time Calendar capability |
| Read-only only by omitting visible buttons | `SessionDetailScreen.tsx:376-430` | Mutation props/imports structurally unavailable and negative-tested |
| Crossfade/fabricated row coordinates | no suitable live analog | measured overlays from exact month positions; null measurement cancels |
| Per-frame React state / `scheduleOnRN` | `PlanEditorFields.tsx:287-296` is acceptable for reorder preview, not Calendar | keep drag transform on UI thread; bridge only threshold/completion |
| Nested `GestureHandlerRootView` | `PlanEditorFields.tsx:343-429`; phase root already wraps app | reuse app root; only portal-owned trees add a root |
| `useReducedMotion` startup snapshot alone | not the repo pattern | use `AppearanceProvider` runtime event subscription |
| Final screenshot/text as motion proof | `maestro/phase6/gesture-smoke.yaml:8-18` | timestamped intermediate geometry/semantic/frame evidence |
| Development-test timing promoted to release acceptance | `benchmark-phase3.mjs:144-159` | collect raw Phase 16 diagnostics; Phase 20 Plan 20-08 owns threshold acceptance |
| Mocked/fake downstream Running/Garmin completion | Phase 17/18 routes are separate owners | wait for 17-08 and 18-08/18-14, then run the Phase 16 final real-route integration plan |

## No Analog Found

None. Every planned role has a live or accepted plan-contract analog. This does not mean the required Phase 13/15 symbols or Phase 17/18 destinations already exist at Phase 16 execution time; those dependency preflights are listed below.

## Resolved Cross-Phase Contracts / Dependency Preflight

| Required Symbol | Status | Planner Action |
|---|---|---|
| Phase 13 typed event DTO and range read-port/repository export | Not present in live `src/`/`tests/`; only flattened `CalendarMonth` exists | First task resolves the post-Phase-13 live exports and real SQLite test. Stop if absent; do not invent a parallel model. |
| `PlannedStrengthOccurrenceDetail` and `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId)` | Fixed by Phase 13 Plan 13-02; not present until that plan executes | Preflight the exact signature, deep immutability, target-bearing result and null-on-stale provenance; stop on mismatch. |
| Phase 15 `WorkoutSessionPresentation` and `WorkoutPresentationModel` | Fixed by Phase 15 Plan 15-01; not present until that plan executes | Preflight exact exports and reuse through query-only props; do not duplicate the presenter. |
| Phase 17 `app/library/running/[planId].tsx` / `RunningPlanDetailScreen` | Fixed by Phase 17 Plan 17-08; not present until that plan executes | Final Phase 16 integration runs only after `17-08-SUMMARY.md` and real route tests exist. |
| Phase 18 `app/garmin/activity/[activityId].tsx` / `ImportedActivityDetailScreen` plus Calendar registration | Fixed by Phase 18 Plans 18-08 and 18-14; not present until those plans execute | Final Phase 16 integration runs only after both summaries and real route tests exist; no mocked href completion. |

## Metadata

**Analog search scope:** `app/`, `src/domains/`, `src/bootstrap/`, `src/platform/sqlite/repositories/`, `src/ui/`, `tests/`, `maestro/`, `scripts/`
**Primary live/accepted-plan analog files read:** 28
**Pattern extraction date:** 2026-10-06
**Revision note:** Cross-phase route prerequisites, exact Phase 13 occurrence loader, Phase 14 3dp focus, diagnostic performance ownership, and Calendar comparison artifacts reconciled 2026-10-06.
