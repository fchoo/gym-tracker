# Phase 19: Progress Parity - Pattern Map

**Mapped:** 2026-10-06
**Phase target files classified:** 36
**Strong or partial live analogs:** 35 / 36
**Source/test files scanned:** 474 TypeScript/TSX files under `app/`, `src/`, and `tests/`

## Boundary Found in the Live Tree

Phase 19 is an extension of the shipped factual Strength pipeline, not a new
analytics or storage subsystem. The live tree contains Progress period models,
effective-history readers, metric comparators, recommendation evidence and
revision checks, explicit route adapters, resilient screen states, draft-based
editors, and idempotent plan-command receipts.

The Phase 13/14/17/18 prerequisites named by the research have **not** landed in
this checkout:

- no `src/domains/running/`
- no `src/domains/activities/`
- no `src/platform/sqlite/repositories/runningPlanRepository.ts`
- no `src/platform/sqlite/repositories/importedActivityRepository.ts`
- no `src/platform/sqlite/repositories/bodyweightRepository.ts`
- no shared `BottomSheet` or `SemanticToast`
- no native SVG chart implementation despite `react-native-svg` being installed

The planner must place a prerequisite/freeze task before Phase 19 consumes
Running targets, accepted imported activity revisions, bodyweight facts, or the
Phase 14 sheet contract. Do not fill those gaps with Phase 19 tables, fixtures,
component state, direct SQL, or private modal shells.

## File Classification

`M` means modify an existing file; `N` means create the research-recommended
file. Data flow describes the file's dominant responsibility.

| M/N | New/Modified File | Role | Data Flow | Closest Live Analog | Match Quality |
|---|---|---|---|---|---|
| M | `src/domains/progress/contracts.ts` | model | transform | same file: `ProgressRepositoryRead`, `ProgressPeriodProjection` | exact self-extension |
| N | `src/domains/progress/dashboardProjection.ts` | service/utility | transform | `src/domains/progress/periodProjection.ts` | exact role/flow |
| N | `src/domains/progress/runningPacing.ts` | utility | transform | `src/domains/metrics/aggregates.ts` | role/flow |
| N | `src/domains/progress/relativeStrength.ts` | utility | transform | `src/domains/history/metricHistory.ts` | role/flow |
| M | `src/domains/progress/periodProjection.ts` | service/utility | transform | same file plus `src/domains/history/metricHistory.ts` | exact self-extension |
| M | `src/platform/sqlite/repositories/progressRepository.ts` | service | batch/read snapshot | same file plus `automaticSnapshotCapture.ts` | exact boundary; transaction fix required |
| M | `src/bootstrap/workoutAppRuntime.tsx` | provider | request-response/event-driven | same Progress/history/recommendation adapters | exact self-extension |
| M | `app/(tabs)/progress.tsx` | route | request-response | same file | exact self-extension |
| M | `src/ui/screens/ProgressScreen.tsx` | component | request-response/event-driven | same file | exact self-extension |
| N | `src/ui/components/FactualHistoryChart.tsx` | component | transform | `src/ui/components/ProgressTrend.tsx` for data equivalence only | partial; no SVG renderer analog |
| N | `src/ui/components/RunningHistorySheet.tsx` | component | request-response | `ExerciseHistoryScreen.tsx` + `RestAlertSettingsSheet.tsx` | role-match |
| N | `src/ui/components/RunningTargetSheet.tsx` | component | request-response | `AdvancedTimingConfigSheet.tsx` + `OwnedPlanEditorScreen.tsx` | role-match |
| N | `src/ui/components/BodyweightHistorySheet.tsx` | component | CRUD/request-response | `RestAlertSettingsSheet.tsx` | role-match; no bodyweight domain analog |
| N | `src/ui/components/BodyweightEditorSheet.tsx` | component | CRUD/request-response | `AdvancedTimingConfigSheet.tsx` | role-match; no bodyweight domain analog |
| M | `app/exercise-history/[exerciseId].tsx` | route | request-response | same file | exact self-extension |
| M | `src/domains/history/metricHistory.ts` | model/service | transform | same file | exact self-extension |
| M | `src/platform/sqlite/repositories/historyRepository.ts` | service | batch/read snapshot | same file plus `automaticSnapshotCapture.ts` | exact boundary; transaction fix required |
| M | `src/ui/screens/ExerciseHistoryScreen.tsx` | component | request-response | same file | exact self-extension |
| M | `src/ui/components/RecommendationSurface.tsx` | component | request-response | same `ProgressRecommendationReview` branch | exact self-extension |
| M | `src/domains/progression/recommendationCommands.ts` | service | CRUD/request-response | `src/domains/plans/ownedPlanCommands.ts` | role-match; replay fields missing today |
| M | `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` | service | CRUD/event-driven | recommendation methods plus `ownedPlanRepository.ts` receipts | role-match; replay behavior must change |
| N | `src/domains/progress/dashboardProjection.test.ts` | test | transform | `src/domains/progress/periodProjection.test.ts` | exact role/flow |
| N | `src/domains/progress/runningPacing.test.ts` | test | transform | `src/domains/progress/periodProjection.test.ts` | role-match |
| N | `src/domains/progress/relativeStrength.test.ts` | test | transform | `src/domains/history/metricHistory.test.ts` | exact role/flow |
| M | `src/domains/progress/periodProjection.test.ts` | test | transform | same file | exact self-extension |
| M | `tests/sqlite-host/progressRepository.test.ts` | test | batch/CRUD | same file | exact self-extension |
| M | `src/ui/__tests__/ProgressScreen.test.tsx` | test | request-response/event-driven | same file | exact self-extension |
| N | `src/ui/__tests__/RunningHistorySheet.test.tsx` | test | request-response | `ExerciseHistoryScreen.test.tsx` | role-match |
| N | `src/ui/__tests__/RunningTargetSheet.test.tsx` | test | request-response | `AdvancedTimingConfigSheet.test.tsx` | role-match |
| N | `src/ui/__tests__/BodyweightHistorySheet.test.tsx` | test | CRUD/request-response | `AdvancedTimingConfigSheet.test.tsx` | role-match |
| N | `src/ui/__tests__/BodyweightEditorSheet.test.tsx` | test | CRUD/request-response | `AdvancedTimingConfigSheet.test.tsx` | role-match |
| M | `src/ui/__tests__/ExerciseHistoryScreen.test.tsx` | test | request-response | same file | exact self-extension |
| M | `src/ui/__tests__/RecommendationSurface.test.tsx` | test | request-response | same file | exact self-extension |
| M | `app/__tests__/progress-route.test.tsx` | test | request-response | same file | exact; prefer this current path |
| N | `app/exercise-history/__tests__/exercise-history-route.test.tsx` | test | request-response | `app/__tests__/completion-route.test.tsx` | role-match |
| M | `tests/integration/load-reps.test.ts` | test | CRUD/event-driven | same recommendation decision cases | exact self-extension |

