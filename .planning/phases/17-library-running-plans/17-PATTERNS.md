# Phase 17: Library & Running Plans - Pattern Map

**Mapped:** 2026-10-06  
**Files analyzed:** 56 planned/new/modified source and validation targets  
**Analogs found:** 56 / 56 at the file-role/data-flow level (32 exact/self analogs; 24 role-match analogs); no live exact analog for the Phase 13 Running domain semantics  
**Baseline caveat:** this workspace contains no `src/domains/running/`, no `runningPlanRepository.ts`, and no Phase 14 implementation yet. Bind to the final Phase 13/14 symbols when they land; do not turn the analogs below into a parallel Running store or a Library-private design system.

## File Classification

### Production targets

| New/Modified File | Role | Data Flow | Closest Live Analog | Match Quality |
|---|---|---|---|---|
| `app/(tabs)/library.tsx` | route | request-response / focus event | itself, `LibraryRoute` | exact, modify in place |
| `src/ui/screens/LibraryScreen.tsx` | component | request-response / event-driven | itself, `LibraryScreen` | exact, modify in place |
| `app/library/plan/create.tsx` | route | request-response | `app/library/exercise/create.tsx` | exact role; replace current Strength destination |
| `src/ui/screens/PlanTypeChooserScreen.tsx` | component | event-driven navigation | `ExerciseEditorScreen.Option` plus `StarterPlanDetailScreen` | role-match |
| `app/library/plan/create-strength.tsx` | route | request-response | current `app/library/plan/create.tsx` | exact behavior moved to new route |
| `app/library/plan/[planId]/index.tsx` | route | request-response | `app/library/starter/[templateId].tsx` | exact role |
| `src/ui/screens/OwnedPlanDetailScreen.tsx` | component | request-response / lifecycle commands | `src/ui/screens/StarterPlanDetailScreen.tsx` plus lifecycle actions in `OwnedPlanEditorScreen` | role-match |
| `app/library/plan/[planId]/edit.tsx` | route | request-response | itself | exact, preserve deep link |
| `src/ui/screens/OwnedPlanEditorScreen.tsx` | component | aggregate CRUD / transform | itself | exact, restyle/reconnect only |
| `src/ui/components/PlanEditorFields.tsx` | component | event-driven transform | itself | exact, reuse accessible reorder |
| `app/library/plan/[planId]/schedule.tsx` | route | request-response | itself | exact, preserve deep link |
| `src/ui/screens/ScheduleEditorScreen.tsx` | component | versioned CRUD / prospective scheduling | itself | exact for Strength; partial for Running |
| `src/ui/components/ScheduleBindingEditor.tsx` | component | event-driven transform | itself | exact for Strength; do not reuse its weekday uniqueness for Running |
| `app/library/plan/[planId]/replace/[occurrenceId].tsx` | route | preview-review-command | itself | exact, preserve deep link |
| `src/ui/screens/ExerciseReplacementScreen.tsx` | component | preview-review-command | itself | exact, preserve stale-preview behavior |
| `app/library/plan/[planId]/day/[dayId]/remove.tsx` | route | preview-review-command | itself | exact, preserve deep link |
| `src/ui/screens/PlanDayRemovalScreen.tsx` | component | preview-review-command | itself | exact; closest collision-form analog |
| `app/library/starter/[templateId].tsx` | route | request-response | itself | exact, preserve deep link |
| `src/ui/screens/StarterPlanDetailScreen.tsx` | component | read-only request-response | itself | exact; closest new detail-screen analog |
| `app/library/starter/[templateId]/activate.tsx` | route | request-response / query-mode dispatch | itself | exact, preserve `mode=update` branch |
| `src/ui/screens/StarterActivationScreen.tsx` | component | preview-confirm-command | itself | exact for reviewed activation |
| `src/ui/screens/TemplateUpdateScreen.tsx` | component | preview-confirm-create | itself | exact, preserve independent-copy semantics |
| `app/library/exercise/[exerciseId].tsx`, `app/library/exercise/create.tsx`, `app/library/exercise/[exerciseId]/edit.tsx` | routes | request-response / query-mode dispatch | themselves | exact, preserve all routes/modes |
| `src/ui/screens/ExerciseDetailScreen.tsx`, `ExerciseEditorScreen.tsx`, `MetricMigrationScreen.tsx` | components | CRUD / preview-review-command | themselves | exact, preserve bundled/user-owned boundary |
| `app/library/running/create.tsx` | route | request-response / aggregate create | `app/library/exercise/create.tsx` | exact role |
| `app/library/running/[planId].tsx` | route | request-response | `app/library/starter/[templateId].tsx` | exact role |
| `app/library/running/[planId]/edit.tsx` | route | request-response / aggregate update | `app/library/plan/[planId]/edit.tsx` | exact role |
| `app/library/running/[planId]/session/new.tsx` | route | request-response / create | `app/library/exercise/create.tsx` | exact role |
| `app/library/running/[planId]/session/[sessionId].tsx` | route | request-response / CRUD | `app/library/exercise/[exerciseId]/edit.tsx` | role-match; use ID parsing but not query-mode behavior |
| `src/ui/screens/RunningPlanDetailScreen.tsx` | component | read-only request-response / lifecycle commands | `StarterPlanDetailScreen` plus `StarterActivationScreen` | role-match |
| `src/ui/screens/RunningPlanEditorScreen.tsx` | component | aggregate CRUD / transform | `OwnedPlanEditorScreen` | role/data-flow match |
| `src/ui/screens/RunningSessionEditorScreen.tsx` | component | CRUD / discriminated transform | `ExerciseEditorScreen` plus `OwnedPlanEditorScreen.TargetEditor` | role-match; no exact Running semantics |
| `src/ui/components/RunningSessionFields.tsx` | component | discriminated transform / validation | `OwnedPlanEditorScreen.TargetEditor` and shared numeric/duration fields | role-match |
| `src/ui/running/runningFormDraft.ts` | utility | transform / validation | `draftFromSnapshot`, `initialDraftFromOrigin`, and `buildMetricTarget` | role-match |
| `src/ui/components/ScheduleConflictSheet.tsx` | component | preview-review-command | `PlanDayRemovalScreen` plus `ConfirmationSheet` | role/data-flow match |
| `src/bootstrap/runningPlanRuntime.tsx` | provider / runtime port | request-response / CRUD / event invalidation | `ownedPlanRuntime.tsx` plus `scheduleRuntime.tsx` | role-match; final dependency names unknown |

