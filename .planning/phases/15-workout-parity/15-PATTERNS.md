# Phase 15: Workout Parity - Pattern Map

**Mapped:** 2026-10-06
**Targets mapped:** 38 file rows/groups
**Existing files analyzed:** 39 source, route, test, migration, and evidence files
**Analogs found:** 38 / 38; six capabilities have only composite or partial live analogs

## Scope Boundary

Phase 15 is a strangler refactor over the shipped workout engine. Keep SQLite
facts, revision checks, request hashes, receipt replay, the active set/exercise
pointer, rest timestamps, Undo snapshots, completion facts, and plan-write-back
tokens authoritative. Replace presentation and add only the narrow ports that
the approved Workout root, Active Workout, settings, trend, and completion
surfaces require.

Phase 13 and Phase 14 are hard implementation prerequisites. Resolve the exact
post-Phase-13 occurrence/start symbols and the actual Phase 14 `BottomSheet`,
`ConfirmationDialog`, `SemanticToast`, focus, token, and shell exports from
their completed summaries before editing Phase 15. Do not recreate those
dependencies locally if they are still absent.

`TIM-01` is approved as `retire-playback` with no compatibility mode. Validate
the dated owner record and characterize every seam before removing authoring,
runtime reconciliation/playback, and callbacks. No Phase 15 path may delete or
rewrite ordinary workout/history/rest facts or required schema-21/27 readers.

## File Classification

| New/Modified File | Role | Data Flow | Closest Live Analog | Match Quality | Direction |
|---|---|---|---|---|---|
| `app/(tabs)/index.tsx` | route/controller | request-response | same file, `TodayRoute` | exact file | adapt the Phase 13 selected occurrence intact; retain thin routing and exact Resume identity |
| `src/ui/screens/TodayScreen.tsx` | component | request-response + event-driven | same file, `TodayScreen` factual branches | exact file | recompose as Workout; retain loading/error/no-plan/rest/active/partial truth |
| `src/ui/components/WorkoutDaySelector.tsx` (proposed) | component | event-driven + transform | `PlanDaySwitcher` selected-state semantics only | partial | new read-only five-day selector; no reorder or schedule mutation props |
| `src/ui/components/WorkoutStartSheet.tsx` | component | event-driven | same file | exact file | migrate to Phase 14 sheet frame; preserve explicit scheduled/alternate/empty split and focus return |
| `app/workout/[sessionId].tsx` | route/controller | request-response + event-driven | same file, `ActiveWorkoutRoute` | exact file | add retry/root context/Undo/trend/settings wiring; apply approved TIM-01 removal after automatic record validation |
| `src/ui/screens/ActiveWorkoutScreen.tsx` | controller/component | event-driven + request-response | same file, `PopulatedWorkoutOverview` | exact file | keep active-only orchestration and authoritative-view application; delegate extracted presentation/sheets/docks |
| `src/ui/components/WorkoutSessionPresentation.tsx` (proposed) | component | transform + event-driven | `ActiveWorkoutScreen` exercise disclosure plus `SessionDetail` facts | composite | immutable facts/disclosure only; no runtime import or mutation capabilities |
| `src/ui/components/WorkoutSetFactsRow.tsx` (proposed) | component | transform | `SetRow` formatters/compact row plus `SessionDetailScreen` read-only rows | composite | render W/01 ordinals, Previous, Target/Result, and textual state; controller wraps editable rows |
| `src/ui/components/SetRow.tsx` | component/utility | transform + event-driven | same file, `formatObservation`/`observationForSet` and current row | exact file | move reusable formatting out or re-export it; remove inline editing, blur saves, and row-owned completion |
| `src/ui/components/WorkoutSetEditorSheet.tsx` (proposed) | component | event-driven + transform | `SetRow` metric conversion plus `SemanticNumberField`/`TimeDurationField` | composite | own a local draft; only explicit Save invokes a command |
| `src/ui/components/WorkoutActionDock.tsx` (proposed) | component | event-driven | `ActiveWorkoutScreen.completeCurrentSet` plus `PrimaryAction`/`SecondaryAction` | role-match | one compact Add/Complete/Retry row; no persistence or pointer synthesis |
| `src/ui/components/RestDock.tsx` | component | event-driven | same file | exact file | keep local clock/cue isolation; remove collapse and embedded Undo; expose four controls in required order |
| `src/ui/components/WorkoutPlanSettingsSheet.tsx` (proposed) | component | CRUD + event-driven | `RestAlertSettingsSheet` saved/draft/write queue and Phase 14 sheet frame | role-match | show authoritative and draft values separately; exact retry states; flat seconds only |
| `src/ui/components/ExerciseTrendSheet.tsx` (proposed) | component | request-response + transform | `ExerciseHistoryScreen` plus `ProgressTrend` | composite | adapt compatible metric history to six factual sessions and accessible chart/table text |
| `src/ui/components/PlanEditorFields.tsx` | component | event-driven | same file, `PlanEditorReorderableRow` | exact behavior seam | parameterize or wrap gesture activation; preserve preview/finalize cancellation and Move up/down path |
| `src/domains/workout/index.ts` | model/barrel | request-response | same file, `TodayView`/`StartWorkoutRequest` exports | exact file | consume Phase 13 provenance types; export only new narrow Phase 15 types |
| `src/domains/workout/activeWorkout.ts` | model/port | request-response | same file, `WorkoutSessionView`, command inputs/results | exact file | preserve status, metric identity, revisions, result unions, and repository contract |
| `src/domains/workout/workoutPreferences.ts` (conditional proposed) | model/service | CRUD | `createLibrarySectionPreferencePort` contract in `workoutAppRuntime.tsx` | role-match | define versioned default-rest/increment value plus expected revision after Phase 13 settles ownership |
| `src/platform/sqlite/repositories/workoutPreferenceRepository.ts` (conditional proposed) | store/repository | CRUD | `createLibrarySectionPreferencePort` over `app_settings` | role-match | use one serialized SQLite transaction and conditional revision update; no KV-store authority |
| `src/platform/sqlite/repositories/workoutRepository.ts` | repository | CRUD + event-driven | same file, complete/edit/reorder/Undo transactions | exact file | add only missing revision-checked exercise-rest persistence; preserve current active rest and proven transactions |
| `src/bootstrap/workoutAppRuntime.tsx` | provider/service | event-driven + request-response | same file, `runWorkoutMutation`, `runRestCommand`, outcome and Undo adapters | exact file | expose narrow active/read ports; preserve post-commit refresh/reconciliation; remove retired timing through the approved TIM-01 branch |
| `src/domains/history/metricHistory.ts` | utility/service | transform | same file, `buildExerciseMetricHistory` | exact file | add a pure six-session projection only if the current segments cannot directly supply Recent/Best/Change |
| `src/domains/plans/planImpactCommands.ts` | service/model | transform + request-response | same file, session write-back canonicalization/token/apply | exact file | extend preview with factual current/proposed rows and explicit units; keep token binding |
| `app/completion/[sessionId].tsx` | route/controller | request-response | same file, `WorkoutCompletionRoute` | exact file | keep durable detail first, retry summary separately, and default-No write-back routing |
| `src/ui/screens/WorkoutCompletionScreen.tsx` | component | request-response + event-driven | same file | exact file | recompose visuals and render source-provided change rows/no-difference state |
| `src/ui/__tests__/TodayScreen.test.tsx` + `app/(tabs)/__tests__/index.test.tsx` | test | request-response + event-driven | same files | exact | rewrite root label/order; add day-selection non-mutation, occurrence identity, Running context, retry/focus |
| `app/__tests__/workout-route.test.tsx` (proposed) | test | request-response | `app/__tests__/completion-route.test.tsx` | role-match | mock router/runtime boundary; prove retry, Back preservation, and exact narrow capabilities |
| `src/ui/__tests__/{WorkoutSessionPresentation,WorkoutSetFactsRow}.test.tsx` (proposed) | test | transform + event-driven | `SetRow.test.tsx` and `WorkoutCompletionScreen.test.tsx` read-only detail case | composite | prove semantics/layout with zero mutation props or calls |
| `src/ui/__tests__/WorkoutSetEditorSheet.test.tsx` (proposed) | test | event-driven + transform | `ActiveWorkoutMetricProfiles.test.tsx` | role-match | table-test all nine profiles, explicit Save, cancel/no-write, validation, steppers, IME/focus |
| `src/ui/__tests__/WorkoutActionDock.test.tsx` (proposed) | test | event-driven | `ActiveWorkoutScreen.test.tsx` commit/retry cases | role-match | prove mutual exclusion, duplicate suppression, identical retry envelope, no optimistic success |
| `src/ui/__tests__/{ActiveWorkoutScreen,RestDock,WorkoutCompletionScreen}.test.tsx` | test | event-driven | same files | exact | rewrite superseded presentation assertions while retaining transaction/recovery assertions |
| `src/domains/workout/{setCommands,sessionExerciseCommands,outcomes}.test.ts` + integration suites | test | CRUD + event-driven | same files | exact | retain full command-envelope, rollback, replay, pointer/rest, history, and outcome coverage |
| `src/domains/workout/workoutPreferences.test.ts` + `tests/sqlite-host/workout-preferences.test.ts` (conditional proposed) | test | CRUD | library preference runtime tests plus logical backup/restore/merge tests | role-match | invalid/read/write/stale/reload/backup/restore/merge/no-target-rewrite matrix |
| TIM-01 characterization across `src/domains/advancedTiming/*.test.ts`, `src/bootstrap/workoutAppRuntime.test.tsx`, and restore/merge tests | test | event-driven + file-I/O | same tests | exact retained behavior | snapshot every state/recovery entry, validate the approved record, and prove zero hidden cues before closure |
| `scripts/run-phase15-maestro.mjs`, `scripts/verify-phase15-evidence.mjs`, `scripts/phase15-evidence-scripts.test.mjs` (proposed) | test/tooling | batch + file-I/O | Phase 12 runner/verifier/self-test | role-match | exact HEAD/source/APK/installed-byte binding; one-to-one Phase 15 case registry; reject missing/skipped/stale evidence |
| `maestro/phase15/*.yaml` (proposed) | test | event-driven | Phase 9 workout flows and Phase 10 relaunch flow | role-match | new native flows with Phase 15 labels, failures, process death, accessibility, viewport/theme matrix, and TIM disposition |
| `src/bootstrap/phase15WorkoutBenchmark.ts`, `app/__phase15-benchmark.tsx`, `scripts/benchmark-phase15-workout.mjs` and tests (proposed or equivalent wrapper) | test/tooling | batch + event-driven | Phase 1 benchmark route/domain/runner | role-match | measure rendered dock transition and representative long session; retain 100 samples, p95 150ms, JS task 50ms |
| `package.json` | config | batch | same file scripts block | exact file | add Phase 15 commands only; install no package |