## Pattern Assignments

### Typed Progress read models and pure projections

**Apply to:**

- `src/domains/progress/contracts.ts`
- `src/domains/progress/dashboardProjection.ts`
- `src/domains/progress/periodProjection.ts`
- `src/domains/progress/runningPacing.ts`
- `src/domains/progress/relativeStrength.ts`

**Primary analogs:** `src/domains/progress/contracts.ts`,
`src/domains/progress/periodProjection.ts`,
`src/domains/history/metricHistory.ts`, and
`src/domains/metrics/aggregates.ts`.

**Import and contract pattern** — `src/domains/progress/contracts.ts:1-15,87-111`:

```typescript
import type {
  HistoryProjectionComparableExposure,
  HistoryProjectionPeriodInput,
} from "../history";
import type { MetricIdentity, MetricTarget } from "../metrics";

export type ProgressPeriod = "4_weeks" | "12_weeks" | "all_time";

export type ProgressProjectionFreshness =
  | "current"
  | "updating"
  | "unavailable";

export type ProgressPeriodProjectionInput = Readonly<{
  period: ProgressPeriod;
  nowLocalDate: string;
  periodInputs: readonly HistoryProjectionPeriodInput[];
  comparableExposures: readonly ProgressComparableExposure[];
  scheduledOpportunities: readonly ProgressScheduledOpportunity[];
  attention: readonly ProgressAttentionItem[];
  sourceSessions?: readonly ProgressEffectiveSourceSession[];
  recommendations?: readonly ProgressRecommendationReview[];
}>;
```

Copy the immutable `Readonly`/`readonly` style and keep the persisted enum value
`"4_weeks" | "12_weeks" | "all_time"`. Extend the load input with a typed
sport discriminator. The returned dashboard should be a discriminated union,
not a single object where every Strength/Running field is optional.

**Pure validation and deterministic ordering pattern** —
`src/domains/progress/periodProjection.ts:47-85,304-327`:

```typescript
function compareExposures(
  left: ProgressComparableExposure,
  right: ProgressComparableExposure,
): number {
  return left.completedAtMs - right.completedAtMs
    || left.sessionId.localeCompare(right.sessionId)
    || left.setOrdinal - right.setOrdinal
    || left.setId.localeCompare(right.setId);
}

function requireNonEmpty(value: string, code: string): string {
  if (value.trim() === "") {
    throw new TypeError(code);
  }
  return value;
}
```

The grouping key and return ordering are concrete at
`periodProjection.ts:304-327`: exercise ID, metric identity key, and comparator
key are joined into the group key; each group is frozen, then sorted by those
same fields.

For `projectProgressDashboard`, use stable source identities as tie-breakers and
freeze returned collections. Keep All-goal selection, target-at-date joins,
sparse state, Best/Latest/Gap, and series segmentation in domain code. Components
must not calculate comparability or select the nearest goal.

**Comparator reuse pattern** — `src/domains/history/metricHistory.ts:106-178`:

```typescript
const exposure = exposureFor(set);
if (exposure === null || !isMetricExposureEligible(exposure)) return null;

const groupIndex = groups.findIndex(({ reference }) =>
  areMetricExposuresComparable(reference.exposure, entry.exposure)
);

const bestCandidate = selectBestMetricCandidate({
  identity: group.reference.set.identity,
  target: referenceTarget,
  candidates,
});
```