### Validation targets

| New/Modified File | Role | Data Flow | Closest Live Analog | Match Quality |
|---|---|---|---|---|
| `app/(tabs)/__tests__/library.test.tsx` | route test | focus/navigation event | itself | exact, extend |
| `src/ui/__tests__/LibraryScreen.test.tsx` | component test | request-response / event-driven | itself | exact, extend |
| `src/ui/__tests__/PlanTypeChooserScreen.test.tsx` | component test | navigation event | `CustomExerciseScreens.test.tsx` and `StarterPlans.test.tsx` | role-match |
| `src/ui/__tests__/OwnedPlanDetailScreen.test.tsx` | component test | request-response / lifecycle | `StarterPlans.test.tsx` | role-match |
| `src/ui/__tests__/StarterPlans.test.tsx` | component test | preview-confirm-command | itself | exact, extend for sport scope |
| `src/ui/__tests__/OwnedPlanEditor.test.tsx` | component test | aggregate CRUD / reorder | itself | exact, extend |
| `src/ui/__tests__/ScheduleEditor.test.tsx` | component/runtime test | prospective scheduling | itself | exact, extend |
| `src/ui/__tests__/PlanImpactReplacement.test.tsx` | component/route test | preview-review-command | itself | exact, preserve |
| `src/ui/__tests__/CustomExerciseScreens.test.tsx` | component/route test | CRUD / query-mode dispatch | itself | exact, preserve |
| `src/ui/__tests__/RunningPlanDetailScreen.test.tsx` | component test | request-response / lifecycle | `StarterPlans.test.tsx` | role-match |
| `src/ui/__tests__/RunningPlanEditorScreen.test.tsx` | component test | aggregate CRUD / reorder | `OwnedPlanEditor.test.tsx` | role/data-flow match |
| `src/ui/__tests__/RunningSessionEditorScreen.test.tsx` | component test | discriminated CRUD / reorder | `OwnedPlanEditor.test.tsx` and `CustomExerciseScreens.test.tsx` | role-match |
| `tests/integration/running-plan-authoring.test.ts` | integration test | transactional CRUD / restart | `tests/integration/owned-plan-crud.test.ts` | role/data-flow match |
| `tests/integration/running-schedule-collision.test.ts` | integration test | transactional preview-confirm-command | `tests/integration/schedule-commands.test.ts` and `plan-impact-replacement.test.ts` | role-match |
| `tests/sqlite-host/running-plans.test.ts` | SQLite-host test | CRUD / batch / restart | `tests/sqlite-host/owned-plans.test.ts` | role/data-flow match |
| `scripts/run-coverage-gate.mjs` | config | batch validation | itself | exact, append final Phase 13 integrity-critical files |

## Pattern Assignments

### 1. Library root: `app/(tabs)/library.tsx` and `src/ui/screens/LibraryScreen.tsx`

**Primary analogs:** the same two live files. Keep the route thin and keep transient collection state in the screen.

**Route wiring pattern** — `app/(tabs)/library.tsx:24-33,46-54`:

```tsx
const [refreshGeneration, setRefreshGeneration] = useState(0);
const hasFocused = useRef(false);

useFocusEffect(useCallback(() => {
  if (hasFocused.current) {
    setRefreshGeneration((current) => current + 1);
  } else {
    hasFocused.current = true;
  }
}, []));
```

```tsx
onCreatePlan={() => router.push("/library/plan/create" as Href)}
onOpenExercise={(exerciseId) =>
  router.push(`/library/exercise/${exerciseId}` as Href)}
onOpenPlan={(planId) =>
  router.push(`/library/plan/${planId}/edit` as Href)}
onOpenStarter={(templateId) =>
  router.push(`/library/starter/${templateId}` as Href)}
```

Phase 17 changes the default `onOpenPlan` destination to `/library/plan/${planId}` while retaining the direct `/edit`, `/schedule`, replacement, and removal routes. Add origin/focus metadata at this boundary; do not introduce a second Library root.

**Independent view-state pattern** — `src/ui/screens/LibraryScreen.tsx:131-140,208-219`:

```tsx
type SectionProcessState = Readonly<{
  query: string;
  filters: SearchFilters;
  selectedId: string | null;
}>;

export type LibrarySectionState = Readonly<Record<
  LibrarySection,
  SectionProcessState
>>;

const initialProcessState = (): LibrarySectionState => ({
  plans: { query: "", filters: {}, selectedId: null },
  exercises: { query: "", filters: {}, selectedId: null },
});
```