## Pattern Assignments

### Workout root: `app/(tabs)/index.tsx`, `src/ui/screens/TodayScreen.tsx`, `WorkoutDaySelector.tsx`, `WorkoutStartSheet.tsx`

**Primary analogs:** the current `TodayRoute`/`TodayScreen` state split and
`WorkoutStartSheet`. `PlanDaySwitcher` contributes only stable IDs and selected
accessibility state; its reorder behavior is an anti-pattern for this surface.

**Thin route and explicit navigation pattern** (`app/(tabs)/index.tsx:88-100`):

~~~tsx
onResumeWorkout={(sessionId, expectedRevision) => {
  if (expectedRevision === undefined) {
    router.push(`/workout/${sessionId}`);
    return;
  }
  void runtime.resumePartialWorkout({
    sessionId,
    expectedSessionRevision: expectedRevision,
    resumedAtMs: Date.now(),
  }).then(() => {
    router.push(`/workout/${sessionId}`);
  }).catch(() => undefined);
}}
~~~

Retain route ownership and async routing after the real command resolves. Change
the input from the current `(dayId, mode)` singleton seam to the exact completed
Phase 13 occurrence/start envelope. Never rediscover the current plan after the
user selects a preview.

**Truthful root branch pattern** (`src/ui/screens/TodayScreen.tsx:372-408`):