Strength continues to use the metric registry. Running needs its own typed key
of exact distance plus documented time basis; do not coerce imported activities
into `ProgressComparableExposure`, which is a session-set shape.

**Pure numeric helper pattern** — `src/domains/metrics/aggregates.ts:194-205,350-360`:

```typescript
const distanceMeters = values[0]!.distanceMeters;
if (values.some((value) => value.distanceMeters !== distanceMeters)) {
  throw new MetricAggregateError("metric_aggregate_incompatible");
}

export function formatMetricDuration(durationMs: number): string {
  if (!DurationMsSchema.safeParse(durationMs).success) {
    throw new MetricAggregateError("metric_presentation_precision_invalid");
  }
  const totalSeconds = Math.round(durationMs / 1_000);
  // format after validation
}
```

Use integer seconds/metres (or the final upstream atomic units) for pacing.
Derive display strings from the committed target only. Lock the default tests to
660 seconds → `11:00`, `4:35/km`, `1:50/400 m`, `0:55/200 m`; 10 km and Half
Marathon target time remain `null` until an owner command commits.

### Progress repository, import evidence, and snapshot consistency

**Apply to:**

- `src/platform/sqlite/repositories/progressRepository.ts`
- `src/platform/sqlite/repositories/historyRepository.ts`
- `src/bootstrap/workoutAppRuntime.tsx`

**Primary analogs:** `automaticSnapshotCapture.ts`, `historyRepository.ts`, and
the current `progressRepository.ts` mapper/parsers.

**One-snapshot pattern** —
`src/platform/sqlite/repositories/automaticSnapshotCapture.ts:40-60`:

```typescript
export function createAutomaticSnapshotCapture(
  dependencies: AutomaticSnapshotCaptureDependencies,
): AutomaticSnapshotCapturePort {
  return Object.freeze({
    async capture(input) {
      try {
        return await dependencies.kernel.readSnapshot(async (transaction) => {
          const rows = await transaction.queryAll<{ mutation_generation: number }>(
            "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
          );
          const generation = rows.length === 1
            ? rows[0]?.mutation_generation
            : undefined;
          if (!Number.isSafeInteger(generation) || generation! < 0) {
            throw new AutomaticSnapshotCaptureError(
              "automatic_snapshot_capture_failed",
            );
          }
          dependencies.onSnapshotStart?.();
          const snapshot = await dependencies.collect(transaction, input);
          return Object.freeze({ generation: generation!, snapshot });
        });
      } catch {
        throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
      }
    },
  });
}
```

Make `createProgressRepository` depend on `SqliteSnapshotKernel`, and pass the
transaction executor to freshness, Strength, Running, targets, recommendations,
future occurrences, and optional bodyweight readers. `SqliteKernel.readSnapshot`
already supplies `BEGIN`/`COMMIT`/rollback in
`src/platform/sqlite/sqliteKernel.ts:179-205`.

**Effective-source overlay pattern** —
`src/platform/sqlite/repositories/historyRepository.ts:412-420,507-549`:

```typescript
/**
 * ...an overlay wholly replaces raw facts, and a voided overlay contributes
 * no ordinary evidence.
 */
export async function loadEffectiveHistoryProjectionSessions(
  executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor,
) {
  // ...
  if (row.snapshot_json !== null) {
    if (row.lifecycle === "voided") continue;
    const snapshot = parseEffectiveSnapshot(row.snapshot_json, row);
    // build only from the effective snapshot
    continue;
  }
  // raw facts are used only when no overlay exists
}
```

Imported Running evidence should follow this authority shape: the final Phase
18 adapter returns accepted current payload facts and provenance; corrected or
removed revisions replace/suppress old facts. Progress consumes that typed port
and never reads provider payload JSON, route/chart samples, or credentials.

**Fail-closed evidence parsing pattern** —
`src/platform/sqlite/repositories/progressRepository.ts:240-317`:

```typescript
function recommendationFromRow(row: RecommendationReviewRow) {
  try {
    if (
      row.evidence_version !== ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION
      || row.rule_type !== "load_reps"
    ) {
      return null;
    }
    const identity = parseMetricIdentity({
      profile: row.metric_profile,
      contractVersion: row.metric_contract_version,
      exerciseMetricGeneration: row.exercise_metric_generation,
    });
    // The remainder is accepted only after parseActionableRecommendationEvidence.
  } catch {
    return null;
  }
}
```

Malformed/unaccepted imported facts must likewise be excluded, not partially
displayed. Coarse diagnostics may name an affected class; they must not leak a
route, heart-rate series, raw payload, source account, bodyweight value, or
opaque row identifier.

**Current code to replace, not copy** —
`src/platform/sqlite/repositories/progressRepository.ts:330-462` performs
freshness queries and later fact queries through separate top-level
`kernel.queryAll` calls. A writer can commit between them. Enclose the whole
selected-view read in one `readSnapshot`; do not merely recheck revisions at the
end.

**Runtime adapter pattern** — `src/bootstrap/workoutAppRuntime.tsx:2688-2697`:

```typescript
const loadExerciseMetricHistory = useCallback((exerciseId: string) =>
  requireServices().historyRepository.loadExerciseMetricHistory({ exerciseId }),
  [requireServices]);

const loadProgress = useCallback((input) =>
  requireServices().progressRepository.load(input), [requireServices]);
```

Expose typed capabilities from the runtime and inject them into routes/screens.
Do not import repositories into a screen and do not issue screen SQL.

### Running targets and optional bodyweight commands

**Apply to:** final upstream Running/bodyweight commands and repositories,
`RunningTargetSheet.tsx`, `BodyweightHistorySheet.tsx`, and
`BodyweightEditorSheet.tsx`.

**Closest live analog:** owned plan command + receipt path. This is the behavior
pattern only; do not reuse the owned-plan schema for Running or bodyweight.

**Command envelope** — `src/domains/plans/ownedPlanCommands.ts:95-116`:

```typescript
export type SaveOwnedPlanInput = Readonly<{
  requestId: string;
  expectedRevision: number;
  savedAtMs: number;
  plan: OwnedPlanDraftInput;
}>;
```

Use the same four concerns for every Phase 19 mutation: stable request identity,
expected source/fact revision, validated canonical payload, and occurrence time.

**Canonical request hash** — `src/domains/plans/ownedPlanCommands.ts:194-218`:

```typescript
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    );
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
```

**Validate → stage → repository → post-commit invalidation** —
`src/domains/plans/ownedPlanCommands.ts:419-427,459-495`:

```typescript
async function postCommit(
  context: CommandContext,
  result: OwnedPlanRepositoryResult,
): Promise<OwnedPlanRepositoryResult> {
  if (result.outcome === "committed") {
    await context.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}
```

`saveOwnedPlan` at lines 459-495 validates request/revision/time/name, stages a
canonical value, hashes it, calls `repository.save`, then runs `postCommit`.

**Receipt replay and revision check** —
`src/platform/sqlite/repositories/ownedPlanRepository.ts:551-565,1713-1723,1790-1805,2088-2104`:

```typescript
function replayReceipt(receipt: ReceiptRow | undefined, requestSha256: string) {
  if (receipt === undefined) return null;
  if (receipt.request_sha256 !== requestSha256) {
    throw new OwnedPlanConflictError("owned_plan_idempotency_conflict");
  }
  return Object.freeze({ ...parseReceiptResult(receipt.result_json), outcome: "already_committed" });
}

return kernel.write(async (transaction) => {
  const replay = replayReceipt(
    await readReceipt(transaction, input.requestId),
    input.requestSha256,
  );
  return replay ?? command(transaction);
});
```

Running target and bodyweight repositories must put the fact write, revision
compare-and-swap, result snapshot, and receipt in one exclusive transaction.
After it commits, reload the authoritative target/bodyweight view before showing
success. For bodyweight, store an exact atomic unit selected by the upstream
contract; UI decimal kilograms must not be the durable floating-point value.
Bodyweight invalidates only bodyweight/relative projections and must not touch
targets or pending recommendations.

### Recommendation review and replay fencing

**Apply to:**

- `src/domains/progression/recommendationCommands.ts`
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`
- `src/ui/components/RecommendationSurface.tsx`
- `src/ui/screens/ProgressScreen.tsx`

**Evidence shape to preserve** — `src/domains/progress/contracts.ts:87-100`:

```typescript
export type ProgressRecommendationReview = Readonly<{
  id: string;
  exerciseId: string;
  exerciseName: string;
  sourceSessionId: string | null;
  status: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
  lifecycle: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
  rule: Readonly<{ id: string; version: number }>;
  confidence: string;
  reason: string;
  metricIdentity: MetricIdentity;
  currentTarget: MetricTarget;
  proposedTarget: MetricTarget;
}>;
```

**Revision/evidence fence** —
`src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2383-2492`:

```typescript
const recommendation = await pendingRecommendation(transaction, input.recommendationId);
if (recommendation === null || recommendation.status !== "pending") {
  throw new WorkoutOutcomeConflictError("recommendation_decision_conflict");
}

if (
  recommendation.evidence_version !== ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION
  || recommendation.rule_type !== "load_reps"
  || target === undefined
  || target.exercise_id !== recommendation.exercise_id
  || target.metric_profile !== recommendation.metric_profile
  || target.metric_contract_version !== recommendation.metric_contract_version
  || target.exercise_metric_generation !== recommendation.exercise_metric_generation
  || targetScope.some(({ revision }) =>
    revision !== recommendation.target_revision
  )
) {
  return supersede();
}