Extend each section entry with its own return-focus target and keep the existing per-section scroll map. Do not collapse both views into one query/filter/selection object.

**Load/refresh error pattern** — `src/ui/screens/LibraryScreen.tsx:1295-1314,1501-1533`:

```tsx
useEffect(() => {
  mountedRef.current = true;
  const generation = loadGenerationRef.current + 1;
  loadGenerationRef.current = generation;
  void loadLibrary().then((value) => {
    if (mountedRef.current && generation === loadGenerationRef.current) {
      setSnapshot(value);
      setLoadFailed(false);
    }
  }).catch(() => {
    if (mountedRef.current && generation === loadGenerationRef.current) {
      setLoadFailed(true);
    }
  });
  return () => { mountedRef.current = false; };
}, [loadLibrary]);
```

`requestLibraryRefresh` retains the last snapshot on failure and single-flights refreshes. Preserve this last-good-data rule when the snapshot becomes sport-aware.

**Grouping/selection pattern** — `src/ui/screens/LibraryScreen.tsx:474-596,1808-1825`:

```tsx
<PlansContent
  onOpenPlan={(planId) => {
    updateSectionState("plans", { selectedId: planId });
    onOpenPlan(planId);
  }}
  query={processState.plans.query}
  snapshot={snapshot}
  selectedId={processState.plans.selectedId}
  starterFilters={starterFilters}
/>
```

Replace the scalar `plans.active` handling with the final Phase 13 sport-aware collection. Render `Active Plans`, `My Plans`, and `Starter Plans` in that order, then derive true empty from the unfiltered persisted collection—not from filtered results or fixture flags.

**Auth/guard:** no account authentication exists in this offline route. The relevant guards are source ownership, stable IDs, expected revisions, and committed preference results.

---

### 2. Neutral chooser: `app/library/plan/create.tsx` and `src/ui/screens/PlanTypeChooserScreen.tsx`

**Route analog:** `app/library/exercise/create.tsx:14-30`.

```tsx
export default function CreateCustomExerciseRoute() {
  const runtime = useCustomExerciseRuntime();

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ExerciseEditorScreen
        createId={runtime.createId}
        mode="create"
        onBack={() => router.back()}
        onSaved={(exerciseId) =>
          router.replace(`/library/exercise/${exerciseId}` as Href)}
        origin={runtime.ordinaryCreateOrigin}
        saveExercise={runtime.saveExercise}
      />
    </>
  );
}
```

Keep `app/library/plan/create.tsx` declarative: Back plus two navigation callbacks only. It must not call a create command. Move the current `OwnedPlanEditorScreen` wrapper from `app/library/plan/create.tsx:14-36` to `create-strength.tsx`, then route Strength there and Running to `/library/running/create`.

**Equal-choice control pattern** — `src/ui/screens/ExerciseEditorScreen.tsx:246-278`:

```tsx
<FocusablePressable
  accessibilityLabel={label}
  accessibilityRole="radio"
  accessibilityState={{ selected }}
  focusable
  onPress={onPress}
  style={({ pressed }) => [
    styles.compactOption,
    {
      backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
      borderColor: selected ? colors.action : colors.divider,
    },
  ]}
>
  <Text style={typeScale.bodyStrong as TextStyle}>{label}</Text>
</FocusablePressable>
```

For the chooser, use equal-height button/disclosure rows rather than a preselected radio value. Preserve the control's focus and non-color semantics, but neither `Strength` nor `Running` starts selected or visually promoted.

**Strength creation handoff:** copy the existing callback wiring from `app/library/plan/create.tsx:20-33`; after the inactive aggregate commits, replace into `/library/plan/${planId}` (summary), not directly into edit and never into activation.

---

### 3. Detail screens and preserved Strength/exercise deep routes

**Targets:** `OwnedPlanDetailScreen`, `RunningPlanDetailScreen`, all existing Strength editor/schedule/impact routes, starter routes, and exercise routes.

**Read-only detail lifecycle analog** — `src/ui/screens/StarterPlanDetailScreen.tsx:215-313`:

```tsx
const [template, setTemplate] = useState<AcceptedStarterTemplate | null>(null);
const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
  "loading",
);

useEffect(() => {
  let active = true;
  setState("loading");
  void loadStarterPlan(templateId).then((result) => {
    if (!active) return;
    setTemplate(result);
    setState(result === null ? "missing" : "ready");
  }).catch(() => {
    if (active) {
      setTemplate(null);
      setState("error");
    }
  });
  return () => { active = false; };
}, [loadStarterPlan, retryGeneration, templateId]);
```

Use the same four-state loading/ready/missing/error split, shape-matched skeletons, retry generation, and source-backed fact rendering in both new detail screens. Running detail should render one row per persisted stable session slot; do not derive rows from fixture defaults.

**Route parameter/wrapper pattern** — `app/library/plan/[planId]/schedule.tsx:17-38`:

```tsx
export default function ScheduleRoute() {
  const { planId } = useLocalSearchParams<{ planId: string | string[] }>();
  const runtime = useScheduleRuntime(useWorkoutAppRuntime());
  const resolvedPlanId = Array.isArray(planId) ? planId[0] ?? "" : planId ?? "";

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScheduleEditorScreen
        loadSchedule={runtime.loadSchedule}
        onBack={() => router.back()}
        onSaved={() => router.back()}
        planId={resolvedPlanId}
        saveSchedule={runtime.saveSchedule}
        setDateOverride={runtime.setDateOverride}
      />
    </>
  );
}
```