~~~tsx
let content: React.ReactNode;
if (launchState === "failed") {
  content = (
    <RootFailureState
      failure={failure ?? {
        category: "storage",
        code: "launch_firstTrustedQuery_failed",
        correlationCode: "GT-QUERY001",
        retryable: true,
      }}
      onRetry={onRetry}
    />
  );
} else if (!trusted || view === undefined) {
  content = <TodaySkeleton />;
} else {
  switch (view.state) {
    case "no_active_plan":
      content = (
        <ActivationContent
          onActivate={onActivatePlan}
          onPreview={() => setActivationPreview(true)}
          preview={activationPreview}
        />
      );
      break;
    case "scheduled":
      content = (
        <ScheduledContent
          onReviewSuggestion={onReviewSuggestion}
          pendingRecommendations={pendingRecommendations}
          onStart={(dayId, mode) => onStartPlanDay(dayId, mode)}
          onStartEmpty={onStartEmpty}
          planDays={planDays}
          view={view}
        />
      );
      break;
~~~

Preserve this discriminated-state structure. Replace the card-first `Today`
composition with the approved Workout order, but never render stale exercise
facts during loading/error.

**Start-alternatives focus pattern** (`src/ui/components/WorkoutStartSheet.tsx:43-55,98-119`):

~~~tsx
useEffect(() => {
  if (visible) {
    headingRef.current?.focus();
  }
}, [visible]);

function close() {
  onClose();
  restoreFocusRef?.current?.focus();
}

~~~

Use the Phase 14 sheet frame when available, keep content/action ownership here,
and change the generic dismissal label to exact `Return to Workout`.

**Selector seed, not a component to copy** (`src/ui/components/PlanDaySwitcher.tsx:48-89`):

~~~tsx
<FocusablePressable
  accessibilityLabel={label}
  accessibilityRole="button"
  accessibilityState={{ selected: selectedDayId === day.id }}
  focusable
  onPress={() => onSelectDay(day.id)}
  style={styles.select}
>
  <Text style={[
    typeScale.bodyStrong as TextStyle,
    { color: colors.contentCardText },
  ]}>
    {day.name}
  </Text>
  <Text style={[
    typeScale.secondary as TextStyle,
    { color: colors.contentCardTextSecondary },
  ]}>
    {`${count} ${count === 1 ? "exercise" : "exercises"}`}
  </Text>
</FocusablePressable>
~~~

Copy the stable `day.id` key and selected semantics. Do **not** copy
`PlanEditorReorderableRow`, `onMoveDay`, or drag preview into Workout. Preview
selection is local/read-only and must never advance rotation or mutate schedule.

### Active route/controller: `app/workout/[sessionId].tsx`, `ActiveWorkoutScreen.tsx`

**Route loading/fencing pattern** (`app/workout/[sessionId].tsx:69-95`):

~~~tsx
useEffect(() => {
  let active = true;
  setFailed(false);
  setView((current) => current?.id === resolvedSessionId ? current : null);
  void Promise.all([
    runtime.getActiveWorkout(resolvedSessionId),
    (runtime.getAdvancedTimingContext?.(resolvedSessionId)
      ?? Promise.resolve(null)).catch(() => null),
  ]).then(([nextView, nextAdvancedTimingContext]) => {
    if (active) {
      setView(nextView);
      setAdvancedTimingContext(nextAdvancedTimingContext);
    }
  }).catch(() => {
    if (active) {
      setFailed(true);
    }
  });
  return () => {
    active = false;
  };
}, [
  resolvedSessionId,
  runtime.getAdvancedTimingContext,
  runtime.getActiveWorkout,
  runtime.workoutRefreshGeneration,
]);
~~~

Keep the mounted-generation fence and authoritative reload. Add an in-place
`Retry opening workout data`; Back must call the non-mutating root/context path.
Do not keep `key={`${resolvedSessionId}:${focusGeneration}`}` if it remounts and
loses a sheet draft during focus changes.

**Capability inventory to split** (`app/workout/[sessionId].tsx:145-205`): the
route currently passes set, rest, edit, reorder, advanced timing, outcomes, and
navigation in one object. Preserve the real command functions but define narrow
capability groups (`setEditor`, `setCompletion`, `exerciseEditing`, `rest`,
`outcomes`, `preferences`, `trend`) so facts-only children cannot receive them.
Wire `runtime.undoCompletedSet`, which is exported at
`src/bootstrap/workoutAppRuntime.tsx:4362` but absent from this route today.

**Stable identity and authoritative view pattern**
(`src/ui/screens/ActiveWorkoutScreen.tsx:291-303,949-980`):

~~~tsx
function resolveSetOwner(
  view: ActiveWorkoutView,
  setId: string,
): Readonly<{ exercise: ActiveWorkoutExercise; set: ActiveWorkoutSet }> | undefined {
  for (const exercise of exercisesFor(view)) {
    const set = [...exercise.warmups, ...exercise.workingSets].find(
      (candidate) => candidate.id === setId,
    );
    if (set !== undefined) {
      return { exercise, set };
    }
  }
  return undefined;
}

const isExerciseCollapsed = (exercise: ActiveWorkoutExercise, index: number) =>
  exercise.id !== view.activeExerciseId
  && !expandedExerciseIds.has(exercise.id)
  && (exercise.status === "completed"
    || (activeExerciseIndex >= 0 && index < activeExerciseIndex));

~~~

Keep stable IDs, not array indexes, as disclosure/focus/current identity. Collapse
and reveal only from the returned authoritative view after a committed result.

### Facts-only presentation: `WorkoutSessionPresentation.tsx`, `WorkoutSetFactsRow.tsx`

**Facts model analog** (`src/domains/workout/sessionDetail.ts:14-39,103-134`):

~~~typescript
export type SessionSetDetail = Readonly<{
  id: string;
  kind: "warmup" | "working";
  ordinal: number;
  status: "planned" | "draft" | "completed" | "skipped";
  metricIdentity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation | null;
  value: string;
}>;

~~~

Create one immutable Phase 15 presentation model/adapters for
`WorkoutSessionView` now and `SessionDetail`/planned occurrence in Phase 16.
The presenter may own disclosure state or receive a disclosure controller, but
must have no runtime import, command object, set-edit callback, rest effect,
reorder, correction, removal, resume, or write-back callback.

**Formatting to retain** (`src/ui/components/SetRow.tsx:40-69,72-158`): retain
`formatLoadGrams`, `formatObservation`, and `observationForSet` in a neutral
formatting/model module so both active and read-only presenters use the same
nine-profile truth. Do not duplicate switches in the new rows.

**Disclosure semantics to copy**
(`src/ui/screens/ActiveWorkoutScreen.tsx:2188-2251`):

~~~tsx
<FocusablePressable
  accessibilityLabel={collapseLabel}
  accessibilityRole="button"
  accessibilityState={{ expanded: !collapsed }}
  onPress={() => {
    setExpandedExerciseIds((current) => {
      const next = new Set(current);
      if (collapsed) {
        next.add(exercise.id);
      } else {
        next.delete(exercise.id);
      }
      return next;
    });
  }}
>
~~~

Recompose its visual order as grip / identity+metadata / trend / menu for Active.
For read-only use, omit grip/trend/menu rather than hiding enabled handlers.

**Read-only anti-pattern** (`src/ui/screens/SessionDetailScreen.tsx:109-125,376-430`):
`SessionDetailScreen` accepts `onCorrectWorkout`, `onRemoveFromHistory`,
`onOpenExerciseHistory`, and `onResume`, then conditionally renders mutation
actions. Do not add a `readOnly` boolean to `ActiveWorkoutScreen` or reuse this
callback-bearing screen as the Phase 16 boundary. Type-level absence of mutation
props is the contract.

### Explicit editor: `WorkoutSetEditorSheet.tsx`

**Metric conversion pattern** (`src/ui/components/SetRow.tsx:542-679`): copy the
complete discriminated switch for `load_reps`, `bodyweight_reps`,
`added_load_reps`, `assisted_reps`, `timed_hold` v1/v2, `fixed_distance`,
`fixed_time`, `intervals`, and `unscored`. Preserve fixed target context and
canonical grams/milliseconds conversions.

~~~typescript
if (set.target.profile === "fixed_distance") {
  const durationSeconds = Number(durationOverride ?? durationValue);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    setValidationMessage("Enter a valid duration.");
    return null;
  }
  return {
    version: 1,
    profile: "fixed_distance",
    distanceMeters: set.target.plannedDistanceMeters,
    durationMs: Math.round(durationSeconds * 1_000),
    source: "manual",
  };
}
~~~

**Field ownership pattern** (`src/ui/components/SemanticNumberField.tsx:81-110`):

~~~typescript
/**
 * Presentation-only numeric editing. Callers retain their canonical draft
 * strings and own all unit conversion and domain-level validation.
 */
export function SemanticNumberField({
  error,
  help,
  kind,
  label,
  maximum,
  minimum,
  onBlur,
  onChangeText,
  precision,
  style,
  tone = "default",
  value,
  ...inputProps
}: SemanticNumberFieldProps) {
  const [touched, setTouched] = React.useState(false);
  const semanticError = touched
    ? validationMessage({ kind, maximum, minimum, precision, value })
    : undefined;
}
~~~

`TimeDurationField` likewise documents presentation-only ownership at
`src/ui/components/TimeDurationField.tsx:98-110` and restores trigger focus at
lines `125-136`. Use it for time-style fields, but put the required timed-hold
`−5`/`+5` steppers in the new editor rather than changing every duration-field
consumer.

**Do not copy:** `SetRow.persistInlineValues` and its blur/change hooks at
`src/ui/components/SetRow.tsx:681-727,1103-1151`. They persist during blur and
duration change. The new sheet must initialize a local draft, mutate only that
draft, validate on explicit Save, and discard on close/scrim/Escape/Back.

### Command dock and commit-gated transitions: `WorkoutActionDock.tsx`

**Command-envelope pattern**
(`src/ui/screens/ActiveWorkoutScreen.tsx:1418-1473`):

~~~tsx
if (
  requestedSetId === undefined
  || workingBusySetId !== null
) {
  return;
}
setWorkingBusySetId(requestedSetId);
setSaveFailedSetId(null);
try {
  await draftQueue.current;
  const currentView = viewRef.current;
  const owner = resolveSetOwner(currentView, requestedSetId);
  const currentSet = owner?.set;
  if (
    currentSet === undefined
    || currentSet.kind !== "working"
    || currentView.activeSetId !== currentSet.id
  ) {
    return;
  }
  const completedAtMs = nowMs();
  const result = await commands.completeSet({
    sessionId,
    setId: currentSet.id,
    expectedSessionRevision: currentView.revision,
    expectedSetRevision: currentSet.revision,
    completionIdempotencyKey: idempotencyKey(
      sessionId, currentSet.id, currentSet.revision,
    ),
    metricIdentity: currentSet.metricIdentity,
    observation: observationForSet(currentSet),
    completedAtMs,
  });
  applyView(result.view);
  if (
    result.outcome === "committed"
    && result.view.activeSetId !== null
    && result.view.activeSetId !== currentView.activeSetId
  ) {
    setExpandedCompactSetId(null);
    setPendingScrollTarget({
      key: `advance-${result.view.revision}-${result.view.activeSetId}`,
      setId: result.view.activeSetId,
      animated: !reduceMotion,
    });
  }
} catch {
  setSaveFailedSetId(requestedSetId);
} finally {
  setWorkingBusySetId(null);
}
~~~

The controller owns this state machine. `WorkoutActionDock` is render-only and
receives `ready | saving | failed | finished`, Add, Complete, and Retry intents.
The failed Retry must reuse the same bounded envelope, not generate a different
payload.

**Post-commit effects pattern** (`src/domains/workout/setCommands.ts:214-232`):

~~~typescript
const result = await input.repository.completeSet(input.input);
if (result.outcome === "committed") {
  await input.invalidate().catch(() => undefined);
  await input.haptics.committed().catch(() => undefined);
  await input.drainEffects().catch(() => undefined);
}
return result;
~~~

Repository `completeSet` keeps idempotent replay distinct at
`src/platform/sqlite/repositories/workoutRepository.ts:3183-3207` and commits
set, exercise, pointer, rest, Undo snapshot, and reconciliation effect in one
`kernel.write` at lines `3172-3375`. Never synthesize green/check/progress/rest
from local state.

### Rest dock: `src/ui/components/RestDock.tsx`

**Durable time projection pattern** (`src/ui/components/RestDock.tsx:260-293`):

~~~tsx
useEffect(() => {
  setDisplayNowMs(nowMs());
  if (state.state === "paused") {
    return;
  }
  const interval = setInterval(() => {
    setDisplayNowMs(nowMs());
  }, 1_000);
  return () => clearInterval(interval);
}, [nowMs, state]);

const remainingMs = remainingRestMs(state, displayNowMs);
const remainingSeconds = Math.ceil(remainingMs / 1_000);
const announcement = useMemo(
  () => thresholdMessage(remainingMs),
  [remainingMs],
);
~~~

Keep the tick local to `RestDock`. `remainingRestMs` derives running time from
`endsAtMs - nowMs` and paused time from persisted `remainingMs`
(`src/domains/rest/restState.ts:48-57`). Rest command inputs remain revision
checked and `AdjustRestInput.deltaMs` remains exactly `-15_000 | 15_000`
(`src/domains/rest/restCommands.ts:17-26`).

**Dock placement pattern** (`src/ui/layout/AdaptiveScreen.tsx:197-233`):

~~~tsx
<ScrollView
  contentContainerStyle={[
    styles.scrollContent,
    dock !== undefined && styles.scrollContentWithDock,
  ]}
  keyboardShouldPersistTaps="handled"
  onScroll={onScroll}
  refreshControl={onRefresh === undefined ? undefined : (
    <RefreshControl
      onRefresh={onRefresh}
      refreshing={refreshing}
      tintColor={colors.action}
    />
  )}
  ref={scrollViewRef}
  scrollEventThrottle={16}
  testID={`${testID}-scroll`}
>
  {content}
</ScrollView>
{dock === undefined ? null : (
  <View
    style={[
      styles.stickyDock,
      {
        backgroundColor: colors.canvas,
        paddingHorizontal: horizontalInset,
      },
      constrainActiveWork && styles.stickyDockConstrained,
    ]}
    testID="adaptive-dock"
  >
    {dock}
  </View>
)}
~~~

Retain `AdaptiveScreen` as the sole vertical owner and its measured dock
clearance. Render exactly one mutually exclusive dock: compact action row, full
rest dock, or Finish.

**Rest controls to rewrite** (`src/ui/components/RestDock.tsx:332-455`): keep
clock, meaningful threshold announcements, cue-failure containment, permission
guidance, and button primitives. Delete `expanded`, the expand/collapse button,
and dock-owned `undo`. Always render controls in `−15`, Pause/Resume, `+15`,
Skip order, with labels including “from rest”/“to rest”. Add exercise name to
next-set context.

The OS side remains a disposable projection: `createRestNotificationReconciler`
uses stable `rest:${sessionId}` identity and compares persisted rest revision and
deadline before scheduling (`src/platform/notifications/restNotificationReconciler.ts:92-194`).

### Exercise actions and reorder

**Immutable command envelope pattern**
(`src/ui/screens/ActiveWorkoutScreen.tsx:1738-1818`):

~~~typescript
const identity = {
  operation,
  sessionId,
  sessionExerciseId: exercise.id,
  expectedSessionRevision: currentView.revision,
  expectedSessionExerciseRevision: exercise.revision,
  occurredAtMs,
  ...(candidate.action === "replace"
    ? { libraryExerciseId: replacementExerciseId }
    : {}),
};
const requestSha256 = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  stableJson(identity),
);
const requestId = `${operation}:${requestSha256}`;
~~~