const evidence = parseActionableRecommendationEvidence({
  evidence: parseTarget(recommendation.evidence_json),
  expected: {
    sourceRevision: recommendation.source_revision,
    targetRevision: recommendation.target_revision,
    targetId: recommendation.target_id,
    sourceSessionRevision: recommendation.source_revision,
    currentTarget: parseTarget(target.target_json),
    proposedTarget: proposed,
    createdAtMs: recommendation.created_at_ms,
  },
});
```

Preserve this full evidence check and the compare-and-swap update at
`workoutOutcomeRepository.ts:2511-2555`. Add request identity and durable receipt
replay around both Keep and Use. Do not weaken stale evidence into a write.

**Current command gap** —
`src/domains/progression/recommendationCommands.ts:28-31` contains only
`recommendationId` and `decidedAtMs`. Extend it with the final request/revision
envelope. The current integration assertion at
`tests/integration/load-reps.test.ts:1566-1589` deliberately rejects every
repeat; Phase 19 must instead make the same request/payload replay the committed
result while a changed request/decision conflicts.

**Surface branch pattern** —
`src/ui/components/RecommendationSurface.tsx:116-200`:

```tsx
const pending = recommendation.lifecycle === "pending";
// current and proposed values, rule, confidence, reason, source action
{pending ? (
  <View style={styles.actions}>
    <PrimaryAction
      busy={busy}
      label={`Use proposed target for ${recommendation.exerciseName}`}
      onPress={onAccept}
    />
    <SecondaryAction
      disabled={busy}
      label={`Keep current target for ${recommendation.exerciseName}`}
      onPress={onKeepCurrent}
    />
  </View>
) : null}
```

Keep the lifecycle distinction, source action, and simultaneous disabling of
both decision actions. Replace the current card copy with the approved sheet
copy: `Review target`, `Keep target unchanged`, and `Use target`. Dismissal,
Back, Escape, or scrim dispatches no decision. Historical records show no active
controls.

### Routes and stateful screens

**Apply to:** `app/(tabs)/progress.tsx`, `ProgressScreen.tsx`,
`app/exercise-history/[exerciseId].tsx`, and `ExerciseHistoryScreen.tsx`.

**Thin route adapter** — `app/(tabs)/progress.tsx:13-40`:

```tsx
export default function ProgressRoute() {
  const runtime = useWorkoutAppRuntime();
  return (
    <ProgressScreen
      loadProgress={runtime.loadProgress}
      nowLocalDate={nowLocalDate}
      workoutRefreshGeneration={runtime.workoutRefreshGeneration}
      onAcceptRecommendation={async (recommendationId) => {
        const result = await runtime.acceptRecommendation(recommendationId);
        await runtime.refresh();
        return result;
      }}
      onOpenExercise={(exerciseId, exerciseName) =>
        router.push(("/exercise-history/" + exerciseId
          + "?exerciseName=" + encodeURIComponent(exerciseName)) as Href)}
      onOpenSession={(sessionId) => router.push(("/session/" + sessionId) as Href)}
    />
  );
}
```

Keep route files as runtime/navigation wiring. New imported-source navigation
must use the final Phase 18 opaque activity identity and detail route; never pass
raw provider payloads through route params.

**Obsolete-read guard and explicit states** —
`src/ui/screens/ProgressScreen.tsx:656-680,704-780`:

```typescript
useEffect(() => {
  let active = true;
  setFailed(false);
  setSnapshot(null);
  void loadProgress({ period, nowLocalDate }).then((next) => {
    if (active) setSnapshot(next);
  }).catch(() => {
    if (active) setFailed(true);
  });
  return () => { active = false; };
}, [loadProgress, nowLocalDate, period, requestGeneration, workoutRefreshGeneration]);
```

Preserve the stale completion guard and distinct loading/read-error/rebuild/empty
branches. Add sport to the request key and retain sport/range/scroll/invoking
focus outside data snapshots. The current `period` state is screen-local
(`ProgressScreen.tsx:647-653`), so route/root switching retention needs a shared
route-state owner rather than hoping the component remains mounted.

Do **not** copy the unbounded `250` ms loop at
`ProgressScreen.tsx:672-680`. Prefer projection generation/invalidation refresh;
if fallback polling remains, bound attempts/back off and terminate at current or
unavailable.

**Existing deep-route pattern** — `app/exercise-history/[exerciseId].tsx:13-33`:

```tsx
const { exerciseId, exerciseName } = useLocalSearchParams();
const runtime = useWorkoutAppRuntime();
return (
  <ExerciseHistoryScreen
    exerciseId={resolvedExerciseId}
    exerciseName={resolvedExerciseName}
    loadExerciseHistory={runtime.loadExerciseMetricHistory}
    onBack={() => router.back()}
  />
);
```

Extend this route rather than create a second editable history screen.
`ExerciseHistoryScreen.tsx:140-234` is the live analog for loading, persistent
Back, retryable failure, and honest empty history. Add target/gap/goal history,
source links, data equivalence, and eligible Load/Relative to its typed history
model.

The parsing helper at `ProgressScreen.tsx:103-115` is a legacy anti-pattern for
new Phase 19 work: the screen currently splits identity keys and parses JSON to
format a record. New dashboard facts must arrive typed and presentation-ready;
the screen must not decide whether values are compatible.

### Running, target, recommendation, settings, and bodyweight sheets

**Apply to:** the four new sheet files and the recommendation review branch.

**Draft initialization and validation pattern** —
`src/ui/components/AdvancedTimingConfigSheet.tsx:152-230`:

```tsx
const [draft, setDraft] = useState<DraftState>(() =>
  draftFromValue(initialValue, scope)
);
const [error, setError] = useState<string | null>(null);
const wasVisible = useRef(visible);