Use this for all Running deep routes: normalize array route params, inject runtime methods, disable gestures on dirty forms, and keep storage/domain imports out of `app/` files.

**Preserve, do not replace:**

- `app/library/plan/[planId]/edit.tsx:27-54` already wires aggregate save, duplicate, archive/restore, schedule, replacement, and day-removal routes.
- `app/library/plan/[planId]/replace/[occurrenceId].tsx:14-41` and `day/[dayId]/remove.tsx:14-41` normalize both IDs and pass preview/command callbacks.
- `app/library/starter/[templateId]/activate.tsx:19-60` keeps `STARTER_TEMPLATE_UPDATE_MODE` as a distinct query branch.
- `app/library/exercise/[exerciseId]/edit.tsx:32-105` keeps `mode === "metric"` and `mode === "copy"` distinct, with create-copy success replacing into the saved identity.

Those routes remain valid deep links even though the Library row's default destination becomes the summary screen.

---

### 4. Running plan/session forms: `RunningPlanEditorScreen`, `RunningSessionEditorScreen`, `RunningSessionFields`, and `runningFormDraft`

**Aggregate draft/save analog** — `src/ui/screens/OwnedPlanEditorScreen.tsx:77-133,689-703,822-882`:

```tsx
const dirty = useMemo(
  () => snapshot !== null
    && draft !== null
    && JSON.stringify(draft) !== JSON.stringify(draftFromSnapshot(snapshot)),
  [draft, snapshot],
);

const updateDraft = useCallback((
  update: (current: OwnedPlanDraftInput) => OwnedPlanDraftInput,
) => {
  setDraft((current) => current === null ? current : update(current));
  setSaveError(false);
  setImpactRequired(false);
  setDraftFeedback(null);
}, []);
```

```tsx
setSaveBusy(true);
setSaveError(false);
try {
  const result = await savePlan({
    expectedRevision: snapshot.revision,
    plan: draft,
  });
  const committed = resultPlan(result);
  if (committed === null) {
    setImpactRequired(true);
    return false;
  }
  setSnapshot(committed);
  setDraft(draftFromSnapshot(committed));
  setDirtyLeaveVisible(false);
  if (destination === "back") {
    onBack();
  } else {
    onSaved(committed.id);
  }
  return true;
} catch {
  setSaveError(true);
  queueMicrotask(() => errorSummaryRef.current?.focus());
  return false;
} finally {
  setSaveBusy(false);
}
```

Use snapshot + local draft, expected revision, busy state, draft-preserving failure, focused error summary, and a three-way dirty-leave confirmation. Initial Running creation is one screen-local aggregate and one inactive commit containing zero or many session drafts. Post-create session routes commit independently only after the parent dirty state is resolved.

**Typed draft-to-command construction** — `src/ui/screens/ExerciseEditorScreen.tsx:291-413`:

```tsx
function update(change: Partial<DraftState>) {
  setDraft((current) => ({ ...current, ...change }));
  setValidationError(null);
  setSaveError(false);
}

setSaveBusy(true);
setSaveError(false);
try {
  commandIdentityRef.current ??= Object.freeze({
    exerciseId: existingExerciseId ?? createId("exercise"),
    requestId: createId("custom-exercise-request"),
  });
  const { exerciseId, requestId } = commandIdentityRef.current;
  const result = await saveExercise({
    requestId,
    exerciseId,
    origin,
    ...(expectedExerciseRevision === undefined
      ? {}
      : { expectedExerciseRevision }),
    name,
    aliases: aliasValues(draft.aliases),
    exerciseType: draft.exerciseType,
    movementClass: draft.movementClass,
    primaryMuscles: commaValues(draft.primaryMuscles).length === 0
      ? ["unspecified"]
      : commaValues(draft.primaryMuscles),
    secondaryMuscles: commaValues(draft.secondaryMuscles),
    equipment: commaValues(draft.equipment).length === 0
      ? ["unspecified"]
      : commaValues(draft.equipment),
    metricIdentity: identity,
    defaultRestSeconds: restSeconds,
    progression: { kind: "manual_hold", version: 1 },
    ...(duplicateDecision === undefined ? {} : { duplicateDecision }),
  });
  setDuplicateCandidates([]);
  onSaved(result.exercise.exerciseId);
} catch (error) {
  if (isDuplicateConflict(error)) {
    setDuplicateCandidates(Object.freeze([...error.candidates]));
  } else {
    setSaveError(true);
  }
} finally {
  setSaveBusy(false);
}
```

`runningFormDraft.ts` should own pure draft parsing, selected-variant payload construction, and preview formatting. `RunningSessionEditorScreen` owns the per-type transient draft cache. `RunningSessionFields` renders common fields plus the selected variant only. Construct the command explicitly from common fields and the selected variant; never serialize the entire cache.

**Conditional field pattern** — `src/ui/screens/OwnedPlanEditorScreen.tsx:1514-1659`:

```tsx
const profile = draft.exercise.metricIdentity.profile;

{profile === "intervals" ? (
  <>
    {textField("protocolId", "Protocol name")}
    {integerField("plannedRounds", "Planned rounds")}
    {durationField("workIntervalSeconds", "Work interval (seconds)")}
    {durationField("intervalRestSeconds", "Interval rest (seconds)")}
  </>
) : null}
```

