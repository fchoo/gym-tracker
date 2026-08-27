# Phase 2: Owned Library and Planning - Pattern Map

**Mapped:** 2026-08-17  
**Files analyzed:** 38 implementation file groups  
**Analogs found:** 37 / 38 groups have a direct, role-match, or partial in-repo analog  
**Live schema baseline:** migrations `0001_initial` through `0003_exercise_history_index`  
**Primary rule:** preserve SQLite source facts, bundled/user ownership, immutable session snapshots, and commit-before-acknowledgement.

## File Classification

| New/Modified File Group | Role | Data Flow | Closest Live Analog | Match Quality |
|---|---|---|---|---|
| `assets/content/exercise-library.v1.json` | config/content asset | batch/import | `assets/content/full-body-foundation.v1.json` | role-match |
| `assets/content/exercise-library.v1.manifest.json` | config/provenance | batch | `assets/content/full-body-foundation.v1.json` metadata | partial |
| `assets/content/exercise-library.v1.review.json` | config/review overlay | batch/transform | `assets/content/full-body-foundation.v1.json` | partial |
| `assets/content/starter-plans.v2.json` | config/content asset | batch/import | `assets/content/full-body-foundation.v1.json` | exact role |
| `assets/content/third-party/kinetic-place-exercises-db.MIT.txt` | config/license | file-I/O | no in-repo license asset | no analog |
| `scripts/content/fetch-pinned-exercises.mjs` | utility | file-I/O | native evidence scripts' pinned-input/hash checks | role-match |
| `scripts/content/build-exercise-pack.mjs` | utility | batch/transform | `scripts/benchmark-phase1.mjs` source digest code | role-match |
| `scripts/content/diff-exercise-pack.mjs` | utility | batch/transform | no content diff tool exists | partial |
| `scripts/content/validate-exercise-pack.mjs` | utility | batch/transform | content Zod validation + evidence verifier fail-closed style | role-match |
| `src/domains/content/*` | model/service | batch/transform | `src/domains/content/index.ts` | exact role |
| `src/domains/content/importContentPack.ts` | service/command | batch/CRUD | `activateStarterPlan` + `importBundledContent` | exact flow |
| `src/domains/library/contracts.ts` | model | request-response | `src/domains/workout/activeWorkout.ts` | role-match |
| `src/domains/library/search.ts` | service/utility | transform/request-response | `comparableHistory` and repository read models | partial |
| `src/domains/library/customExerciseCommands.ts` | service/command | CRUD | `src/domains/workout/setCommands.ts` | role-match |
| `src/domains/metrics/registry.ts` | model/registry | transform | `src/domains/workout/activeWorkout.ts` | role-match |
| `src/domains/metrics/comparators.ts` | service/utility | transform | `src/domains/progression/loadRepsV1.ts` | exact flow |
| `src/domains/metrics/observations.ts` | model/utility | transform | `SetObservation`, `parseTarget`, `parseObservation` | exact role |
| `src/domains/metrics/migrateCustomExerciseMetricProfile.ts` | service/command | CRUD/batch | recommendation decision commands + aggregate repository writes | role-match |
| `src/domains/plans/activateStarterPlan.ts` | service/command | CRUD | existing file of same name | exact |
| `src/domains/plans/planCommands.ts` | service/command | CRUD | `setCommands.ts`, `finishWorkout.ts` | role-match |
| `src/domains/plans/draftValidation.ts` | utility | transform | `loadRepsV1.ts` pure validation/evaluation | role-match |
| `src/domains/scheduling/localDate.ts` | utility | transform | `src/domains/shared/clock.ts` | role-match |
| `src/domains/scheduling/scheduleState.ts` | model/utility | event-driven/transform | `restState.ts`, `outcomes.ts` | exact flow |
| `src/domains/scheduling/scheduleCommands.ts` | service/command | event-driven/CRUD | `restCommands.ts` + workout outcome commands | role-match |
| `src/domains/workout/activeWorkout.ts` | model | request-response | existing discriminated unions | exact |
| `src/platform/sqlite/migrations/0004_*.ts` through later Phase 2 migrations | migration | batch/CRUD | `0002_outcome_effort.ts`, `0003_exercise_history_index.ts` | exact |
| `src/platform/sqlite/migrations/index.ts` | config | batch | existing ordered manifest | exact |
| `src/platform/sqlite/repositories/contentRepository.ts` | service/repository | batch/CRUD | `plansWorkoutRepository.ts::importBundledContent` | exact flow |
| `src/platform/sqlite/repositories/libraryRepository.ts` | service/repository | request-response/CRUD | `plansWorkoutRepository.ts` query and write methods | role-match |
| `src/platform/sqlite/repositories/planRepository.ts` | service/repository | CRUD | `insertPlanGraph`, `activateStarterPlan` | exact flow |
| `src/platform/sqlite/repositories/scheduleRepository.ts` | service/repository | event-driven/CRUD | schedule sections of `plansWorkoutRepository.ts` | role-match |
| `src/platform/sqlite/repositories/workoutRepository.ts` and `workoutOutcomeRepository.ts` | service/repository | CRUD/request-response | existing files | exact |
| `src/ui/screens/Library*.tsx`, detail/editor screens | component | request-response | `TodayScreen.tsx`, `ActiveWorkoutScreen.tsx`, `RootScreens.tsx` | role-match |
| `src/ui/components/index.ts`, `SetRow.tsx`, new Phase 2 primitives | component | request-response | existing shared primitives and inline set row | exact |
| `app/(tabs)/library.tsx`, `app/library/*` | route/controller | request-response | existing tab and workout/detail routes | exact |
| `src/bootstrap/workoutAppRuntime.tsx`, `appContainer.ts` | provider/config | request-response/event-driven | existing runtime dependency composition | exact |
| `tests/content/*`, `tests/migrations/fixtures/*`, `tests/sqlite-host/*`, `tests/integration/*`, `src/ui/**/__tests__/*` | test | batch/CRUD/request-response | Phase 1 test layers | exact |
| `app/__native-contracts.tsx`, `src/testing/contracts/*`, `maestro/phase2/*`, evidence scripts, `package.json`, `.github/workflows/pr.yml` | test/config | native/event-driven | Phase 1 native and Maestro evidence pipeline | exact |

## Pattern Assignments

### 1. Forward Migrations and Retained Fixtures

**Likely files**