useEffect(() => {
  if (visible && !wasVisible.current) {
    setDraft(draftFromValue(initialValue, scope));
    setError(null);
  }
  wasVisible.current = visible;
}, [initialValue, scope, visible]);

const save = () => {
  setError(null);
  // parse/canonicalize; on invalid, set error and return without clearing draft
  onSave(canonicalAdvancedTimingConfig(/* canonical value */));
};
```

Running target and bodyweight editors should seed a source-revision-bound draft
on open, validate without clearing it, expose busy/disabled state, and retain the
draft through failed or stale saves. Distance switching loads that distance's
own draft/current fact and never clones another target.

**Focus/modal behavior available today** —
`src/ui/components/RestAlertSettingsSheet.tsx:75-120,171-189`:

```tsx
const headingRef = useRef<View>(null);
useEffect(() => {
  if (visible && !wasVisibleRef.current) headingRef.current?.focus();
  wasVisibleRef.current = visible;
}, [visible]);

function close() {
  onClose();
  restoreFocusRef?.current?.focus();
}

<View accessibilityViewIsModal>
  <ScrollView keyboardShouldPersistTaps="handled">
    <View accessibilityRole="header" accessible focusable ref={headingRef}>
```

Copy the focus ownership, accessibility-modal semantics, scroll/IME handling,
and exact trigger restoration. Do **not** copy its optimistic preference-write
behavior for targets/bodyweight; those surfaces are commit-gated.

The raw `Modal` shells in `AdvancedTimingConfigSheet.tsx:232-364` and
`RestAlertSettingsSheet.tsx:171-269` are only partial analogs. Once the Phase 14
shared `BottomSheet` exists, every Phase 19 sheet must consume it. Do not fork
scrim, 82%-height, Back/Escape, focus-trap, IME, or reduced-motion behavior into
four new components.

### Factual chart and accessible history data

**Apply to:** `src/ui/components/FactualHistoryChart.tsx` and both history
surfaces.

There is no live `react-native-svg` chart implementation to copy. The nearest
data-equivalence pattern is `src/ui/components/ProgressTrend.tsx:117-166`:

```tsx
{rows.map((row) => {
  const text = rowText(row);
  return (
    <View accessibilityLabel={text} key={row.localDate}>
      <Text>{text}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* decorative visual mark */}
      </View>
      <SourceLinks row={row} />
    </View>
  );
})}

<View accessibilityLabel="Consistency data table">
  {rows.map((row) => <Text key={row.localDate}>{rowText(row)}</Text>)}