Mirror the render-by-discriminant approach for Recovery, Long run, Progression, Tempo, Intervals, Hills, and Fartlek, but use final Phase 13 discriminants and types. Unlike this Strength analog, Running values must retain semantic duration/distance units and typed Pace/HR zone/RPE targets.

**Field primitives:**

- `TimeDurationField` keeps canonical seconds as caller-owned draft text and reports invalid segments without committing (`src/ui/components/TimeDurationField.tsx:88-147,186-253`).
- `SemanticNumberField` exposes integer/decimal kind, bounds, precision, caller error, and inline live-region error (`src/ui/components/SemanticNumberField.tsx:19-34,81-168`).
- `CalendarField` preserves civil-date semantics without JavaScript `Date` parsing and restores focus after its modal (`src/ui/components/CalendarField.tsx:225-307,451-491`).

These are presentation validators. The final Running command/domain boundary must validate again.

**Stable reorder pattern** — `src/ui/components/PlanEditorFields.tsx:174-205,231-316,358-413`:

```tsx
<FocusablePressable
  accessibilityActions={[
    ...(canMoveUp ? [{ name: "increment", label: "Move up" }] : []),
    ...(canMoveDown ? [{ name: "decrement", label: "Move down" }] : []),
  ]}
  accessibilityHint="Touch and hold to drag. Use accessibility actions to move this item."
  accessibilityLabel={`Reorder ${label}`}
  accessibilityRole="adjustable"
  onAccessibilityAction={(event) => {
    if (event.nativeEvent.actionName === "increment" && canMoveUp) {
      requestMove(position - 1);
    }
    if (event.nativeEvent.actionName === "decrement" && canMoveDown) {
      requestMove(position + 1);
    }
  }}
/>
```

Use stable session IDs as `key`/`reorderId`, recompute ordinals only in the draft, announce the new position, and persist the complete stable-ID order in one prospective command. Pointer drag must not be the only path.

---

### 5. Schedule/collision review: `ScheduleConflictSheet.tsx` and Running detail integration

**Closest analog:** `PlanDayRemovalScreen` for factual choices + preview token + expected revisions + stale refresh; `ConfirmationSheet` for the second confirmation layer.

**Explicit choice pattern** — `src/ui/screens/PlanDayRemovalScreen.tsx:91-123,336-367`:

```tsx
<FocusablePressable
  accessibilityLabel={label}
  accessibilityRole="radio"
  accessibilityState={{ checked }}
  focusable
  onPress={onPress}
>
  <Text>{checked ? `Selected · ${label}` : label}</Text>
</FocusablePressable>
```

Render `Move run`, `Move strength`, and `Keep both` as a radiogroup using actual returned dates. No option is recommended or preselected.

**Revision-bound command pattern** — `src/ui/screens/PlanDayRemovalScreen.tsx:197-252`:

```tsx
const fingerprint = JSON.stringify({
  previewToken: preview.previewToken,
  selectedChoice,
});
const requestId = requestRef.current?.fingerprint === fingerprint
  ? requestRef.current.requestId
  : createRequestId?.()
    ?? `plan-impact-remove:${planId}:${dayId}:${preview.previewToken.slice(-12)}`;
requestRef.current = { fingerprint, requestId };

try {
  await removeDay({
    requestId,
    planId,
    dayId,
    expectedPlanRevision: preview.planRevision,
    expectedScheduleRevision: preview.schedule.revision,
    previewToken: preview.previewToken,
    choice: selectedChoice,
  });
  onSaved(planId);
} catch (error) {
  if (
    errorCode(error) === "plan_impact_preview_stale"
    || errorCode(error) === "plan_impact_schedule_invalid"
  ) {
    requestRef.current = null;
    setSaveError("stale");
    setRetryGeneration((value) => value + 1);
  } else if (errorCode(error) === "plan_impact_date_invalid") {
    setSaveError("date");
  } else {
    setSaveError("failed");
  }
} finally {
  setSaving(false);
}
```

The collision command must bind both opportunity identities and both schedule/version revisions in one request. A stale response reloads the preview while retaining the user's choice for review; it does not silently resubmit. `Keep both` must be a persisted audited outcome, not merely `closeSheet()`.

**Confirmation/focus pattern** — `src/ui/components/index.ts:815-929`:

```tsx
<ConfirmationSheet
  body={[
    `${loadedSnapshot.planName} will use ${
      after.mode === "weekday" ? "Weekday" : "Rotation"
    } from ${after.effectiveLocalDate} in ${after.timeZone}.`,
    "This change applies from the selected effective date. Earlier dates, sessions, planned opportunities, and history will not change.",
  ].join(" ")}
  cancelLabel="Keep editing"
  confirmLabel="Save schedule"
  heading="Save this schedule?"
  onCancel={() => setConfirmVisible(false)}
  onConfirm={() => {
    void confirmSave();
  }}
  restoreFocusRef={saveActionRef}
  visible={confirmVisible}
/>
```

The shared implementation traps modal accessibility, honors Reduced Motion, focuses an action on open, and restores the launch control on cancel (`src/ui/components/index.ts:844-868`). The Phase 17 sheet must show before/after dates for both opportunities and state that neither workout is completed or skipped.

---

### 6. Runtime adapter: `src/bootstrap/runningPlanRuntime.tsx`

**Primary analog:** `src/bootstrap/ownedPlanRuntime.tsx`; use `scheduleRuntime.tsx` for preview/read-back/invalidation composition.