- Add ordered migrations after `0003_exercise_history_index.ts`; recommended dependency grouping:
  1. `0004_content_library.ts` — content manifest, aliases, taxonomy, owner state, authoritative search terms.
  2. `0005_exercise_plan_lifecycle.ts` — widened exercise/plan profile, availability, lifecycle, and active-schedule constraints.
  3. `0006_metric_contracts.ts` — target/session/observation/profile-contract-generation widening.
  4. `0007_exercise_search_fts.ts` — external-content trigram FTS table, triggers, initial rebuild, parity verification.
  5. `0008_effective_scheduling.ts` — schedule versions, bindings, rotation state, overrides, opportunities, events.
- Update `src/platform/sqlite/migrations/index.ts` by appending migrations in numerical order.
- Add retained fixtures for every released version not already represented, beginning with `tests/migrations/fixtures/v2-outcome-effort.sql` and `v3-exercise-history.sql`, followed by each Phase 2 version.
- Extend `tests/sqlite-host/migrations-effects.test.ts` and the shared device migration contract.

**Do not edit in place**

- `src/platform/sqlite/migrations/0001_initial.ts`
- `src/platform/sqlite/migrations/0002_outcome_effort.ts`
- `src/platform/sqlite/migrations/0003_exercise_history_index.ts`
- `tests/migrations/fixtures/v0-empty.sql`
- `tests/migrations/fixtures/v1-phase1.sql`

These are released schema/history artifacts. New constraints that invalidate existing `CHECK` clauses require forward table rebuilds, not edits to migration `0001`.

**Migration object pattern** — `src/platform/sqlite/migrations/0002_outcome_effort.ts:5-33`

```ts
export const outcomeEffortMigration: Migration = Object.freeze({
  version: 2,
  name: "outcome-effort",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(/* forward SQL */);
  },
  async verify(transaction) {
    const columns = await transaction.queryAll<{ name: string }>(
      "PRAGMA table_info(session_exercises)",
    );
    if (!columns.some(({ name }) => name === "effort")) {
      throw new Error("outcome_effort_schema_incomplete");
    }
  },
});
```

Copy the frozen object, explicit `version/name/kind`, prepared transaction API, and dedicated verification. Use `kind: "destructive"` for table rebuilds so `createMigrationRunner` requires a validated recovery backup.

**Index/virtual-table verification pattern** — `src/platform/sqlite/migrations/0003_exercise_history_index.ts:5-22`

```ts
async up(transaction) {
  await transaction.execute(
    `CREATE INDEX exercise_history
     ON session_exercises(exercise_id, metric_profile, session_id)`,
  );
},
async verify(transaction) {
  const indexes = await transaction.queryAll<{ name: string }>(
    "PRAGMA index_list(session_exercises)",
  );
  if (!indexes.some(({ name }) => name === "exercise_history")) {
    throw new Error("exercise_history_index_missing");
  }
},
```

For FTS, verification must additionally check `sqlite_compileoption_used('ENABLE_FTS5')`, source/FTS row parity, missing/extra row IDs, and FTS `integrity-check`.

**Ordered manifest pattern** — `src/platform/sqlite/migrations/index.ts:1-14`

```ts
export const migrations = Object.freeze([
  initialMigration,
  outcomeEffortMigration,
  exerciseHistoryIndexMigration,
  // append Phase 2 migrations; never reorder released entries
]);
```

**Atomic version update and rollback pattern** — `src/platform/sqlite/migrationRunner.ts:220-273`

```ts
for (const migration of pending) {
  await options.kernel.write(async (transaction) => {
    await migration.up(instrumented);
    await migration.verify(transaction);
    await verifyTransactionIntegrity(transaction);
    await transaction.execute(`PRAGMA user_version = ${migration.version}`);
  });
}
```

Keep schema writes, `verify`, integrity checks, and `user_version` in one serialized transaction. A destructive or long migration must pass `recoveryBackup.createAndValidate` before mutation (`migrationRunner.ts:223-240`).

**Fixture harness pattern** — `tests/sqlite-host/migrations-effects.test.ts:144-173`

```ts
function fixture(name: FixtureName): string {
  return readFileSync(
    join(__dirname, "../migrations/fixtures", name),
    "utf8",
  );
}

async function createHostRuntime(fixtureSql = fixture("v0-empty.sql")) {
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(fixtureSql);
  // open distinct configured writer and reader connections
}
```

Add one immutable fixture per version and run each through all later migrations. Assert IDs, source namespace/upstream IDs, names, revisions, existing schedule dates/bindings, and exact legacy `target_json`/`observed_json` bytes remain unchanged.

---

### 2. Content Asset Schemas, Generator, and Atomic Import

**Likely files**

- `assets/content/exercise-library.v1.json`
- `assets/content/exercise-library.v1.manifest.json`
- `assets/content/exercise-library.v1.review.json`
- `assets/content/third-party/kinetic-place-exercises-db.MIT.txt`
- `scripts/content/fetch-pinned-exercises.mjs`
- `scripts/content/build-exercise-pack.mjs`
- `scripts/content/diff-exercise-pack.mjs`
- `scripts/content/validate-exercise-pack.mjs`
- Split/generalize `src/domains/content/index.ts` while retaining its legacy public parser.
- Add `src/domains/content/importContentPack.ts` and a narrow content repository port.
- Extract `importBundledContent` from `plansWorkoutRepository.ts` into `contentRepository.ts`.

**Boundary schema pattern** — `src/domains/content/index.ts:1-5,69-79,102-160`

```ts
const ExerciseSchema = z.discriminatedUnion("metricProfile", [
  LoadRepsExerciseSchema,
  TimedHoldExerciseSchema,
]);

export const FullBodyFoundationSchema = z.strictObject({
  version: z.literal(1),
  metadata: z.strictObject({ /* versioned source facts */ }),
  days: z.array(DaySchema).length(2),
}).superRefine((value, context) => {
  // cross-row uniqueness and schedule-reference validation
});

export function parseFullBodyFoundation(input: unknown): FullBodyFoundation {
  const result = FullBodyFoundationSchema.safeParse(input);
  if (!result.success) {
    throw new FullBodyFoundationValidationError();
  }
  return result.data;
}
```

Copy:

- `z.strictObject`, bounded integer/string schemas, discriminated unions, and `superRefine` for cross-record invariants.
- One typed/redacted validation error code; do not expose raw Zod issue payloads to runtime diagnostics.
- Complete parse before entering the SQLite writer.