</View>
```

Preserve the principle that the same typed rows feed visual and text output and
that decorative marks are hidden. Replace the old completion bars with straight
segments between factual comparable points and a separate dashed target-at-date
line. Zero points render no chart; one point renders only one labelled point;
missing/ineligible points split segments. The ordered data equivalent must use
the factual series, never SVG coordinates, and visual sampling must not remove
data rows or source IDs.

Do not treat `ProgressTrend`'s `completionWidth` at lines 55-60, `Consistency`
copy at lines 125-166, or percentage bars as a Phase 19 chart pattern. Those are
the pre-v1.2 presentation being replaced.

## Test Pattern Assignments

| Target Test | Copy Structure From | Required Phase 19 Extensions |
|---|---|---|
| `dashboardProjection.test.ts` | `periodProjection.test.ts:21-49,129-220,364-404` | typed builders; reorder determinism; exact comparable keys; All nearest-goal tie-break; no cross-sport score |
| `runningPacing.test.ts` | `periodProjection.test.ts:52-127` | table-drive 660-second exact outputs, alternate rounding boundaries, invalid/nonpositive input |
| `relativeStrength.test.ts` | `metricHistory.test.ts` and `metricHistory.ts:106-178` | eligibility by metric profile, per-point dated basis, no future/latest-for-all basis, no target side effect |
| `periodProjection.test.ts` | same file `:222-243,245-362` | preserve no-fabricated-zero and effective-source evidence while adding sport-specific facts |
| `progressRepository.test.ts` | same file `:447-507,526-705,707-811` | one-snapshot race, mixed source revisions, accepted/corrected/removed import evidence, coarse diagnostics |
| `ProgressScreen.test.tsx` | same file `:141-161,234-375,574-749,765-834` | sport/range retention, obsolete-read guard, all source states, exact fixed/unset target copy, no score/zero, decision read-back |
| `RunningHistorySheet.test.tsx` | `ExerciseHistoryScreen.test.tsx:112-191` | loading/empty/error/retry, exact distance+basis, goal line, full data equivalent, source action, focus return |
| `RunningTargetSheet.test.tsx` | `AdvancedTimingConfigSheet.test.tsx:32-68,217-236,329-385,408-431` | source-bound draft, distance-specific drafts, validation, cancel/reopen, stale/failure retention, 200% text |
| `BodyweightHistorySheet.test.tsx` | `AdvancedTimingConfigSheet.test.tsx` plus `RestAlertSettingsSheet` focus pattern | zero/one/many, row-specific two-step delete, safe dismiss, post-commit removal, focus fallback |
| `BodyweightEditorSheet.test.tsx` | `AdvancedTimingConfigSheet.test.tsx:217-280,329-385` | 20.0–400.0 kg/0.1 kg, owner-local nonfuture date, add/edit, stale/failure draft retention |
| `ExerciseHistoryScreen.test.tsx` | same file `:131-206` | source links, target-at-date, chart/data equivalence, eligible Load/Relative only, basis disclosed per row |
| `RecommendationSurface.test.tsx` | same file `:103-219` | exact Phase 19 actions, no preselection, both disabled while busy, dismissal no command, historical controls absent |
| `app/__tests__/progress-route.test.tsx` | same file `:79-143` | typed sport+range request, retained return context, imported source route, runtime-only binding |
| `app/exercise-history/__tests__/exercise-history-route.test.tsx` | `app/__tests__/completion-route.test.tsx:24-57,100-133` | mock params/runtime/router; assert Back and exact source-session route without duplicating domain behavior |
| `tests/integration/load-reps.test.ts` | stale fencing at `:1335-1515`; current replay gap at `:1566-1589` | same request/payload returns committed result; changed decision/request conflicts; lost acknowledgment/relaunch |

### Representative test excerpts

**Pure projection fixture** — `src/domains/progress/periodProjection.test.ts:21-49`:

```typescript
function exposure(input: Readonly<{ sessionId: string; localDate: string; setId: string; completedAtMs: number; reps: number }>) {
  return {
    exerciseId: "bench-press",
    identityKey: "load_reps:1:1",
    comparatorKey: "identity",
    // source identity and canonical JSON facts
  } as const;
}
```

Use typed fixture builders for accepted Running effort, target history, and
bodyweight facts. Every builder must require source revision/provenance fields;
tests should not silently create eligible evidence with defaults.

**Fail-closed repository assertion** —
`tests/sqlite-host/progressRepository.test.ts:526-598`:

```typescript
expect(result).toEqual({
  period: "all_time",
  freshness: "updating",
  projection: null,
  diagnostic: {
    code: "history_projection_updating",
    affectedSubjects: ["exercise_metric"],
  },
});
expect(JSON.stringify(result.diagnostic)).not.toContain("bench-press");
expect(JSON.stringify(result.diagnostic)).not.toContain("session-2");
```

Add a writer-between-phases fixture proving one read snapshot cannot combine
old freshness with new facts. Cover zero/one/many/long histories and permanent
rebuild failure terminating automatic refresh.

**Draft preservation assertion** —
`src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx:217-236`:

```typescript
await fireEvent.changeText(input, "0");
await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
expect(onSave).not.toHaveBeenCalled();
expect(screen.getByText("Your timing choices are still here.")).toBeOnTheScreen();
expect(input).toHaveProp("value", "0");
```

Use the same assertion shape for target/bodyweight validation, stale revisions,
and storage failures: no command on invalid input; exact draft and focus remain.

## Shared Patterns

### Imports and boundaries

- Use relative imports grouped by domain/platform/UI as in
  `ProgressScreen.tsx:13-55`; this repo has no path-alias convention in the
  mapped files.
- Domain projectors import types and pure domain functions only. Repositories
  map SQL rows into typed domain input. Runtime hooks expose capabilities.
  Routes wire capabilities and navigation. Components render and submit only.
- Freeze returned facts and arrays at domain/repository boundaries. Preserve
  stable ordering with explicit source-identity tie-breakers.

### Authentication and privacy

There is no authentication/authorization pattern for this local-owner phase.
Do not add one. Privacy belongs at the data boundary: no Garmin credentials,
routes, heart-rate series, raw payloads, source account identifiers, or
bodyweight values in diagnostics/logs. Tests use synthetic values only.

### Error handling

- Domain input errors use stable codes and typed errors, e.g.
  `OwnedPlanInputError` at `ownedPlanCommands.ts:118-142`.
- Repository reads fail closed to a coarse `updating`/`unavailable` diagnostic;
  they do not relabel stale results as current.
- UI errors are persistent, written, and retryable while retaining sport,
  range, draft, evidence, sheet/route identity, and focus. A toast is success
  reinforcement only after committed read-back.

### Transaction and replay

- Read every selected Progress view in one `SqliteKernel.readSnapshot`.
- Run target/recommendation/bodyweight mutations in one exclusive `kernel.write`.
- Store request ID + canonical request hash + result receipt in that same write.
- Same request/same payload returns `already_committed`; changed payload or stale
  revision conflicts without overwriting the newer fact.
- Invalidate disposable projections only after commit, then authoritative reload
  precedes any success announcement.

### Accessibility and state

- Reuse `FocusablePressable`, `AdaptiveScreen`, `ScreenHeader`, `InlineNotice`,
  `EmptyState`, and `SkeletonBlock` through the existing component barrels.
- Selected/busy/disabled/expanded state is programmatic; touch, Enter, Space,
  D-pad, Back/Escape, and TalkBack share the same action semantics.
- The heading receives sheet focus; background is modal/inert; close restores
  the exact invoking control. Do not reduce this to “return somewhere on the
  Progress tab.”

### No authorization layer

No controller auth/guard excerpt applies. Phase 19 is an offline local-owner
React Native flow and adds no user/session boundary.

## Anti-Patterns to Reject in Plans

1. **Phase 19 shadow stores:** no `progress_targets`, component-local target
   authority, AsyncStorage/localStorage analytics, or Phase 19 import/bodyweight
   table.
2. **One generic optional-field bag:** use a discriminated All/Strength/Running
   read model; absence and incompatibility require typed reasons.
3. **Running through Strength set shapes:** imported activity facts retain exact
   distance, time basis, acceptance state, payload revision, and source identity.
4. **Screen analytics:** no JSON parsing, comparator logic, Best/Gap computation,
   target-at-date join, nearest-goal selection, or relative-strength join in JSX.
5. **Cross-revision reads:** do not copy `progressRepository.ts:330-505` as-is;
   freshness and all facts belong in one read transaction.
6. **Permanent 4 Hz polling:** do not copy `ProgressScreen.tsx:672-680`; use
   generation/invalidation and a bounded fallback.
7. **Optimistic consequential writes:** busy state is UX, not integrity. Do not
   change root facts or announce success before commit and read-back.
8. **Recommendation replay as conflict:** current
   `RecommendationDecisionInput` and repeat-decision test are the gap to fix,
   not the desired Phase 19 behavior.
9. **Current target across old history:** every row/goal segment needs the target
   revision effective at that date; `projection.currentTarget` for all points is
   false history.
10. **Missing as zero:** no absent target, effort, route, HR, bodyweight, or chart
    point becomes `0`; no line joins across invalid/removed/incompatible facts.
11. **Chart coordinates as data:** chart, summary, and history list consume the
    same typed factual series; SVG points are disposable decoration.
12. **Copying `ProgressTrend`:** its Consistency bars/counts are pre-v1.2 and are
    not a factual goal chart.
13. **Private sheet shells:** do not clone the raw `Modal` implementations once
    Phase 14 `BottomSheet` lands.
14. **Latest bodyweight for all history:** every relative point discloses its own
    dated basis; a newer measurement cannot rewrite older ratios.
15. **Bodyweight-driven progression:** saving/deleting bodyweight must leave all
    target and recommendation facts unchanged.
16. **Duplicate route-test location:** the live Progress route test is
    `app/__tests__/progress-route.test.tsx`; extend it unless the planner includes
    an intentional test relocation. Do not create a second competing Progress
    route test merely because research suggested `app/(tabs)/__tests__/...`.

## No Strong Live Analog / Upstream Prerequisite

These are not Phase 19-owned substitutes to build:

| Missing Boundary | Role | Data Flow | Closest Partial Analog | Planner Direction |
|---|---|---|---|---|
| final `src/domains/running/` target/goal contracts | model/service | CRUD/transform | `ownedPlanCommands.ts`; `aggregates.ts` | consume Phase 13/17 final names and semantics |
| `runningPlanRepository.ts` | service | CRUD/request-response | `ownedPlanRepository.ts` receipt pattern | wait for upstream typed port; no Progress table |
| final `src/domains/activities/` accepted-effort types | model/service | file-I/O/event-driven/transform | effective-history types | consume Phase 13/18 accepted payload revision model |
| `importedActivityRepository.ts` | service | file-I/O/CRUD/event-driven | `historyRepository.ts` overlay precedence | wait for upstream; Progress consumes canonical accepted facts and never parses provider payloads/chart samples |
| `bodyweightRepository.ts` | service | CRUD | owned-plan command/receipt pattern | wait for Phase 13; preserve target isolation |
| Phase 14 `BottomSheet` / `SemanticToast` | component/provider | event-driven | `RestAlertSettingsSheet.tsx` focus behavior | consume shared primitive once landed; do not fork it |
| `FactualHistoryChart.tsx` SVG rendering | component | transform | `ProgressTrend.tsx` data equivalence only | implement from UI-SPEC + installed SVG; no live renderer to copy |
| `importedActivities.contract.test.ts` / `v1_2MultiPlanMigration.contract.test.ts` | test | CRUD/file-I/O | current SQLite host/integration suites | upstream Phase 13/18 must land before Phase 19 assertions |

## Metadata

**Analog search scope:** `app/`, `src/domains/`, `src/platform/sqlite/`,
`src/ui/`, `src/testing/`, and `tests/`, plus the Phase 19-linked prototype
parity rows.

**Strongest analog set:**

1. `src/domains/progress/periodProjection.ts` — pure deterministic factual projection.
2. `src/platform/sqlite/repositories/automaticSnapshotCapture.ts` — one read snapshot and coarse error translation.
3. `src/platform/sqlite/repositories/historyRepository.ts` — effective correction precedence and source evidence.
4. `src/platform/sqlite/repositories/ownedPlanRepository.ts` — exclusive revision-checked receipt replay.
5. `src/ui/screens/ProgressScreen.tsx` plus its tests — typed async screen states and source navigation.

**Pattern extraction date:** 2026-10-06

**Planner checkpoint:** Re-scan the final Phase 13/14/17/18 implementation
before locking Phase 19 filenames or command fields. Research names such as
`ProgressSport`, `ProgressDashboardProjection`, `projectProgressDashboard`,
`saveRunningTarget`, and the bodyweight commands are recommendations, not live
symbols in this checkout.