**Typed UI-facing port pattern** — `src/bootstrap/ownedPlanRuntime.tsx:46-91`:

```ts
export type OwnedPlanRuntimePort = Readonly<{
  createDraft(input: Readonly<{
    name: string;
    dayName: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  loadPlan(planId: string): Promise<OwnedPlanSnapshot | null>;
  listExercises(): Promise<readonly OwnedPlanRuntimeExerciseOption[]>;
  savePlan(input: Readonly<{
    expectedRevision: number;
    plan: OwnedPlanDraftInput;
  }>): Promise<OwnedPlanRepositoryResult>;
  createId(kind: string): string;
}>;
```

Expose the narrow Phase 17 methods from Research—load/create/save plan, create/save/delete/reorder session, preview/activate, preview/commit collision—but type them from final Phase 13 domain ports. Do not copy proposed type names if Phase 13 lands different ones.

**Domain-command composition pattern** — `src/bootstrap/ownedPlanRuntime.tsx:102-172`:

```ts
export function createOwnedPlanRuntimePort(
  kernel: SqliteKernel,
  dependencies: Readonly<{
    nowMs(): number;
    randomUUID(): string;
    sha256(value: string): Promise<string>;
  }>,
): OwnedPlanRuntimePort {
  const repository = createOwnedPlanRepository(kernel);
  const createId = (kind: string) => `${kind}:${dependencies.randomUUID()}`;
  const commandContext = {
    repository,
    invalidate: async () => undefined,
    sha256: dependencies.sha256,
  };

  return Object.freeze({
    loadPlan: (planId) => repository.read(planId),
    createDraft: (input) => createOwnedPlanDraft({
      ...commandContext,
      input: {
        requestId: createId("owned-plan-create"),
        planId: createId("owned-plan"),
        name: input.name,
        dayId: createId("owned-plan-day"),
        dayName: input.dayName,
        createdAtMs: dependencies.nowMs(),
      },
    }),
    savePlan: (input) => saveOwnedPlan({
      ...commandContext,
      input: {
        requestId: createId("owned-plan-save"),
        expectedRevision: input.expectedRevision,
        plan: input.plan,
        savedAtMs: dependencies.nowMs(),
      },
    }),
  });
}
```

The runtime adapts UI intent, clocks, IDs, hashes, refresh/invalidation, and read-back. It must not contain Running SQL or duplicate domain validation.

**Conflict/read-back pattern** — `src/bootstrap/scheduleRuntime.tsx:945-1081`:

```ts
const current = await loadSchedule(input.planId);
if (
  current === null
  || current.scheduleId !== input.scheduleId
  || current.planRevision !== input.expectedPlanRevision
  || current.scheduleRevision !== input.expectedScheduleRevision
  || JSON.stringify(current.activeSchedule)
    !== JSON.stringify(input.expectedActivePair)
) {
  throw new Error("schedule_preview_conflict");
}

await saveScheduleVersion({ repository, sha256, input: command });
const saved = await loadSchedule(input.planId);
if (saved === null) throw new Error("schedule_readback_unavailable");
return saved;
```

Running create/save/session/collision success is acknowledged only after the exclusive command commits and the authoritative read model is refreshed.

**Domain/repository boundary to copy from below the runtime:**

- Validate bounded IDs, revisions, timestamps, complete aggregate structure, and selected union variant before staging (`src/domains/plans/ownedPlanCommands.ts:30-35,118-148,429-495`).
- Canonicalize the command and hash its exact semantic bytes before the repository call (`ownedPlanCommands.ts:448-456,480-494`).
- Use a durable request receipt and one `kernel.write` transaction (`src/platform/sqlite/repositories/ownedPlanRepository.ts:2090-2128`).
- Return `committed` or `already_committed`, typed conflicts, stable IDs/revisions, and invalidation keys (`ownedPlanRepository.ts:171-235`).

**Strict boundary parsing pattern** — `src/domains/shared/contracts.ts:17-21,37-63`:

```ts
const result = VersionedBoundarySchema.safeParse(input);
if (!result.success) {
  throw new BoundaryValidationError({
    kind: "validation",
    code: "boundary_invalid",
    correlationCode: CONTRACT_CORRELATION_CODE,
  });
}
return result.data;
```

Use equivalent strict discriminated schemas from Phase 13 for Running. UI validation supplements this; it never replaces it.

---

### 7. Tests

**Route tests:** copy the module-isolation pattern from `app/(tabs)/__tests__/library.test.tsx:15-48` and assert public navigation paths/callbacks rather than screen internals. Extend it to prove every root `Create plan` entry opens the same chooser, normal plan rows open summary, and direct edit/schedule/impact/Running deep links remain resolvable.

**Remembered-state component tests:** `src/ui/__tests__/LibraryScreen.test.tsx:377-460` already proves that section changes wait for committed preference and that query/filter/selection/scroll state survives tab changes. `LibraryScreen.test.tsx:1258-1398` proves stable loading controls, last-good refresh, state retention after refresh failure, stale-response rejection, and single-flight retry. Extend those same scenarios to two active sport rows, true-empty versus no-match, actions sheet focus restoration, and detail-return focus.

**Draft/error/reorder tests:** copy `src/ui/__tests__/OwnedPlanEditor.test.tsx:841-881` for draft-preserving save failure and privacy-safe errors, `:934-1001` for Save/Discard/Keep editing, and `:1002-1045` plus `src/ui/components/PlanEditorFields.tsx:358-413` for keyboard-accessible draft-only reorder. Apply the matrix to plan goals and all seven session variants; after switching type, assert hidden fields are absent from the command payload.