Keep bounded IDs/hash/revisions and the committed-refresh-failed distinction.
`sessionExerciseCommands.ts:93-129` validates exact reorder membership and
lines `131-173` fail closed when repository capabilities are absent.

**History-preserving repository pattern**
(`src/platform/sqlite/repositories/workoutRepository.ts:1645-1740`): derive
`protectedHistory`; return `skipped_history_preserved` or
`deleted_provisional`; repair active/rest pointers; delete only provisional
rows; store an immutable receipt in the same transaction. The label changes to
Delete, but the domain operation remains `removeExercise`.

**Reorder pattern**
(`src/ui/components/PlanEditorFields.tsx:225-316`): preview motion is local,
`onEnd(success)` alone requests the move, and `onFinalize` clears preview. Keep
`accessibilityActions` and the same `requestMove` callback at lines `342-399`.
The current `.activateAfterLongPress(550)` at lines `277-280` does not satisfy
the Phase 15 8dp movement contract: make activation configurable or create a
Workout wrapper without changing plan-editor behavior.

**Menu/picker source:** preserve keyboard-safe search, single selection, exact
confirmation, and failure retry from
`src/ui/screens/ActiveWorkoutScreen.tsx:2884-3057`. Replace the current overflow
at lines `2824-2883` with exactly `Timing`, `Replace exercise`, and
`Delete exercise`; Trend is a separate target. Delete uses two activations in
the menu before calling the same protected-history command.