Do **not** broaden `FullBodyFoundationSchema` until it accepts unrelated catalog formats. Retain `parseFullBodyFoundation` as the shipped legacy parser and add separately versioned `ExerciseLibraryPackV1Schema` and `StarterPlansV2Schema`.

**Frozen asset pattern** — `assets/content/full-body-foundation.v1.json:1-46`

The existing fixture keeps top-level `version`, immutable source identity/revision, explicit schedule, goal, estimate, attribution, and policy. New assets should add:

- pinned source commit and four source SHA-256 values;
- normalization version;
- license/attribution;
- stable app ID and upstream ID separately;
- aliases and normalized taxonomy relations;
- profile, contract version, exercise metric version, units/defaults;
- review disposition with zero unresolved rows;
- deterministic stable-ID ordering.

Preserve all ten existing `gym-tracker.original` exercise IDs. Never silently replace them with similar Kinetic IDs.

**Origin-scoped import pattern** — `src/platform/sqlite/repositories/plansWorkoutRepository.ts:247-298`

```ts
async function importBundledContent(
  transaction: SqliteTransactionExecutor,
  fixture: FullBodyFoundation,
  installedAtMs: number,
): Promise<void> {
  await transaction.execute(/* content pack upsert */);
  for (const exercise of fixture.days.flatMap(({ exercises }) => exercises)) {
    await transaction.execute(
      `INSERT INTO exercises (...)
       VALUES (..., 'bundled', ...)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         metric_profile = excluded.metric_profile,
         revision = excluded.revision`,
      [/* bound values */],
    );
  }
}
```

Generalize the transaction shape, but tighten ownership:

1. Parse the entire pack before `kernel.write`.
2. Check revision monotonicity and manifest hashes.
3. Upsert only rows already/now owned by the bundled namespace.
4. Reject any collision with custom/copied ownership.
5. Mark omitted previously bundled identities `Unavailable`; never delete.
6. Replace bundled aliases/taxonomy/search terms in the same transaction.
7. Let same-transaction triggers synchronize FTS.
8. Verify starter references, source counts, FK integrity, and FTS parity.
9. Return committed `{ added, updated, unavailable, invalidationScopes }`.

The installed app never fetches Git or npm. Fetch/build/diff scripts are maintainer-time file-I/O only.

**Tooling failure style** — `scripts/verify-native-evidence.mjs:32-43,278-307`

Accumulate bounded failures, print machine-readable JSON, and exit nonzero. Generator validation must fail closed for hash mismatch, fewer than 300 reviewed rows, unresolved reviews, duplicate app IDs, alias/name collision report failures, unknown taxonomy/profile references, invalid starter references, or nondeterministic output.

---

### 3. FTS5/Trigram Search and Native Contracts

**Likely files**

- `src/domains/library/search.ts`
- `src/platform/sqlite/repositories/libraryRepository.ts`
- FTS migration after authoritative `exercise_search_terms` exists.
- Host FTS test under `tests/sqlite-host/`.
- Shared packaged-runtime contract, preferably `src/testing/contracts/librarySearch.contract.ts`.
- Extend `app/__native-contracts.tsx` and `scripts/run-native-sqlite-contracts.mjs`.

**No exact local FTS analog exists.** Use the SQLite kernel/repository separation, not a JavaScript index.

**Prepared reader/writer boundary** — `src/platform/sqlite/sqliteKernel.ts:22-45,110-157`

```ts
export interface SqliteTransactionExecutor {
  execute(sql: string, parameters?: readonly SqliteParameter[]): Promise<...>;
  queryAll<Row>(sql: string, parameters?: readonly SqliteParameter[]): Promise<readonly Row[]>;
}

// source writes
kernel.write((transaction) => transaction.execute(sql, parameters));

// read models
kernel.queryAll<Row>(sql, parameters);
```

Routes, screens, hooks, and pure domain search rules must not execute SQL. `libraryRepository` owns candidate SQL and hydration; `normalizeExerciseSearchTextV1`, ranking tiers, cursor validation, and filter canonicalization remain pure domain functions.

**Read-model query style** — `src/platform/sqlite/repositories/plansWorkoutRepository.ts:407-469`

Copy the pattern of:

- typed row shape;
- bound parameters;
- authoritative joins;
- deterministic `ORDER BY`;
- parsing into a domain read model after query.

Do not copy its current `JSON.parse` casts or profile-only comparability; Phase 2 must parse through the metric registry and compare profile + contract + exercise metric generation + comparator.

**Required search flow**

```text
raw query
-> normalizeExerciseSearchTextV1
-> empty: default Favorites / Recent / All sections
-> 1–2 code points: escaped relational LIKE candidate query
-> 3+ code points: safely quoted bound trigram MATCH candidate query
-> authoritative joins and OR-within/AND-across filters
-> relational relevance tier 0/1/2/3
-> canonical sort key + stable exercise ID
-> opaque keyset cursor (query/filter/content/normalization fingerprint)
-> hydrate 30 rows
```

Ranking must be:

1. exact canonical;
2. canonical prefix;
3. alias exact/prefix;
4. remaining normalized substring;
5. canonical alphabetical sort key;
6. stable exercise ID.

Never use BM25, favorite state, recency, source order, `rowid`, or `OFFSET` as product ranking.

**FTS migration contract**

- Authoritative table: one `exercise_search_terms` row per canonical/alias term with stable integer row ID, exercise ID, kind, display text, normalized text.
- External-content FTS5 table with `tokenize='trigram remove_diacritics 1'`.
- Insert/update/delete triggers maintain FTS in the same source transaction.
- Taxonomy remains relational and is not concatenated into FTS.
- Rebuild command writes only the FTS special command, then checks parity/integrity before commit.

**Native route pattern** — `app/__native-contracts.tsx:18-37,56-101,104-170`

```ts
const selectedSuite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;

const result = await verifyContract(
  await createExpoContractAdapter(runId),
);
console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
setState({ status: "finished", result });
```

Add a distinct Phase 2 FTS/content/migration suite rather than changing the ten-case kernel contract. Machine results need bounded IDs/status/duration/error codes.

**Native cases required**

- packaged `SQLite` version and `ENABLE_FTS5`;
- create/query trigram external-content FTS;
- one/two/three-code-point behavior;
- punctuation/operator/diacritic safety;
- same-transaction insert/update/delete parity and rollback;
- locked four-tier ranking and alias display;
- 29/30/31 result pagination and cursor invalidation;
- integrity-check and rebuild from relational truth;
- retained v1/v2/v3 and each new migration fixture;
- content update failure leaves previous Library intact.