**Preview/revision tests:** copy the exact command assertion from `src/ui/__tests__/ScheduleEditor.test.tsx:152-203` (plan revision, schedule revision, expected active pair, before, today, next). Copy stale-preview behavior from `src/ui/__tests__/PlanImpactReplacement.test.tsx:252-309`: first command rejects stale, preview reloads, displayed revisions change, choice remains selected, and retry uses the refreshed token/revisions.

**SQLite/integration tests:**

```ts
// tests/integration/owned-plan-crud.test.ts:952-1013
const first = expectCommitted(await saveOwnedPlan(request));
const replay = expectCommitted(await saveOwnedPlan(request));
expect(replay).toMatchObject({
  outcome: "already_committed",
  plan: { revision: first.plan.revision },
});
```

The same test then submits two complete writes at one expected revision and asserts one `fulfilled`, one `rejected`, with `owned_plan_revision_conflict` (`tests/integration/owned-plan-crud.test.ts:979-1013`). Port this test shape to Running create/edit/delete/reorder and collision commands. Also copy the commit-failure proof at `:1016-1042`: neither aggregate rows nor receipt survive a failed commit.

For stable order and true empty, use the host-level pattern at `tests/sqlite-host/owned-plans.test.ts:315-436`: migrate a real database, write through the transaction boundary, reopen/query the stored facts, and assert explicit ordinals. Running coverage must add two same-weekday sessions, delete the final session, close/reopen, logical backup/restore/merge, and verify the empty list remains empty with stable IDs and slot ordinals.

**Test project placement** — `jest.config.js:26-89`:

- pure Running schemas/parsers: `unit` under `src/domains/running/**/*.test.ts` (owned by Phase 13 if already landed);
- screens and route wrappers: `components` under `src/ui/**` and `app/**`;
- real SQLite migrations/repositories: `sqlite-host`;
- command-to-repository restart/replay/backup flows: `integration`.

Append the final Phase 13 Running domain/repository/migration files to `integrityCriticalFiles` in `scripts/run-coverage-gate.mjs:16-123`; the loop at `:171-204` requires 100% statements, branches, functions, and lines for every listed file.

## Shared Patterns

### Route Wrapper → Screen → Runtime Port

**Source:** `app/library/plan/[planId]/schedule.tsx:17-38`  
**Apply to:** every new chooser, detail, plan editor, and session route.

Routes parse untrusted params, inject typed callbacks, and own navigation only. Screens own transient interaction state. Runtime ports translate UI intent to domain commands. Repositories alone access SQLite.

### Local Draft, Explicit Save, Committed Rebase

**Source:** `src/ui/screens/OwnedPlanEditorScreen.tsx:689-703,822-882`  
**Apply to:** Running plan and session editors.

Keep the whole draft visible during save, block duplicate submit, use expected revision, and replace the snapshot/draft only with committed read-back. Back on dirty state uses the exact `Save changes?` / `Save changes` / `Discard changes` / `Keep editing` flow from `OwnedPlanEditorScreen.tsx:1458-1473` (Phase 17 requires the contextual label `Discard changes`).

### Preview → Review → One Exclusive Command

**Source:** `src/ui/screens/PlanDayRemovalScreen.tsx:174-252` and `ScheduleEditorScreen.tsx:358-388,540-559`  
**Apply to:** activation, collision choices, schedule changes, destructive future-session changes.

Preview returns factual before/after data and revision/token identity. The user reviews a separate confirmation. One command revalidates and commits atomically. Stale preview refreshes and requires review again.

### Commit-before-success and Idempotent Receipt

**Source:** `src/domains/plans/ownedPlanCommands.ts:419-495`; `src/platform/sqlite/repositories/ownedPlanRepository.ts:2090-2172`  
**Apply to:** all Running mutations.

Canonical command hash + request ID + expected revisions enter one serialized transaction. Only a committed or replayed receipt may drive success navigation/toast. Invalidation runs after commit and failures never expose raw draft payloads.

### Shared Field, Focus, Sheet, and Reorder Primitives

**Source:** `TimeDurationField.tsx:88-147`, `SemanticNumberField.tsx:19-168`, `CalendarField.tsx:225-307`, `PlanEditorFields.tsx:174-413`, `components/index.ts:815-929`  
**Apply to:** chooser, goal form, typed session form, schedule/collision review.

Consume the final Phase 14 variants of these primitives. Do not fork colors, typography, spacing, focus management, motion, toasts, or modal frames inside Library/Running.

### Authentication / Authorization

There is no remote authentication pattern in this local/offline phase. The applicable guards are:

- bundled content is read-only; user-owned copies receive fresh identities;
- route IDs are untrusted and resolve to exact parent-owned entities;
- every mutation checks expected plan/session/schedule revisions;
- active-workout and prospective-history guards remain domain-owned;
- diagnostics expose stable codes/counts, not plan names, benchmark payloads, or draft text.

## Anti-Patterns / Do Not Copy