### Workout settings persistence: `WorkoutPlanSettingsSheet.tsx` and conditional preference port

**Saved/draft UI state analog**
(`src/ui/components/RestAlertSettingsSheet.tsx:74-169`):

~~~tsx
const latestPreferencesRef = useRef(preferences);
const pendingWritesRef = useRef(0);
const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
const [optimisticPreferences, setOptimisticPreferences] = useState(preferences);
const [saveFailed, setSaveFailed] = useState(false);

writeQueueRef.current = writeQueueRef.current.then(write, write)
  .catch(() => undefined);
~~~

Copy the separation of external/saved value, local selection, pending writes,
and rollback/retry. Adapt the visible states to the UI-SPEC’s explicit saved
and draft values; do not present an optimistic value as saved.

**Authoritative SQLite preference analog**
(`src/bootstrap/workoutAppRuntime.tsx:1671-1740`):

~~~typescript
export type LibrarySectionPreferencePort = Readonly<{
  read(): Promise<LibraryRuntimeSectionPreference>;
  write(section: LibraryRuntimeSection, expectedRevision: number):
    Promise<LibraryRuntimeSectionPreference>;
}>;
~~~

The conditional update itself is the exact pattern at
`src/bootstrap/workoutAppRuntime.tsx:1723-1738`:

~~~typescript
const result = await transaction.execute(
  `UPDATE app_settings
   SET value_json = ?, revision = ?, updated_at_ms = ?
   WHERE key = ? AND revision = ?`,
  [
    JSON.stringify({ section }),
    next.revision,
    nowMs(),
    LIBRARY_SECTION_SETTING_KEY,
    expectedRevision,
  ],
);
if (result.changes !== 1) {
  throw new Error("library_section_preference_conflict");
}
~~~

Prefer main-database `app_settings` (schema at
`src/platform/sqlite/migrations/0001_initial.ts:326-332`) because it already
participates in logical backup/restore/merge. Do not copy the silent catch/fallback
behavior from `restAlertPreferenceStore.ts:76-104`, and do not store weight
increment by rewriting `MetricTarget.incrementGrams`.

Keep exercise-specific `Between-set rest` on the session-exercise command path:
extend `ActiveWorkoutRepository` and `workoutRepository.ts` with expected session
and exercise revisions, update only the selected exercise's
`default_rest_seconds`, and return/reload the authoritative view. That command
must not rewrite `session_rest_states`; an already-running or paused rest keeps
its persisted deadline/remainder.

The exact global-versus-plan ownership is unresolved in research. Bind the new
port to Phase 13’s completed model. If that decision requires schema rather than
`app_settings`, use the actual next migration number and the additive/verify
pattern; do not preselect a migration number in the plan.

### Trend: `src/domains/history/metricHistory.ts`, `ExerciseTrendSheet.tsx`

**Comparable-facts pattern** (`src/domains/history/metricHistory.ts:106-178`):

~~~typescript
function segmentFor(group: ComparableGroup): MetricHistorySegment {
  const ordered = [...group.entries].sort((left, right) =>
    visitOrder(left.set, right.set)
  );
  const candidates = ordered.map(({ candidate }) => candidate);
  const lastCandidate = selectLastMetricCandidate(candidates);
  const referenceTarget = lastCandidate === null
    ? group.reference.set.target
    : ordered.find(({ candidate }) => candidate === lastCandidate)!.set.target;
  const bestCandidate = selectBestMetricCandidate({
    identity: group.reference.set.identity,
    target: referenceTarget,
    candidates,
  });
  const setForCandidate = (candidate: MetricCandidate | null) => candidate === null
    ? null
    : ordered.find(({ candidate: current }) => current === candidate)!.set;
  return Object.freeze({
    identity: group.reference.set.identity,
    referenceTarget,
    comparableSets: Object.freeze(ordered.map(({ set }) => set)),
    best: setForCandidate(bestCandidate),
    average: aggregateMetricObservations(
      group.reference.set.identity,
      ordered.map(({ candidate }) => candidate.observation),
    ),
    last: setForCandidate(lastCandidate),
  });
}
~~~