Keep `scripts/run-native-sqlite-contracts.mjs:162-260` artifact binding: embedded release development-test APK, retained and installed byte equality, exact expected count, zero failed/skipped.

---

### 4. Metric Registry, Observations, Comparators, and Migration

**Likely files**

- `src/domains/metrics/registry.ts`
- `src/domains/metrics/observations.ts`
- `src/domains/metrics/comparators.ts`
- `src/domains/metrics/migrateCustomExerciseMetricProfile.ts`
- Widen `src/domains/workout/activeWorkout.ts`.
- Extend `src/domains/workout/setCommands.ts`, repositories, `SetRow.tsx`, Today/completion/detail formatting.
- Add destructive forward migrations for current exercise, plan target/policy, session exercise, and session set constraints/columns.

**Versioned union pattern** — `src/domains/workout/activeWorkout.ts:11-47`

```ts
export type LoadRepsObservation = Readonly<{
  version: 1;
  profile: "load_reps";
  loadGrams: number;
  reps: number;
  source: WorkingSetValueSource;
}>;

export type TimedHoldObservation = Readonly<{
  version: 1;
  profile: "timed_hold";
  durationSeconds: number;
  source: WorkingSetValueSource;
}>;

export type SetObservation =
  | LoadRepsObservation
  | TimedHoldObservation;
```

Use the discriminated-union style, but registry identity must carry:

```ts
type MetricIdentity = {
  profile: MetricProfile;
  contractVersion: number;
  exerciseMetricVersion: number;
  comparatorId: string | null;
  comparatorVersion: number | null;
};
```

Canonical profiles are exactly:

```text
load_reps
bodyweight_reps
added_load_reps
assisted_reps
timed_hold
fixed_distance
fixed_time
intervals
unscored
```

**Historical parser guard**

Preserve these shipped contracts exactly:

- `load_reps` V1 = integer `loadGrams` + `reps`.
- `timed_hold` V1 = integer `durationSeconds`.
- Existing `parseTarget` / `parseObservation` behavior in `workoutRepository.ts:109-245`.
- Existing display behavior that reads `durationSeconds` in `workoutOutcomeRepository.ts:117-157`.

Do not reinterpret timed-hold V1 as milliseconds and do not rewrite historical JSON bytes. Add new contract-version parsers/formatters and dispatch through the registry. A milliseconds timed hold requires a new contract version.

**Pure comparator pattern** — `src/domains/progression/loadRepsV1.ts:69-150`

```ts
function validInput(input: LoadRepsProgressionInput): boolean {
  // complete contract validation
}

export function evaluateLoadRepsV1(input): LoadRepsProgressionResult {
  if (!validInput(input)) {
    throw new TypeError("invalid_load_reps_progression_input");
  }
  const comparable = workingSets.filter(/* exact compatibility */);
  return {
    version: 1,
    decision,
    current,
    proposed,
    evidence,
  };
}
```

Each registry entry should own:

- observation and per-set target parser;
- unit/display contract;
- complete/comparable exposure predicate;
- Best comparator and deterministic tie order;
- Average population and calculation;
- presentation-only rounding;
- permitted policy descriptors or explicit manual Hold.

Keep comparators pure and table-tested. Aggregates may be fractional but never become source observations/targets.

**Comparable exposure analog and correction** — `loadRepsV1.ts:99-123`

Copy exclusion of warm-ups, incomplete/skipped rows, and mismatched versions. Strengthen the key to exact exercise identity + profile + contract version + exercise metric version + comparator identity/version and target-significant dimensions. Never aggregate across generations.

**Explicit profile migration command analog** — `src/domains/progression/recommendationCommands.ts:20-53,55-90`

Use a narrow input type, expected revisions, complete validation, and a repository port. The new command must:

1. reject bundled exercises;
2. reject if an in-progress session references the exercise;
3. load all affected future plan occurrences;
4. require owner-entered valid replacement target/default/policy per occurrence;
5. in one transaction increment exercise metric generation;
6. update only future defaults/targets;
7. replace/invalidate incompatible policies;
8. invalidate pending recommendations;
9. preserve all session exercises/sets/observations byte-for-byte;
10. return committed state and exact invalidation scopes.

This is a one-way future-contract migration. Do not infer cross-profile values.

**Inline workout UI pattern** — `src/ui/components/SetRow.tsx:77-248,337-535`

Add a profile adapter/field descriptor beneath `SetRow`; do not create nine separate row implementations. Preserve:

- local draft fields;
- validation before persistence;
- queued save before Complete;
- inline adjacent `Complete` and `Skip`;
- semantic labels and 48dp inputs;
- post-save authoritative row state.

---

### 5. Starter Fixtures, Independent Copies, and Activation

**Likely files**

- `assets/content/starter-plans.v2.json`
- starter schema under `src/domains/content/`
- generalize `src/domains/plans/activateStarterPlan.ts`
- extract/generalize `insertPlanGraph` into `planRepository.ts`
- starter fit/preview query contracts under plans/library.

**Command boundary pattern** — `src/domains/plans/activateStarterPlan.ts:7-33`

```ts
export type ActivateStarterPlanInput = Readonly<{
  fixture: FullBodyFoundation;
  repository: PlansRepository;
  activatedAtMs: number;
  startLocalDate: string;
  timezone: string;
}>;

export function activateStarterPlan(input): Promise<StarterActivation> {
  // validate date/timezone/timestamp
  return input.repository.activateStarterPlan(/* narrowed input */);
}
```

Generalize the fixture type and include confirmed:

- selected existing-copy vs create-new-copy action;
- start LocalDate;
- stored IANA timezone;
- selected Weekday/Rotation mode and bindings;
- expected active schedule/plan revisions;
- source template ID/revision.

**Complete graph copy pattern** — `src/platform/sqlite/repositories/plansWorkoutRepository.ts:90-245`

`insertPlanGraph` already walks plan → days → occurrences → warm-ups → targets → policy in order and assigns copied IDs. Preserve this graph traversal, but:

- every new copied row receives a fresh user-owned ID;
- copy schedule defaults, not consumed schedule state/history;
- copy metric profile/contract/generation, units, comparator, policy;
- copied plans retain source template/revision for attribution only;
- starter updates never mutate copies.

**Atomic activation pattern** — `plansWorkoutRepository.ts:472-567`

```ts
return kernel.write(async (transaction) => {
  await importBundledContent(transaction, input.fixture, input.activatedAtMs);
  // explicit existing-copy resolution
  const days = await insertPlanGraph(transaction, { origin: "copied" });
  await transaction.execute(/* schedule and bindings */);
  return { plan, days, schedule };
});
```