| Anti-pattern | Why it fails Phase 17 | Required replacement |
|---|---|---|
| Copy current `LibraryBrowseSnapshot.plans.active: LibraryPlanSummary \| null` (`LibraryScreen.tsx:117-123`) | It cannot represent concurrent active Strength and Running plans. | Bind to Phase 13's sport-aware active collection and render both labeled rows. |
| Copy Strength weekday uniqueness from `ScheduleEditorScreen.tsx:170-178` or the Strength schema | It collapses multiple ordered Running sessions on one weekday. | Preserve stable session identity plus persisted `slot_ordinal`; never use `Record<Weekday, Session>`. |
| Store a route sentinel such as `new` as a session ID | It leaks a UI key into authoritative history. | Keep a UI-only draft key; allocate the stable ID inside the committed create transaction. |
| Serialize one giant form object after switching workout type | Hidden fields from a prior type leak into storage and validation. | Cache per-type drafts only in memory; build the command from common fields plus the selected variant. |
| Treat `sessions.length === 0` as uninitialized | Deleted/default sessions reappear after reopen or restore. | Model loading, loaded-empty, and error separately; persist zero sessions as valid. |
| Let a dirty parent plan open a committing child session editor | The child increments revisions and the parent can later conflict or overwrite. | Resolve Save/Discard/Keep editing before child navigation; reload committed parent on return. |
| Put activation in create/save/duplicate/import | It bypasses current revision and schedule-impact review. | Save inactive; preview activation; confirm a separate command. |
| Implement collision choices as two ordinary schedule writes | One side can commit while the other is stale. | One command over both reviewed opportunities/revisions and one receipt. |
| Implement `Keep both` as sheet close | The same collision immediately reappears and no auditable decision exists. | Persist the exact collision outcome using the final Phase 13 contract. |
| Put SQL in screens or `runningPlanRuntime.tsx` | It creates a second authority and bypasses domain validation/receipts. | Screens → runtime adapter → Phase 13 commands/repository. |
| Copy fixture sessions on load/error/restore | Prototype examples become false source facts. | Render only committed source rows; empty remains empty. |
| Copy current Source Sans/old Material theme literals | Phase 17 depends on Phase 14's shared Archivo/IBM Plex Mono semantic system. | Import final shared primitives/tokens; add no Library-private palette or type scale. |
| Add a new drag-and-drop package or drag-only reorder | It breaks keyboard/D-pad, semantic accessibility-action and Reduced Motion contracts. | Reuse `PlanEditorReorderableRow` behavior and provide Move earlier/later. |
| Surface raw exceptions or payloads in UI/logs | It can leak user-entered plan/benchmark data. | Map to exact safe copy and stable correlation/error codes. |

## No Exact Analog Found

These behaviors have role-level analogs above, but no trustworthy live implementation in this workspace. The planner must bind to the final Phase 13/14 implementation or explicitly stop the dependent tracer; it must not infer them from current Strength code.

| Missing Exact Analog | Intended Consumer | Why the Current Code Is Insufficient |
|---|---|---|
| Final seven-variant Running session discriminated union and structured quantity/intensity literals | `runningFormDraft.ts`, `RunningSessionFields`, `RunningSessionEditorScreen`, runtime | `src/domains/running/` does not exist; Strength metric profiles are not Running session types. |
| Stable Running session revision plus same-weekday `slot_ordinal` persistence | Running editor/runtime/tests | Current Strength schedule deliberately enforces one plan-day per week/day slot. |
| Sport-aware active-plan collection and activation preview | Library and both detail screens | Current Library snapshot is singular and current activation is Strength-only. |
| One-command Move run / Move strength / Keep both collision contract | `ScheduleConflictSheet`, Running detail/runtime/tests | Impact and schedule analogs show the shape, but not the two-sport invariant or persisted Keep-both acknowledgement. |
| Final Phase 14 Archivo/shared sheet/toast/focus component names | all Phase 17 UI | Current live theme still predates the Phase 14 visual-shell implementation. |

## Planner Use by Workstream

| Workstream | Copy These Patterns First | Hard Gate |
|---|---|---|
| Library parity | `LibraryRoute`, `LibraryScreen` state/refresh/grouping tests | Replace scalar active plan only through final Phase 13 read port. |
| Chooser + Strength summary | exercise-create route wrapper, `ExerciseEditorScreen.Option`, `StarterPlanDetailScreen` | Creation remains inactive; preserve every deep route/query mode. |
| Running create/detail/edit | `OwnedPlanEditorScreen`, `StarterPlanDetailScreen`, `ownedPlanRuntime` | Final Phase 13 types/repository and Phase 14 primitives must exist. |
| Typed sessions | `ExerciseEditorScreen` explicit payload construction, `TargetEditor` conditional rendering, `PlanEditorReorderableRow` | Persist selected discriminant only; stable IDs/revisions and same-day order are domain-owned. |
| Schedule/collision | `PlanDayRemovalScreen`, `ScheduleEditorScreen`, `ConfirmationSheet` | One preview token and one exclusive command over both sport revisions. |
| Validation | corresponding component tests plus owned-plan integration/SQLite-host suites | Prove restart, replay, rollback, backup/restore/merge, stale preview, true empty, and 100% critical-file branch coverage. |

## Metadata

**Analog search scope:** `app/(tabs)`, `app/library`, `src/ui/screens`, `src/ui/components`, `src/bootstrap`, `src/domains`, `src/platform/sqlite/repositories`, `tests/integration`, `tests/sqlite-host`, `scripts`  
**Repository files indexed:** 679  
**TypeScript/JavaScript candidate files scanned:** 571  
**Existing Phase 17 production targets:** 24  
**Planned/recommended Phase 17 production targets:** 16  
**Validation/config targets:** 16  
**Strong analog families used:** 5  
**Pattern extraction date:** 2026-10-06