Keep `buildExerciseMetricHistory` as authority and derive at most six reverse-
chronological comparable sessions. `ExerciseHistoryScreen.tsx:256-289` is the
closest factual list/summary analog. `ProgressTrend.tsx:125-165` is the closest
accessible visual-plus-data-table analog. Replace Average/Last presentation
with required Recent/Best/Change; never compare across segments or fabricate a
point when no compatible evidence exists.

### Completion and plan write-back: route, screen, and domain preview

**Durable detail before derived preview**
(`app/completion/[sessionId].tsx:49-68`):

~~~tsx
const nextDetail = await runtime.getSessionDetail(resolvedSessionId);
setDetail(nextDetail);
if (nextDetail.status === "completed") {
  setPlanWriteBack(await runtime.previewCompletedWorkoutPlanWriteBack(
    resolvedSessionId,
  ));
} else {
  setPlanWriteBack({ state: "completed", disposition: "not_eligible" });
}
~~~

Keep summary failure separate from the already-saved outcome. Route navigation
only follows the returned authoritative outcome.

**Default-No pattern** (`src/ui/screens/WorkoutCompletionScreen.tsx:318-379`):
safe dismissal calls `onKeepPlanAsIs`; `Keep plan as-is` is the primary/focused
action; `Save changes to plan` is secondary and disabled while applying. Preserve
this order for failure and foreground re-entry.

**Domain preview/token pattern**
(`src/domains/plans/planImpactCommands.ts:685-723,725-805`): build a canonical
composition from source facts, return `null` for no difference, hash the source
revision/plan/day/composition, and re-read/re-canonicalize before apply. Extend
`SessionExerciseEditsForPlanPreview` at lines `134-146` with source-produced
display rows containing exercise identity, current target, proposed target,
metric identity/unit. Do not compare formatted UI strings.

**Outcome validation pattern** (`src/domains/workout/finishWorkout.ts:193-251`):
validate revisions/timestamps and exact confirmation tokens before repository
delegation. Preserve `PARTIAL_CONFIRMATION`, `ZERO_SET_CONFIRMATION`, and
`DISCARD_CONFIRMATION`; “Finish workout later” is navigation from an unchanged
durable in-progress session, not a completion mutation.

### TIM-01 cadence/cluster retirement and retained facts

**Stored format to preserve**
(`src/domains/advancedTiming/advancedTimingConfig.ts:8-28`):

~~~typescript
export type AdvancedTimingConfigV1 =
  | Readonly<{ version: 1; mode: "off" }>
  | Readonly<{ version: 1; mode: "per_rep"; intervalMs: number;
      cueChannels: AdvancedTimingCueChannels }>
  | Readonly<{ version: 1; mode: "cluster"; groupSizes: readonly number[];
      intraRestMs: number; cueChannels: AdvancedTimingCueChannels }>;

export const OFF_ADVANCED_TIMING_CONFIG =
  Object.freeze({ version: 1, mode: "off" });
~~~

Migration 21 stores defaults, nullable overrides, immutable resolved snapshots,
and `session_advanced_timing_states`
(`src/platform/sqlite/migrations/0021_advanced_set_timing.ts:77-150`). Migration
27 enforces target-set ownership with insert/update triggers
(`0027_advanced_timing_target_ownership.ts:4-47`). These are retain-only
patterns: do not drop columns/tables/triggers, rewrite old JSON, or coerce old
facts to `off`.

**Approved TIM-01 runtime cut points:**

- route loading/wiring: `app/workout/[sessionId].tsx:51-95,145-188`;
- public runtime capabilities: `workoutAppRuntime.tsx:919-956`;
- launch/foreground subscription: `workoutAppRuntime.tsx:2353-2380`;
- context enumeration/reconciliation/cues: `workoutAppRuntime.tsx:3192-3375`;
- returned runtime surface: `workoutAppRuntime.tsx:4238-4248,4286-4288,4313-4314,4347-4359`;
- UI imports/props/rendering: `ActiveWorkoutScreen.tsx:31-38,89-96,149-180,875-906,2558-2634,3072-3094`.

Before this cut, preserve current characterization proving foreground and
cluster-gap behavior (`src/bootstrap/workoutAppRuntime.test.tsx:1849-2027`),
timestamp reconciliation (`src/domains/advancedTiming/advancedTimingState.test.ts:218-291`),
and byte-for-byte restore of a persisted per-rep snapshot
(`tests/sqlite-host/logicalRestoreRepository.test.ts:240-289`). Add queued
callback, relaunch, automatic replacement, merge, and independent rest-cue cases.

TIM-01 approval is present. If zero-playback isolation cannot be proved, block
cutover and fix the defect; do not retain a compatibility mode or reopen the
decision. Hiding `AdvancedTimingIndicator`/`AdvancedTimingConfigSheet` alone is
not a safe retirement.

## Test Pattern Assignments