Change the existing silent reuse behavior at `plansWorkoutRepository.ts:485-492`. D-02 requires UI/domain to present existing copies and commit only the owner's explicit reactivation/new-copy choice.

When switching:

- block while any workout is in progress;
- deactivate the prior **schedule**, preserving the prior plan and schedule state;
- activate exactly one confirmed schedule;
- never archive/reset the old plan;
- commit all changes before success UI.

**Six starter validation**

The starter asset must contain exactly the reviewed six templates and exercise all nine metric profiles. The sixth template is the locked equipment-heavy Monday–Friday `Gym Body-Part Split` from D-55. Exact exercises, targets, assistance model, interval protocol/comparator, rests, substitutions, and policies require a checked review artifact; do not invent them from source names.

---

### 6. Custom Exercise Commands and Library Queries/UI

**Likely files**

- `src/domains/library/contracts.ts`
- `src/domains/library/customExerciseCommands.ts`
- `src/domains/library/search.ts`
- `src/platform/sqlite/repositories/libraryRepository.ts`
- `src/ui/screens/LibraryScreen.tsx`, `ExerciseDetailScreen.tsx`, custom exercise editor/migration screens.
- `src/ui/components/LibraryExerciseRow.tsx` or an extension of shared `ExerciseRow`.

**Command port pattern** — `src/domains/workout/setCommands.ts:48-121`

```ts
export async function completeSet(input: {
  repository: ActiveWorkoutRepository;
  invalidate(): Promise<void>;
  input: CompleteSetInput;
}) {
  validateObservation(input.input.observation, true);
  const result = await input.repository.completeSet(input.input);
  if (result.outcome === "committed") {
    await input.invalidate().catch(() => undefined);
  }
  return result;
}
```

Custom create/edit/hide/favorite/archive/restore/custom-copy commands should validate domain input, call a narrow repository port, and trigger post-commit invalidation only from the committed result.

**Ownership rules**

- Bundled exercise: source fields immutable; only owner preference rows may change.
- Custom exercise: editable and archivable/restorable; no permanent deletion.
- `Create custom copy`: fresh custom identity and history, optional provenance note; never a copied source row that follows upstream.
- Archived custom rows remain runnable from existing plans and visible with `Archived`; exclude from new selection by default.
- Upstream-removed built-ins remain `Unavailable`, attributable, referenceable, and runnable; exclude from new selection by default.

**Duplicate-warning flow**

Use `normalizeExerciseSearchTextV1` plus similar metric/equipment. The repository returns stable existing matches; creation proceeds only with an explicit `confirmLikelyDuplicate` input. Warning is advisory, not an implicit rename or blocked permanent state.

**Library query contracts**

- Plans default: Active Plan (zero/one), My Plans, Starter Plans.
- Exercises default: Favorites, Recent, All Exercises.
- Recent means completed working-set exposure in completed/partial sessions; cap ten unique exercises by latest exposure.
- Search/filter state is process-local and retained across details/section switches only.
- Persist only the last opened `Plans | Exercises` section across launches.
- Favorites never change text relevance.
- Visibility defaults exclude archived, hidden, and unavailable.

**Shared row pattern** — `src/ui/components/index.ts:959-1048`

```tsx
<FocusablePressable
  accessibilityLabel={accessibilityLabel}
  accessibilityRole="button"
  onPress={onPress}
  style={styles.exerciseRow}
>
  {/* compact primary and secondary text */}
</FocusablePressable>
```

Extend this row vocabulary with alias/origin/status and a separate accessible favorite action. Do not create nested cards or make favorite state part of row ranking.

**Section persistence analog** — `src/platform/preferences/appearancePreferenceStore.ts:5-40`

Copy the small injected store shape and bounded key, e.g. `gym_tracker.library_section.v1`. Persist `"plans" | "exercises"` only. Search, filters, pagination cursor, selected detail, and scroll offsets must not survive a process restart.

---

### 7. Plan Aggregate Editing, Duplication, Replacement, and Archiving

**Likely files**

- `src/domains/plans/planCommands.ts`
- `src/domains/plans/draftValidation.ts`
- `src/platform/sqlite/repositories/planRepository.ts`
- plan/day/target/replacement editors and routes.

**Aggregate-save pattern**

Editors hold process-local drafts. `Save plan`, `Save day`, `Save target`, and replacement Save submit the complete affected aggregate with expected revisions. No blur/debounce write is allowed.

Use the same integrity shape as set completion:

```text
validate complete aggregate
-> repository port
-> kernel.write / BEGIN IMMEDIATE
-> revision-checked source writes
-> verify graph validity and schedule impact resolution
-> COMMIT
-> return committed graph + exact invalidation scopes
-> update UI/query cache
```

**Graph write analog** — `plansWorkoutRepository.ts:90-245`

Reuse the ordered traversal and bound SQL, but owned-plan Save must distinguish:

- existing IDs/revisions for edits;
- fresh IDs for inserted days/occurrences/targets;
- explicit removed IDs;
- one final plan revision increment;
- no mutation of bundled template rows.

**Full duplication**

Copy plan metadata/source attribution, days/order, occurrences/order, warm-ups, rest, target/unit/profile/contract/generation, policy/comparator, and schedule defaults. Do not copy active status, consumed opportunities, overrides, sessions, recommendations, or history. Every copied row has a fresh ID; duplicate remains inactive.

**Draft validity**

A created owned plan may persist exactly one named empty day and lifecycle `Draft`. Store/derive a stable validation code, not display prose. Scheduling/activation requires at least one occurrence with valid working targets and compatible metric/policy contracts.

**Archive/replacement**

- Plan archive/restore is reversible; no deletion.
- Active plan archive requires an explicit replacement/schedule outcome.
- Exercise replacement first filters by profile/contract compatibility.
- Then require explicit review of targets, warm-ups, rest, progression/comparator.
- Scope is exactly `This occurrence` or `All occurrences in this plan`.
- Never move historical observations to the replacement.

**Schedule-impact review**

Deleting/reordering a day referenced by an active schedule requires a complete impact choice in the aggregate command: replacement binding, removal, or prospective effective date. If a workout is in progress, immutable snapshots allow non-schedule edits and the UI must show `Current workout is unaffected`; block only schedule-restructuring edits.

---

### 8. Effective-Dated Weekday/Rotation Scheduling