| Target Test | Copy Structure From | Preserve | Replace / Add |
|---|---|---|---|
| `src/ui/__tests__/TodayScreen.test.tsx` | same file `:90-198,272-429` | trusted loading without stale facts, discriminated states, exact start modes, Resume revision, typed retry | Workout heading/order, five-day roving selection with no mutation, full preview, Running context, exact failure copy |
| `app/(tabs)/__tests__/index.test.tsx` | same file `:70-160,198-312` | route mocks and post-command navigation assertions | exact Phase 13 occurrence envelope; selected preview makes zero schedule writes |
| `app/__tests__/workout-route.test.tsx` (new) | `app/__tests__/completion-route.test.tsx:24-57,100-133` | mock runtime/router boundary, render route, assert exact calls | failed read Retry in place, Back context, no mutation on unmount, Undo/trend/settings ports, TIM-01 capability branch |
| `src/ui/__tests__/WorkoutSessionPresentation.test.tsx` + `src/ui/__tests__/WorkoutSetFactsRow.test.tsx` (new) | `ActiveWorkoutScreen.test.tsx:441-647` and `SetRow.test.tsx:187-208` | stable-ID disclosure, measured reveal, reduced motion, all exercises in one owner | W1/W2 and 01/02 domains, four columns, one exercise edge, row state text/icons, no command props |
| `src/ui/__tests__/WorkoutSetEditorSheet.test.tsx` (new) | `ActiveWorkoutMetricProfiles.test.tsx:510-731` | all nine identities/targets/units and retry-stable values | row opens sheet; direct entry/steppers alter local draft only; Save/cancel/IME/focus; exact validation and Save labels |
| `src/ui/__tests__/WorkoutActionDock.test.tsx` (new) | `ActiveWorkoutScreen.test.tsx:1580-1674` | pending means disabled/no completion; identical retry envelope; keyboard/semantic activation | compact Add + Complete order, warm-up label, Finish replacement, no Rest overlap |
| `src/ui/__tests__/RestDock.test.tsx` | same file `:108-230` | timestamp clock, no tick live region, exact ±15 payloads, pause/resume/skip callbacks | controls always visible and ordered −15/Pause-or-Resume/+15/Skip; exercise next context; no collapse or Undo |
| `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` | same file `:441-727,1580-1674,2307-2639` | stable IDs, one scroll, authoritative reveal, command envelopes, rest routing | delete superseded inline-save, collapsed-rest, advanced authoring assertions; add exact menu/dock/edge/editor/toast/failure states |
| `src/domains/workout/setCommands.test.ts` + `tests/integration/complete-set.test.ts` | same files, especially integration `:638-900` | held commit, duplicate replay, derivative failure, rollback, Undo deadline | add editor-save-before-complete and final-exercise collapse assertions without weakening transaction tests |
| `src/domains/workout/sessionExerciseCommands.test.ts` + `tests/integration/session-exercise-editing.test.ts` | same files, integration `:232-406,724-818` | exact membership/revision/hash/receipt, immutable ordinal, history-preserved disposition, rollback | add two-step UI gate, 8dp/cancel-no-command, current pointer/focus preservation |
| `src/domains/history/metricHistory.test.ts` + `src/ui/__tests__/ExerciseTrendSheet.test.tsx` (new) | metric test `:58-178`, `ExerciseHistoryScreen` tests | completed working-only eligibility, target-significant segments, separate warm-ups | six-session cap, Recent/Best/Change, accessible chart description/table, empty incompatible state |
| `src/ui/__tests__/WorkoutCompletionScreen.test.tsx` + `app/__tests__/completion-route.test.tsx` | same files `:182-269,396-483` and route `:100-133` | saved outcome survives summary failure; partial truth; default-No; read-only detail | factual all-profile change rows, units, long/stacked preview, no-difference single action, retry focus |
| preference unit/SQLite/integration tests (new) | library preference port behavior and `logical{Backup,Restore,Merge}Repository.test.ts` | expected revision, bound SQL, `app_settings` portability | default-rest/increment invalid/stale/retry/reload, plan/global ownership, no current target/result/history mutation |
| TIM-01 characterization | advanced timing state/repository/runtime and restore/merge tests | all stored states and source bytes | zero hidden cues across foreground, queued callback, relaunch, restore, replacement, merge; supported rest remains intact |

**Commit-integrity exemplar** (`tests/integration/complete-set.test.ts:638-702`):
hold the transaction before commit and assert no haptic, invalidation, effect
drain, or completed row until release. The duplicate case at lines `704-765`
expects exactly one `committed`, one `already_completed`, one effect, and one
Undo snapshot. The rollback case at lines `817-898` expects unchanged pointer,
revision, set status, effects, and rest.

**History-preservation exemplar**
(`tests/integration/session-exercise-editing.test.ts:724-785`): complete a set,
replace/remove the exercise, assert `skipped_history_preserved`, compare the
protected rows/snapshot, and prove Undo still returns `undone`.

## Native Evidence and Performance Patterns

### Runner/verifier

Copy the Phase 12 exact-identity mechanics, not its backup-specific stages.

`scripts/run-phase12-maestro.mjs:25-55`:

~~~javascript
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const head = command("git", ["rev-parse", "HEAD"]);
const source = command("node", [
  "scripts/source-tree-digest.mjs", "--assert-no-untracked",
]);
validatePhase12Manifest(manifest, head, source);
if (!existsSync(apk) || sha256(readFileSync(apk)) !== manifest.apk.sha256) {
  throw new Error("APK bytes are stale");
}
~~~

`scripts/verify-phase12-evidence.mjs:40-98` additionally proves build manifest,
base HEAD, source digest, package, retained APK, installed APK, exact case count,
zero failed/skipped cases, and report hashes. Preserve its recursive no-secret/
personal-data scan; Phase 15 evidence must contain codes, counts, hashes, case
IDs, and scoped opaque IDs only—not workout rows, set values, notes, or filenames.

The new Phase 15 registry should map one-to-one to WRK-01..36 plus explicit
cross-cutting cases for Light/Dark/System, seven viewports/orientations, 100% and
200% text, touch/keyboard/D-pad, standard/reduced motion, process death/offline,
notification denial, failure/retry, long lists, and the accepted TIM-01 branch.
Historical Phase 8-10 reports are regression inputs, never Phase 15 proof.

### Native flow

Use `maestro/phase9/in-workout-exercise-editing.yaml:1-230` for real add,
reorder, replace failure/retry, protected-history delete, and relaunch sequence.
Use `maestro/phase10/advanced-set-timing.yaml:147-171` only as the pre-TIM-01
relaunch characterization. Rewrite visible labels and flows to Phase 15; do not
retain old `WORKOUT OVERVIEW`, collapsible rest, or visible cadence UI as the
new expected result.

### Performance

Retain the Phase 1 gates in `scripts/benchmark-phase1.mjs:23-30`:
`samples = 100`, `maxP95Ms = 150`, `maxJsTaskMs = 50`. Copy its source/APK/
installed-byte binding and report percentiles at lines `489-590`.

The current domain harness records the first invalidation callback as the dock
transition (`src/bootstrap/phase1Benchmark.ts:148-194`). Phase 15 must measure
the actual rendered compact-dock → rest-dock transition and representative
long-session rendering. Do not report a domain callback as native rendered-frame
latency.

## Shared Patterns

### Imports and ownership

- Group external React/Expo/React Native imports first, then domain/runtime
  types, shared components/layout, and theme. Use `import type` for types.
- Routes own `expo-router`; screens/components receive callbacks and never import
  navigation.
- Facts components render immutable models. The active controller owns drafts,
  command latches, retries, focus identity, and authoritative view replacement.
- Domain functions validate and delegate. Repositories own bound SQL,
  transactions, receipt replay, and conditional revision updates.

### Validation and error handling

- Reuse strict metric parsing from `setCommands.ts:66-118`; do not trust UI-only
  validation.
- Preserve error classes/codes (`WorkoutCommandConflictError`,
  `RestCommandError`, `PlanImpactInputError`) across runtime boundaries; present
  bounded product copy, never raw SQLite/error messages.