**Likely files**

- `src/domains/scheduling/localDate.ts`
- `src/domains/scheduling/scheduleState.ts`
- `src/domains/scheduling/scheduleCommands.ts`
- `src/platform/sqlite/repositories/scheduleRepository.ts`
- schedule migration and schedule editor/preview UI.

**Pure union/state-machine pattern** — `src/domains/rest/restState.ts:1-36,48-79,82-210`

```ts
export type RestStateV1 =
  | { version: 1; state: "idle"; revision: number; ... }
  | { version: 1; state: "running"; revision: number; ... }
  | { version: 1; state: "paused"; revision: number; ... }
  | { version: 1; state: "expired"; revision: number; ... };

export function transition(input): RestStateV1 {
  // validate input and current state
  // reject invalid transitions with stable codes
  return { ...nextState, revision: current.revision + 1 };
}
```

Copy discriminated states, stable transition errors, pure functions, and revision increments for:

- Weekday opportunity due/completed/skipped/missed;
- Rotation pointer repeat/skip/advance/completion;
- pending vs consumed override;
- active/inactive schedule lifecycle;
- prospective timezone-change decision.

**Transition-table analog** — `src/domains/workout/outcomes.ts:20-41`

Use explicit allowed transition maps. Invalid schedule/override states fail with typed conflict codes rather than silently normalizing.

**Clock seam** — `src/domains/shared/clock.ts:1-55`

Inject `Clock` and add a `DeviceTimeZonePort`; use `FakeClock` in schedule tests. Do not call `Date.now()` inside pure rules.

**Do not copy current calendar arithmetic**

`plansWorkoutRepository.ts:396-405,892-950` currently parses date-only strings as UTC and derives differences with milliseconds. Phase 2 must replace this schedule logic with validated calendar component arithmetic:

- parse `YYYY-MM-DD` components explicitly;
- add/difference/weekday via UTC components, not instant `+ 86_400_000`;
- derive local date for an instant and stored timezone with `Intl.DateTimeFormat(...).formatToParts`;
- validate IANA timezone by constructing the formatter.

**Required source facts**

- one schedule per owned plan with active/inactive lifecycle;
- unique partial index allowing exactly one active schedule globally;
- immutable effective-dated schedule versions;
- Weekday bindings by version/week/weekday;
- Rotation ordered bindings plus pointer/revision;
- one override per schedule/local date with pending/consumed state;
- immutable opportunities;
- append-only schedule events.

**Required command semantics**

- Weekday Skip affects only the date's opportunity; recurring binding remains.
- A missed due opportunity becomes `Planned but not completed`.
- Rotation completion advances only when the currently scheduled day completes.
- Repeat preserves pointer.
- Skip records skipped opportunity and advances.
- Advance moves pointer without workout.
- Alternate/rest-day/empty workout does not advance unless explicit `Advance rotation after this workout` is committed with outcome.
- A consumed override is immutable.
- Effective schedule/timezone changes never rewrite prior opportunities/sessions.
- Session start `local_date` remains authoritative across midnight.

Repository commands must persist event + opportunity/pointer/version changes in one serialized transaction and return exact invalidation scopes.

---

### 9. Runtime Composition and Query Invalidation

**Likely files**

- `src/bootstrap/appContainer.ts`
- `src/bootstrap/workoutAppRuntime.tsx`
- add centralized Phase 2 query keys/hooks or equivalent runtime public ports.
- decompose `createPlansWorkoutRepository` into content/library/plan/schedule/workout repositories.

**Explicit composition pattern** — `src/bootstrap/appContainer.ts:7-20`

```ts
export type AppContainer = Readonly<{
  clock: Clock;
  diagnostics: BoundedDiagnostics;
}>;

export function createAppContainer(overrides = {}): AppContainer {
  return {
    clock: overrides.clock ?? new SystemClock(),
    diagnostics: overrides.diagnostics ?? new BoundedDiagnostics(),
  };
}
```

Add public content/library/metrics/plans/scheduling ports explicitly; do not add a DI framework.

**Adapter injection pattern** — `src/bootstrap/workoutAppRuntime.tsx:215-321`

Copy the split between:

- runtime service types;
- injectable test dependencies;
- production adapters;
- one initialization path after migrations.

Remove the hard-coded single fixture/activation assumption at `workoutAppRuntime.tsx:11-20,121-123`. Runtime should consume validated generalized assets and public repository ports.

**Commit response / exact invalidation pattern** — `src/domains/workout/sessionDetail.ts:80-87`

```ts
type CommandResult = Readonly<{
  committed: CommittedState;
  invalidationScopes: readonly QueryScope[];
}>;
```

Existing `FinishOutcomeResult` returns exact `["today"]`, `["session-detail", id]`, and `["workout-completion", id]` scopes. Extend the same pattern for:

- Library section/list/detail;
- starter previews/copies;
- plan list/detail/editor;
- schedule/Today;
- exercise Best/Average/Last;
- active workout/session detail after profile/schedule changes.

**Post-commit orchestration pattern** — `src/domains/workout/setCommands.ts:107-121`

```ts
const result = await repository.completeSet(input);
if (result.outcome === "committed") {
  await invalidate();
  await haptics.committed();
  await drainEffects();
}
return result;
```

Never optimistically mutate SQLite truth. Query caches are disposable. Do not add a global database-change listener or broad “refresh everything” behavior. The current runtime refresh generation is an analog for UI notification, not the desired Phase 2 invalidation contract.

**Launch ordering**

Preserve `launchCoordinator.ts:96-133`: writer → migrations → integrity → reader → recovery/effects → first trusted query. Add FTS parity/repair only as a launch-safe derivative check; a detected FTS failure may rebuild FTS but must never alter source rows.

---

### 10. Library Routes, Shared UI, and the Workout UI Guardrail

**Likely files**

- Modify `app/(tabs)/library.tsx`.
- Add thin `app/library/*` routes for exercise/plan detail, editors, activation, schedule, migration, replacement.
- Replace only `LibraryScreen` in `src/ui/screens/RootScreens.tsx`; Calendar and Progress remain out of scope.
- Extend `src/ui/components/index.ts` and add focused components where appropriate.

**Thin route pattern** — `app/(tabs)/library.tsx:1-7`

```tsx
import { LibraryScreen } from "../../src/ui/screens/RootScreens";

export default function LibraryRoute() {
  return <LibraryScreen /* navigation callbacks only */ />;
}
```

Routes translate Expo Router params/navigation and render screens. They do not import platform repositories or execute SQL.

**Replace the intentional placeholder only** — `src/ui/screens/RootScreens.tsx:243-273`

`LibraryScreen` is the Phase 2 replacement point. Keep exactly four roots and their order, as defined by `rootDestinations` in `src/ui/components/index.ts:845-854`.

**Adaptive layout pattern** — `src/ui/layout/AdaptiveScreen.tsx:16-27,50-97`

Use the existing compact `<600`, medium `600–839`, expanded `>=840` classes and `primary`/`secondary` panes. Compact detail/editor pushes to another route; medium/expanded may use two panes without changing route semantics.

**Shared component patterns**

- `ScreenHeader`: `src/ui/components/index.ts:315-370`
- `SectionHeader`: lines 372-415
- `EmptyState`: lines 417-457
- `InlineNotice`: lines 468-530
- `ConfirmationSheet` with focus restore: lines 631-728
- `ExerciseRow`: lines 959-1048
- `PlanActivationRow`: lines 1050-1091
- 48dp/56dp sizing: styles at lines 1098-1123

Extend these instead of initializing another component library. Add approved primitives such as `SegmentedControl`, filter chips/sheet, `PlanRow`, drag/reorder handle with accessible move actions, and schedule binding editor.

**Retired workout UI must not return**

The retired set editor and retired action dock remain excluded. Preserve the live canonical pattern:

- profile fields remain inline inside `SetRow`;
- `Complete Set` and `Skip Set` remain adjacent inside each row (`SetRow.tsx:493-533`);
- failed set save keeps entered values and renders `Set not saved · Retry` directly below the set list (`ActiveWorkoutScreen.tsx:900-930`);
- `RestDock` remains the only rest-specific dock;
- do not add a modal set editor, profile-specific set screen, or bottom action dock that separates Complete/Skip from the row.

---

### 11. Tests, Coverage, Native, and Maestro Evidence

**Required test placement**

| Behavior | Test Layer | Closest Pattern |
|---|---|---|
| content schemas, generator determinism, 300-row/review/license gates | `tests/content/*` + script tests | `plan-workout-tracer.test.ts` fixture digest checks |
| metric schemas/comparators/ties/rounding | colocated unit tables | `loadRepsV1.test.ts` |
| LocalDate, DST, schedule state transitions | colocated pure tests with `FakeClock` | `restState.test.ts`, `outcomes.test.ts` |
| migrations and FTS source parity/rebuild | host SQLite | `migrations-effects.test.ts` |
| content/custom/plan/schedule atomic commands | integration SQLite | `plan-workout-tracer.test.ts` |
| Library/editor/accessibility/adaptive behavior | RNTL | `foundation.test.tsx`, screen tests |
| packaged FTS/trigram/migrations | shared native contract + route | `migrationsEffects.contract.ts`, `__native-contracts.tsx` |
| owner flows and Phase 1 regressions | `maestro/phase2/*` plus existing Phase 1 flows | `phase1-full-loop.yaml` |

**Fixture/digest test pattern** — `tests/integration/plan-workout-tracer.test.ts:152-180`

Validate exact committed asset digest, metadata, day names, and exercise names before testing import. Phase 2 should also assert pinned source hashes, generated-byte determinism, 300+ included rows, zero unresolved review rows, license identity, all starter references, and all-nine-profile coverage.

**Atomic rollback tests** — `plan-workout-tracer.test.ts:340-499`

Copy activation success, repeated command behavior, and injected commit failure assertions. Add equivalents for:

- content update;
- custom exercise create/edit/archive/restore;
- profile migration;
- aggregate plan Save/duplicate/archive/replacement;
- schedule version edits/override/pointer actions;
- FTS source+trigger rollback.

**Host migration test pattern** — `tests/sqlite-host/migrations-effects.test.ts:217-300`

Assert ordered manifest, final `user_version`, required schema objects, FK/integrity checks, and `EXPLAIN QUERY PLAN` where index use matters. Run all retained fixtures, not only clean v0.

**RNTL pattern** — `src/ui/__tests__/foundation.test.tsx:234-365`

Use exact compact/medium/expanded boundaries, semantic roles/selected/disabled/busy state, 48dp/56dp sizing, focus restoration, reduced motion, and 200% reflow. Add Library-specific first-launch/persisted-section/transient-reset tests.

**Coverage gate pattern** — `scripts/run-coverage-gate.mjs:16-45,93-126`

Append every integrity-critical Phase 2 module to `integrityCriticalFiles`, including:

- content schemas/import ownership rules;
- normalization/ranking/cursor/filter rules;
- metric registry/parsers/comparators/profile migration;
- plan aggregate validation/commands;
- LocalDate/schedule state/commands;
- every new migration and migration index.

The gate requires 100% statements, branches, functions, and lines for each listed file.

**Maestro pattern** — `maestro/smoke/phase1-full-loop.yaml:1-118`

Use visible semantic labels and public test controls; never execute arbitrary SQL. Phase 2 flows must cover:

- first Library launch into Plans and persisted section;
- exercise search, alias result, punctuation, filters, favorite, Recent;
- custom create/edit/archive/restore and duplicate warning;
- starter preview, explicit existing-copy choice, activation, switch block during workout;
- plan draft/save/reorder/duplicate/archive;
- Weekday and Rotation setup plus repeat/skip/advance/override;
- cross-profile inline SetRow use;
- content update summary and Unavailable preservation;
- process death/offline regression through the existing workout loop.

**New evidence cycle**

Phase 1 APK evidence is historical only. Phase 2 changes packaged assets, migrations, routes, runtime, and workout profile code, so create one new source-digest-bound Phase 2 development-test APK and run:

1. all prior ten SQLite kernel contracts;
2. new Phase 2 FTS/content/migration contracts;
3. all Phase 1 Maestro regressions;
4. Phase 2 Maestro flows;
5. adaptive/200% text/keyboard-D-pad/reduced-motion checks;
6. search-page and set-commit performance sampling;
7. installed-byte and retained-artifact round-trip equality.

Update `package.json` and `.github/workflows/pr.yml` by extending, not replacing, Phase 1 gates.

## Shared Patterns

### Serialized Source Mutation

**Source:** `src/platform/sqlite/serializedWriter.ts:27-85`  
**Apply to:** content import/update, favorites/hidden state, custom exercises, plan graph commands, profile migrations, schedules, FTS rebuild.