- Distinguish “not committed” from “committed, refresh failed.” The latter must
  not reissue a non-idempotent mutation; instruct a source reload.
- Every mutation disables duplicate activation while pending. Same request ID
  with different payload/hash is a conflict; exact replay returns its recorded
  outcome.

### Accessibility, focus, and motion

- Use `FocusablePressable` (`src/ui/components/index.ts:215-264`) so touch,
  Enter, Space, and semantic activation share one handler and visible focus.
- Use Phase 14 sheet/dialog primitives; heading-first focus for ordinary sheets,
  safe-action-first for consequence/default-No dialogs, every dismissal path
  restores the exact trigger.
- Keep 48dp targets, semantic role/state, visible text plus icon/shape, no
  color-only state, no per-second screen-reader announcements, and Move up/down
  alternatives.
- Reduced motion removes travel/spring/scale; authoritative set/dock changes are
  immediate and measured reveal becomes non-animated.

### Source authority

- SQLite is source truth; local component state may hold only drafts,
  disclosure, picker selection, animation/measurement, and timer display.
- `runRestCommand` performs the durable command before post-commit reconciliation
  (`workoutAppRuntime.tsx:3133-3189`). `completeSet` performs derivatives only
  for `committed` (`setCommands.ts:214-232`). Keep those orderings.
- Rest notifications are disposable and replayable. Trend and completion
  summaries are projections; their failure must not weaken saved workout facts.
- Diagnostics/evidence stay aggregate-only and privacy-safe.

## Anti-Patterns and Explicit Non-Copies

| Existing Pattern | Location | Why It Must Not Be Copied |
|---|---|---|
| Singleton `startPlanDay(dayId, mode)` that rediscovers the active plan | `workoutAppRuntime.tsx:950-953` and current route `:112-132` | can combine a selected day with the wrong plan/schedule after Phase 13 |
| Plan-editor reorder semantics in Workout preview | `PlanDaySwitcher.tsx:27-93` | preview selection must not mutate schedule/order |
| One giant mutation-capable Active component reused via `readOnly` | `ActiveWorkoutScreen.tsx:119-192,477-555`; `SessionDetailScreen.tsx:109-125` | hidden handlers/accessibility actions can leak authority into Calendar detail |
| Inline persistence on duration change or numeric blur | `SetRow.tsx:681-727,1103-1151` | violates explicit Save and cancel-without-write |
| Complete/Reset/Remove embedded in every row | `SetRow.tsx:1183-1234` | Phase 15 has one dock-owned completion and row-tap editing |
| Collapsible rest and embedded Undo | `RestDock.tsx:201,371-441` | rest must replace the compact dock with four always-visible controls; Undo is a top toast |
| Visible `AdvancedTimingIndicator`/`AdvancedTimingConfigSheet` | `ActiveWorkoutScreen.tsx:2558-2634,3072-3094` | cadence/cluster authoring is prohibited even before runtime retirement is decided |
| UI-only timing retirement | runtime cut points listed above | hidden foreground/queued callbacks can emit invisible cues |
| Optimistic pointer/color/rest/toast/haptic before commit | any new controller code | violates the exclusive-transaction acknowledgement contract |
| Rewriting `MetricTarget.incrementGrams` as a preference | `src/domains/metrics/contracts.ts` target types | corrupts versioned target facts/history semantics |
| Hard-delete after label rename to Delete | exercise menu | repository must retain completed history and report its disposition |
| Formatted-string comparison for plan changes/trend | completion/trend UI | compatible facts and canonical target structures belong in domain projections |
| Route-local Modal/theme/toast clones | current screen-local sheets | Phase 14 owns shared overlay, focus, appearance, and dock-safe toast behavior |
| Fixtures/local cache/timer/animation as source truth | any UI or evidence code | must reload authoritative SQLite state after unknown/failed outcomes |

## No Exact Analog Found

| File / Capability | Role | Data Flow | Closest Partial Pattern | Planner Direction |
|---|---|---|---|---|
| `WorkoutDaySelector.tsx` | component | event-driven | selected state from `PlanDaySwitcher` | implement separate roving-focus, five-item, read-only preview selector; no reorder props |
| `WorkoutSessionPresentation.tsx` | component | transform + event-driven | Active disclosure plus `SessionDetail` model | create a command-free interface and prove structural zero-capability reuse |
| Phase 15 preference ownership | model/store | CRUD | main `app_settings` library preference port | resolve global-versus-plan scope from completed Phase 13; checkpoint if behavior differs from approved Plan settings |
| `ExerciseTrendSheet.tsx` chart | component | transform | metric-history segments plus `ProgressTrend` visual/table | create a six-session accessible SVG chart with written description; no new chart dependency |
| `scripts/run-phase15-maestro.mjs` and verifier | test/tooling | batch | Phase 12 evidence harness | create Phase 15 case registry and exact-identity validation; no current Phase 15 artifact can be reused |
| `app/__tests__/workout-route.test.tsx` | test | request-response | completion route test | add a new route-level capability and failure/retry contract |

## Metadata

**Analog search scope:** `app/`, `src/domains/workout/`,
`src/domains/rest/`, `src/domains/history/`, `src/domains/plans/`,
`src/bootstrap/`, `src/platform/sqlite/`, `src/platform/notifications/`,
`src/ui/`, `tests/`, `scripts/`, `maestro/`, Phase 13/14 pattern maps, and the
project engineering QA source.

**Primary analog set:** `app/(tabs)/index.tsx`,
`app/workout/[sessionId].tsx`, `src/ui/screens/TodayScreen.tsx`,
`src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/components/SetRow.tsx`,
`src/ui/components/RestDock.tsx`, `src/ui/layout/AdaptiveScreen.tsx`,
`src/domains/workout/{activeWorkout,setCommands,sessionExerciseCommands,finishWorkout}.ts`,
`src/platform/sqlite/repositories/workoutRepository.ts`,
`src/bootstrap/workoutAppRuntime.tsx`, `src/domains/history/metricHistory.ts`,
`src/domains/plans/planImpactCommands.ts`, and current tests/evidence harnesses.

**Files scanned:** 632 repository files; analog search stopped after the strong
role/data-flow matches above.

**Pattern extraction date:** 2026-10-06

**Unavailable configured input names:** `.trae/rules/rules.md` names two
non-prefixed Markdown paths that do not exist. Their live counterparts are
`bytedance-pre-git-design-20260815-132500.md` and
`bytedance-pre-git-eng-review-test-plan-20260815-224500.md`; the latter and
targeted workout sections of the former were used with the checked-in Phase 15
contracts.