```ts
const pending = this.tail.then(() => this.executeExclusive(command));
await writer.execAsync("BEGIN IMMEDIATE");
try {
  const result = await command(writer);
  await writer.execAsync("COMMIT");
  return result;
} catch (error) {
  await writer.execAsync("ROLLBACK");
  throw translatedError;
}
```

No success acknowledgement, cache update, haptic, notice, or external effect occurs before COMMIT resolves.

### Narrow Repository Ports

**Sources:** `src/domains/plans/index.ts:35-42`, `src/domains/progression/recommendationCommands.ts:33-53`, `src/domains/workout/activeWorkout.ts:245-266`  
**Apply to:** every Phase 2 command/query boundary.

Domains define input/result and narrow ports. SQLite adapters implement ports. UI consumes public commands/read models only.

### Typed Boundary Validation

**Source:** `src/domains/content/index.ts:79-160`  
**Apply to:** content assets, persisted JSON, cursor payloads, metric values, schedule values, native machine results.

Use strict versioned parsers at the boundary. Pure domain functions receive validated values. Unknown versions fail with stable redacted codes.

### Ownership and Historical Immutability

**Sources:** `src/platform/sqlite/migrations/0001_initial.ts:15-35,37-59,165-217`; `plansWorkoutRepository.ts:90-298`  
**Apply to:** all content, plan, metric, and replacement work.

- Bundled import mutates bundled source rows only.
- Owner commands mutate owner preference/custom/copied rows only.
- Starter updates never mutate copied plans.
- Content removal becomes Unavailable, not deletion.
- Session snapshots/observations remain immutable and readable through their original contract versions.

### Exact Invalidation Scopes

**Sources:** `src/domains/workout/sessionDetail.ts:80-87`; `src/domains/workout/setCommands.ts:107-121`  
**Apply to:** every committed command.

Return exact query keys/scopes with committed state, then invalidate post-commit. Avoid global refresh/change listeners and optimistic SQLite truth.

### Errors and Diagnostics

**Sources:** `src/platform/sqlite/sqliteKernel.ts:48-67,89-107`; `src/platform/sqlite/migrationRunner.ts:30-51`; `src/testing/contracts/migrationsEffects.contract.ts:81-100`  
**Apply to:** repository, migration, content, search, metric, schedule, and native errors.

Translate adapter failures to stable categories/codes. Never log SQL parameters, raw search text, content review notes, set payloads, or historical JSON.

### Accessibility and Focus

**Sources:** `src/ui/components/index.ts:84-130,171-313,631-728`; `src/ui/layout/AdaptiveScreen.tsx:50-152`  
**Apply to:** Library, filters, rows, editors, activation, schedule, migration, and confirmations.

Preserve semantic actions, keyboard activation, selected/disabled/busy state, focus restore, one route heading, non-color state text, 48dp targets, and 200% reflow.

## Protected and Forbidden Changes

| File/Pattern | Required Treatment |
|---|---|
| `src/platform/sqlite/migrations/0001_initial.ts` | Released migration; never edit for Phase 2 schema. |
| `src/platform/sqlite/migrations/0002_outcome_effort.ts` | Released migration; never edit. |
| `src/platform/sqlite/migrations/0003_exercise_history_index.ts` | Released migration; never edit. |
| Existing migration fixtures | Historical inputs; add later-version fixtures rather than rewriting old ones. |
| `assets/content/full-body-foundation.v1.json` | Retain legacy source, IDs, and semantics; generalized importer may consume it without mutating it. |
| `parseFullBodyFoundation` | Preserve as legacy V1 parser; add new schemas rather than turning it into an unrelated catch-all. |
| `load_reps` V1 parser | Preserve grams/reps semantics and historical bytes. |
| `timed_hold` V1 parser | Preserve `durationSeconds`; new milliseconds contract needs a new version. |
| Session snapshot/observation rows | Never rewrite to normalize new contracts or transfer history. |
| Bundled exercise fields | No owner edit-in-place; use hide/favorite preferences or Create custom copy. |
| Copied user plans | Never follow starter updates. |
| Consumed overrides/opportunities/events | Immutable historical facts. |
| Retired set editor/action dock | Must not return; preserve inline `SetRow` values and adjacent Complete/Skip. |
| Calendar and Progress roots | Remain later-phase placeholders; do not expand Phase 2 into those destinations. |

## No Exact Analog Found

| File/Module Role | Reason | Planner Direction |
|---|---|---|
| Content review overlay and deterministic pinned-source generator | Phase 1 has one hand-authored fixture, not a 300+ row provenance pipeline. | Use the strict asset schema/fail-closed evidence patterns plus the research content contract. |
| External-content trigram FTS query/rebuild | No FTS table or query exists in source. | Use SQLite FTS5 contract, existing prepared kernel, and new host/device contracts. |
| Nine-profile metric registry | Current code has only two hard-coded profiles. | Generalize from `activeWorkout.ts` unions and `loadRepsV1.ts` pure comparator without reinterpreting V1. |
| Effective-dated Weekday/Rotation scheduling | Current repository supports only mutable weekday bindings and unsafe date arithmetic. | Build pure LocalDate/state-machine modules and immutable schedule facts; do not copy current date math. |
| Full Library/editor route family | Current Library is an intentional placeholder. | Use `02-UI-SPEC.md`, existing shared primitives, AdaptiveScreen, and thin route patterns. |

## Planner Guardrails

- Plan migrations before repositories/UI that need widened constraints.
- Build authoritative relational search terms before FTS.
- Prove packaged trigram FTS before relying on it for Library acceptance.
- Freeze reviewed catalog and starter artifacts before closing import/activation plans.
- Keep metric registry/parsers ahead of starter activation and cross-profile workout UI.
- Do not let plan editors write on blur/debounce.
- Do not let FTS, query cache, recommendations, or generated summaries become source truth.
- Do not infer cross-profile target conversion or starter targets.
- Do not use host SQLite or Phase 1 APK evidence as packaged Phase 2 proof.
- Do not reintroduce the retired workout editor/action dock.

## Metadata

**Analog search scope:** all tracked `src/`, `app/`, `assets/`, `tests/`, `maestro/`, `scripts/`, `package.json`, and `.github/workflows/pr.yml` files  
**Implementation files scanned:** 160  
**Primary analogs read:** 27 files across domains, SQLite, bootstrap, UI, tests, and evidence tooling  
**Pattern extraction date:** 2026-08-17  
**Untracked upstream input preserved:** `.planning/phases/02-owned-library-and-planning/02-RESEARCH.md`
