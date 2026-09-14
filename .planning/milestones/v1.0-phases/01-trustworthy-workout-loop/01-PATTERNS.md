# Phase 1: Trustworthy Workout Loop - Pattern Map

**Mapped:** 2026-08-16
**Repository state:** Greenfield; no application source files exist
**Slices mapped:** 10
**Application analogs found:** 0 / 10

## Evidence Boundary

This repository contains planning documents, project rules, and Git hook tooling, but no Expo application, domain, UI, SQLite, native-module, or test implementation. No application code analog is claimed below.

The only existing operational analogs are:

- `scripts/install-git-hooks.sh` lines 1-9: small POSIX shell scripts use `#!/bin/sh`, `set -eu`, derive the repository root with `git rev-parse`, quote paths, and print one bounded completion line.
- `.githooks/commit-msg` lines 1-22: hooks use `set -eu`, named variables, temporary-file replacement, and deterministic/idempotent text handling.

All application assignments therefore use canonical project research or official external patterns. Proposed paths are planning targets, not evidence that files already exist.

## Canonical Source Priority

1. `01-CONTEXT.md` lines 13-64 for locked implementation decisions.
2. `01-UI-SPEC.md` lines 69-344 and 348-1063 for visual, interaction, adaptive, accessibility, loading, and error contracts.
3. `01-RESEARCH.md` lines 281-531 for the recommended tree and implementation patterns.
4. `.planning/research/ARCHITECTURE.md` lines 32-96 and 129-288 for boundaries, transactions, effects, and startup.
5. `.planning/research/STACK.md` lines 9-143 for compatibility, package, CNG, test, and CI contracts.
6. Official sources cited by those documents when a native or framework contract needs implementation detail.

Where `.planning/research/STACK.md` line 27 suggests `withExclusiveTransactionAsync()`, the later phase-specific correction controls: `01-CONTEXT.md` line 24 and `01-RESEARCH.md` lines 110-116 explicitly prohibit that helper as the integrity kernel.

## Import Boundary Contract

```text
app/ routes
  -> src/ui
  -> public domain APIs only: src/domains/<domain>/index.ts

src/ui
  -> public domain APIs and shared value types
  -X src/platform
  -X SQL or raw repository adapters

src/domains/<domain>/application
  -> same-domain rules, contracts, and ports
  -> other domains only through their public index.ts

src/domains/<domain>/domain
  -> validated TypeScript values and explicit Clock only
  -X React, React Native, Expo, Zod, SQLite, notifications

src/platform/*
  -> implements domain/application ports
  -X owns workout, plan, rest, or progression policy

src/bootstrap
  -> composes adapters, commands, queries, and lifecycle triggers
  -X exposes raw writer connections to routes or UI
```

Enforce these boundaries statically. Routes are composition and parameter handoff only; screens and hooks never execute SQL. Each domain exposes one public `index.ts`; domain internals are not cross-domain import targets. Repository adapters implement ports declared inward of the platform layer.

## Naming and Placement Rules

| Concern | Pattern |
|---|---|
| Routes | Expo Router filesystem names under `app/`; route files remain thin and use `[sessionId]` for identifiers. |
| Commands | Verb-first camelCase, such as `activateStarterPlan`, `startPlannedWorkout`, `updateActiveSetDraft`, `completeSet`, `undoCompletedSet`, `startManualRest`, and `acceptRecommendation`. |
| Queries | Question/read-model names, such as `getTodayView`, `getActiveWorkoutView`, `getCompletionView`, and `getSessionDetailView`. |
| Ports | Capability nouns ending in `Port`, `Repository`, or `Store`; keep methods narrow and domain-oriented. |
| Adapters | Name by technology plus implemented capability, such as `ExpoSqliteWorkoutRepository` or `ExpoRestNotificationAdapter`. |
| Contracts | Version persistence/platform payloads with `V1`; derive TypeScript types from Zod schemas at boundaries. |
| State unions | Discriminated unions with `state` or `status`; retain explicit revisions where stale work must be rejected. |
| Migrations | Numbered, forward-only files such as `0001_initial.ts`; manifest order is authoritative. |
| Tests | Co-locate pure/module tests as `*.test.ts(x)` where useful; put cross-adapter contracts under `src/testing/contracts/`, host SQLite tests under `tests/sqlite-host/`, retained schemas under `tests/migrations/fixtures/`, and device journeys under `maestro/`. |
| Native code | App-owned Expo modules under `modules/`; generated `android/` remains uncommitted and is never hand-edited. |
| Scripts | Hyphenated operational names under `scripts/`; shell follows the existing `set -eu` pattern. |

## File Classification

The paths below are likely file groups for planning. The planner may split a group into focused files, but must preserve its role, flow, and boundary.

| Slice | Likely New/Modified File Group | Role | Data Flow | Closest Existing Analog | Match |
|---|---|---|---|---|---|
| 01-01 | `package.json`, lockfile, `.nvmrc`, `tsconfig.json`, Expo config, `plugins/withAndroidBackupRules.ts`, `scripts/{doctor-android.sh,assert-generated-android.mjs,check-cng-reproducible.sh,hash-apk.sh}`, CI workflow | config, utility | batch, file-I/O | `scripts/install-git-hooks.sh` for shell hygiene only; no app/CNG analog | partial operational |
| 01-02 | `DESIGN.md`, `app/_layout.tsx`, `app/(tabs)/*`, `src/ui/{theme,primitives,components,hooks,accessibility}/` | config, route, component, hook | event-driven, request-response, transform | No code analog; use `01-UI-SPEC.md` | none |
| 01-03 | `src/domains/shared/*`, domain `index.ts` files, application ports, `src/bootstrap/appContainer.ts`, `jest.config.*`, lint/boundary config, `src/testing/*`, `tests/sqlite-host/*`, CI skeleton | model, utility, provider, config, test | transform, request-response, batch | No code analog; use architecture dependency rule and Expo/Jest guidance | none |
| 01-04 | `src/platform/sqlite/{connection,writer}/`, SQLite kernel port/adapter, `src/testing/contracts/sqliteKernel.contract.ts`, `app/__native-contracts.tsx`, `scripts/run-native-sqlite-contracts.mjs` | service, provider, test, utility | CRUD, batch, request-response | No code analog; use private-writer research pattern and SQLite docs | none |
| 01-05 | `modules/argon2-kdf/*`, JS boundary contract, candidate descriptor fixture/output, native KAT and bridge tests | service, provider, config, test | transform, batch | No code analog; use Expo Modules + Bouncy Castle canonical APIs | none |
| 01-06 | `src/platform/sqlite/{migrations,effects}/`, `src/bootstrap/launchCoordinator.ts`, schema v1, retained fixtures, recovery manifest/tests | migration, service, provider, test | batch, CRUD, event-driven, file-I/O | No code analog; use migration/startup and outbox research patterns | none |
| 01-07 | `assets/content/full-body-foundation.v1.json`, `src/domains/{content,plans,workout}/`, SQLite repositories, Today route/view/components, activation/start integration tests | model, service, route, component, test | CRUD, request-response, transform | No code analog; use seed/copy/snapshot tracer pattern | none |
| 01-08 | workout contracts/rules/commands/ports, workout repositories, active route, set/warm-up/value/dock components, command/component/integration tests | model, service, component, route, test | CRUD, event-driven, request-response | No code analog; use complete-set transaction and UI dock state machine | none |
| 01-09 | rest contracts/rules/commands, notification port/adapter/reconciler, lifecycle hooks, `RestDock`, lifecycle Maestro flows | model, service, provider, hook, component, test | event-driven, request-response, CRUD | No code analog; use timestamp state and desired-notification reconciliation patterns | none |
| 01-10 | outcome commands/rules, completion/session queries and routes, progression `load_reps` rule/decision, smoke/performance/airplane-mode tests | model, service, route, component, test | CRUD, transform, request-response, batch | No code analog; use explicit outcome and deterministic recommendation contracts | none |

## Pattern Assignments

### 01-01 Native Prerequisite

**File group:** root Expo/toolchain configuration, CNG plugin, Android verification scripts, development-test build profile, initial CI.

**Canonical pattern:** `01-RESEARCH.md` lines 183-251, 314-367, and 506-515; `.planning/research/STACK.md` lines 94-143.

**Actual repository analog:** use `scripts/install-git-hooks.sh` lines 1-9 only for shell structure:

```sh
#!/bin/sh
set -eu
repository_root=$(git rev-parse --show-toplevel)
```

**Assignment:**

- Scaffold from the pinned Expo SDK 57 template into a temporary directory, then merge only application scaffold files.
- Commit app config, config plugins, local modules, lockfile, scripts, and assertions; never commit or hand-edit `android/`.
- `withAndroidBackupRules.ts` must generate both Android 11-and-lower and Android 12+ backup exclusion families.
- Generated assertions must check backup attributes/files, expected Gradle/AGP/Kotlin/API/NDK values, permissions, absence of exact-alarm permissions, and 16 KB page alignment.
- Keep shell scripts fail-fast and path-safe; Node scripts should emit bounded machine-readable failures.

**Test placement:** generated-native assertion tests beside script fixtures where practical; CNG reproducibility and APK checks under `scripts/`; ordered native gate in CI.

**Platform seam:** all Android customization enters through committed Expo config/plugins or `modules/`, never generated native edits.

**No code analog:** no Expo, CNG, CI, or Android configuration exists in the repository.

### 01-02 UI Foundation

**File group:** route-only shell, repository theme, adaptive primitives, accessibility helpers, shared component vocabulary.

**Canonical pattern:** `01-UI-SPEC.md` lines 69-344, 863-1017, and 1021-1063.

**Assignment:**

- `app/_layout.tsx` composes providers and launch state; `app/(tabs)/_layout.tsx` owns exactly Today, Calendar, Library, Progress in that order.
- Route files import public screen/component APIs; move rendering logic and all reusable behavior into `src/ui`.
- Theme tokens exactly follow the approved spacing, typography, color, radius, and appearance contracts. Do not add a third-party component system.
- Implement reusable `AppTabs`, `ScreenHeader`, actions, notices, failure state, empty state, sheets, skeletons, and width-class primitives before feature screens create variants.
- Root shell renders immediately but remains disabled until launch coordination returns the first trusted query.
- Active Workout is a focused route outside the tab group.

**Data flow:** user/platform appearance events -> UI hook -> persisted appearance port; launch state -> shell availability; route intent -> public command/query API.

**Test placement:** RNTL tests beside components or under `src/ui/**/__tests__/`; cover visible labels, roles, disabled/busy/selected state, focus restoration, reduced motion, 48dp/56dp sizing contracts, 200% reflow, and compact/medium/expanded selection.

**Platform seam:** system color scheme, safe area, reduced motion, dimensions, focus, and persistence are wrapped by hooks/adapters; components consume normalized values.

**No code analog:** use `01-UI-SPEC.md` as the canonical implementation contract.

### 01-03 Contracts and Test Harness

**File group:** shared IDs/time/errors/diagnostics/contracts, domain public APIs and ports, composition root, boundary checks, Jest/RNTL/host-SQLite harness.

**Canonical pattern:** `.planning/research/ARCHITECTURE.md` lines 32-96; `01-RESEARCH.md` lines 710-771.

**Assignment:**

- Put Zod only at persistence and platform boundaries; pure domain rules receive already validated values.
- Use an injected `Clock` for Undo, rest, leases, migration/retry timing, and deterministic tests.
- Translate adapter failures to typed application errors with stable categories, retry metadata, and bounded correlation codes.
- Diagnostics must never include passwords, keys, backup plaintext, notes, set payloads, or SQL parameters.
- Build `appContainer.ts` as explicit composition, not a DI framework.
- Add static import checks for route SQL, `src/ui -> src/platform`, raw writer leakage, internal cross-domain imports, and direct use of `withExclusiveTransactionAsync`.

**Data flow:** unknown boundary value -> Zod parse -> typed application input -> domain rule/port -> typed result or application error.

**Test placement:**

- Pure rule and schema tables: `*.test.ts`.
- Shared adapter contracts: `src/testing/contracts/`.
- Host SQL implementation: `tests/sqlite-host/`.
- Component semantics: RNTL.
- Coverage: complete branch coverage for integrity-critical rules, schemas, commands, migration helpers, writer/outbox; reviewed high global thresholds elsewhere.

**No code analog:** no shared contracts, container, test config, or import enforcement exists.

### 01-04 Private SQLite Writer

**File group:** production SQLite connection factory, private writer, FIFO executor, read connection, kernel contract runner.

**Canonical pattern:** `01-RESEARCH.md` lines 371-398 and 590-609; `.planning/research/ARCHITECTURE.md` lines 129-191; SQLite transaction/PRAGMA documentation.

**Core pattern to copy from research (pseudocode, not existing code):**

```ts
return fifo.enqueue(async () => {
  await writer.execAsync("BEGIN IMMEDIATE");
  try {
    const committedState = await command(transactionExecutor);
    await writer.execAsync("COMMIT");
    return committedState;
  } catch (error) {
    await writer.execAsync("ROLLBACK");
    throw translateStorageError(error);
  }
});
```

Production code must additionally handle begin, commit, and rollback failures and must never expose the raw writer to callbacks.

**Assignment:**

- Open one private writer with a distinct connection; set WAL outside transactions, then connection-local foreign keys and bounded busy timeout before writes.
- Serialize every mutation FIFO and issue explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`.
- Open a separately configured reader only after migrations.
- Transaction callbacks receive a narrow executor, not an Expo database connection.
- Finalize prepared statements in `finally`.
- Return authoritative committed state only after commit resolves.

**Test placement:** one shared kernel contract in `src/testing/contracts/sqliteKernel.contract.ts`, implemented by Node `node:sqlite` host tests and the actual Expo SQLite device route. Device contracts must prove all ten cases listed in `01-RESEARCH.md` lines 385-398.

**Platform seam:** the domain sees a serialized transaction/repository port; only `src/platform/sqlite` imports `expo-sqlite`.

**No code analog:** this is a blocking native contract, not a pattern inferred from local implementation.

### 01-05 Argon2id Feasibility

**File group:** app-owned local Expo module, narrow TypeScript bridge, Kotlin implementation, KAT/timing tests, candidate descriptor artifact.

**Canonical pattern:** `01-RESEARCH.md` lines 517-531; Expo Modules API; Bouncy Castle `Argon2BytesGenerator`; RFC 9106.

**Assignment:**

- Expose one narrow asynchronous derivation API with versioned, bounded parameters and binary output.
- Run Bouncy Castle Argon2id version 19 on a non-main coroutine dispatcher.
- Use caller-supplied salt/parameters and 32-byte output; clear native arrays in `finally` where possible.
- Return typed errors and duration metadata; never log password/key/input/output bytes.
- Record provider, parameter bounds, KAT ID, timing samples, device metadata, ABI/page-size evidence, and pass/block status in `CandidateKdfDescriptor`.
- Do not add backup product UI or freeze the Phase 5 archive envelope.

**Data flow:** validated JS descriptor and bytes -> Expo bridge -> background Kotlin KDF -> binary key result/typed error -> immediate caller-owned cleanup.

**Test placement:** Kotlin KAT in the local module; JS bridge KAT through the development-test build; physical-device timing evidence; clean-prebuild/autolink and APK page-size checks in scripts/CI.

**Platform seam:** future backup application code depends on a `PasswordKdfPort`; only the adapter imports the local Expo module.

**No code analog:** no native module or cryptographic code exists.

### 01-06 Migrations, Effects, and Launch

**File group:** schema v1, numbered migrations, retained fixtures, internal recovery seam, durable effects runner, launch coordinator.

**Canonical pattern:** `01-RESEARCH.md` lines 400-446; `.planning/research/ARCHITECTURE.md` lines 193-223 and 271-288.

**Migration contract:**

```ts
type Migration = {
  version: number;
  name: string;
  kind: "additive" | "destructive" | "long";
  up(tx: MigrationTransaction): Promise<void>;
  verify(tx: MigrationTransaction): Promise<void>;
};
```

**Assignment:**

- Apply ordered migrations through the proven FIFO writer and update `user_version` in the same successful transaction.
- Destructive/long migrations first create and validate an internal Expo SQLite hot backup; this is not user backup.
- Launch order is writer -> migrations -> integrity checks -> reader -> stale lease reset -> rest expiry repair -> urgent effect drain -> first trusted query -> enable tabs.
- Persist a narrow `pending_effects` outbox with stable ID, versioned payload, unique idempotency key, subject/revision, attempt/lease fields, and safe error code.
- Claim and acknowledge in short writer transactions; execute effect handlers outside transactions; recover stale leases on launch.
- Limit Phase 1 durable types to rest notification reconciliation and the bounded `load_reps` derived work identified by research.

**Data flow:** source mutation + pending effect in one transaction -> commit -> leased at-least-once handler -> source-revision check -> idempotent platform/derived action -> acknowledgement.

**Test placement:** every released schema fixture under `tests/migrations/fixtures/`; host and device migration contracts; failure injection around every statement; process-death lease recovery; stale-revision and bounded-retry tables.

**Platform seam:** recovery backup and SQLite mechanics remain under `src/platform/sqlite`; launch coordinator invokes public domain commands for source-state repair.

**No code analog:** no schema, migration, outbox, or bootstrap implementation exists.

### 01-07 Seed, Copy, and Today Tracer

**File group:** reviewed content fixture, content/plans/workout contracts and commands, repositories, Today read model/UI, workout start modes.

**Canonical pattern:** `01-RESEARCH.md` lines 448-476; `01-UI-SPEC.md` lines 348-420.

**Blocking content rule:** exact Full Body Foundation A/B exercise IDs, targets, rests, increments, equipment, and warm-up templates are absent. Freeze reviewed content before schema/UI implementation; do not invent it.

**Assignment:**

- Store the immutable starter at `assets/content/full-body-foundation.v1.json` with namespace/version, attribution, integer base units, rest seconds, warm-up templates, increments, and rule IDs.
- Activation validates bundled revision and clones plan, days, ordering, warm-ups, targets, policy IDs, schedule defaults, and revision into new user-owned IDs in one transaction.
- Bundled imports mutate bundled rows only; user commands mutate copied/user rows only.
- Starting a planned workout snapshots exercise names, order, metric profile, units, targets, and rule versions.
- Today query reads source-backed copied-plan/schedule facts plus current comparable evidence and pending suggestion status. A suggestion never replaces an unaccepted target.
- Implement scheduled, alternate-day, rest-day, and empty starts without silent schedule advancement.

**`load_reps` boundary contract:**

```ts
type LoadRepsV1 = {
  version: 1;
  profile: "load_reps";
  loadGrams: number;
  reps: number;
};
```

**Test placement:** content-schema fixture test; bundled immutability/copy ownership integration test; session snapshot test; all start-mode fixtures; Today RNTL states from `01-UI-SPEC.md` lines 388-420.

**Platform seam:** asset decoding/import is an adapter; plans/workout application code depends on content and repository ports, not filesystem APIs.

**No code analog:** the research pattern is canonical and content remains an explicit planning blocker.

### 01-08 Working-Set Tracer

**File group:** active workout state/contracts, warm-up and draft commands, exactly-once completion, Undo, haptic port, active workout route/components.

**Canonical pattern:** `01-RESEARCH.md` lines 478-496; `.planning/research/ARCHITECTURE.md` lines 166-191; `01-UI-SPEC.md` lines 423-520.

**Assignment:**

- Persist drafts through `updateActiveSetDraft`; recovery must not depend on React state.
- Keep warm-ups as a distinct set kind and exclude them from working completion, records, and progression.
- `completeSet` carries expected session/set revision; conditionally updates one incomplete set, advances pointer, serializes prior active/rest state, persists new rest, increments revision, and inserts unique effects in one transaction.
- FIFO plus conditional update/idempotency is the duplicate defense; UI disabling is only a usability layer.
- After commit only: update UI from returned committed state, invalidate exact keys, emit haptic, show Undo, and drain urgent effects.
- On failure: preserve values, do not advance/start rest, and render exact `Set not saved · Retry`.
- Undo checks the injected clock against the eight-second expiry and restores prior active/rest state transactionally.

**Data flow:** touch/keyboard/D-pad -> one UI handler -> validated command -> FIFO transaction -> committed state or typed failure -> post-commit UI/invalidation/haptic/effect work.

**Test placement:** pure validation and exclusion tables; application commit-latch, rapid-repeat, failure-injection, retry, and fake-clock Undo tests; RNTL dock state machine and input-equivalence tests; host/device SQLite integration.

**Platform seam:** `HapticsPort` is invoked only by post-commit orchestration; route/UI never imports Expo Haptics or SQLite.

**No code analog:** use the canonical transaction and UI state-machine contracts.

### 01-09 Rest and Lifecycle Tracer

**File group:** rest union/rules/commands, notification port/adapter/reconciler, AppState/permission triggers, RestDock, lifecycle Maestro suites.

**Canonical pattern:** `01-RESEARCH.md` lines 486-504 and 612-619; `.planning/research/ARCHITECTURE.md` lines 250-269; `01-UI-SPEC.md` lines 522-604.

**Persisted union:**

```ts
type RestStateV1 =
  | { version: 1; state: "idle"; revision: number }
  | { version: 1; state: "running"; revision: number; startedAt: number; endsAt: number }
  | { version: 1; state: "paused"; revision: number; remainingMs: number }
  | { version: 1; state: "expired"; revision: number; expiredAt: number };
```

**Assignment:**

- Derive running remaining time from timestamps and injected clock; never persist/decrement a per-second counter.
- Automatic rest starts only under the locked next-work/between-exercise rules; manual rest is a separate command using configured duration.
- Pause/resume, ±15 seconds, skip, expiry, finish/discard, and Undo persist before notification reconciliation.
- Notification desired state is none for idle/paused/expired and exactly one stable `rest:<sessionId>` request for future running rest.
- Payload includes version, session ID, and rest revision; stale/late payloads never mutate workout facts.
- Reconcile after relevant commits, launch, foreground, permission change, Undo, finish/discard. If time expired, invoke a domain command before adapter cancellation.
- Do not declare exact-alarm permissions. Notification denial is non-blocking.

**Test placement:** fake-clock state-machine tables; adapter contract for list/cancel/schedule idempotency; denied/stale/late/revision cases; Maestro flows for active draft, running/paused/expired rest, save failure, `Home -> killApp -> launchApp`, rotation, and reboot-then-launch wording.

**Platform seam:** React Native `AppState` and Expo Notifications feed lifecycle triggers and implement ports; they do not own rest transitions.

**No code analog:** use Expo Notifications official API plus project reconciliation policy.

### 01-10 Outcomes and Progression Closure

**File group:** outcome transition rules/commands, completion and session-detail queries/routes/components, effort input, `load_reps` recommendation/decision, end-to-end/performance gates.

**Canonical pattern:** `01-UI-SPEC.md` lines 608-788; `01-RESEARCH.md` lines 621-629 and 644-659.

**Assignment:**

- Model explicit session and exercise outcomes; partial and zero-set outcomes require direct user intent, and discard requires destructive confirmation.
- Completion/detail queries use immutable session snapshots and authoritative facts, not current plan/content names.
- Keep Phase 1 session detail read-only except valid Resume; manual visit and voided status are distinguishable but not creatable/mutable.
- Preserve `N/N (100%)` formatting for completed planned counts.
- Compute `load_reps` recommendation deterministically from comparable working sets only; exclude warm-ups and incomplete exposures.
- Canonical fixture: `8 / 8 / 7 at 60 kg` -> hold `60 kg`, target `8 / 8 / 8`.
- Recommendation acceptance is a revision-checked transaction. Current target remains unchanged until acceptance commits.
- Derived-summary/recommendation failure cannot hide or revert the already committed workout outcome.

**Data flow:** committed session facts -> pure result/recommendation transform -> completion query -> optional effort/decision command -> revision-checked target update -> exact invalidation.

**Test placement:** table-driven outcome transitions; completion/session-detail read-model integration; all effort/recommendation fixtures; stale target acceptance; RNTL completion/detail/error states; Maestro repeated full loop in airplane mode; measured set-commit p95 and physical-device evidence.

**Platform seam:** performance clock/reporting and airplane-mode/device control stay in tests/tooling; progression rules remain pure TypeScript.

**No code analog:** use the locked UI and deterministic research fixture.

## Shared Patterns

### Authoritative Commit Response

**Apply to:** every source mutation.

```text
validate -> enqueue FIFO -> BEGIN IMMEDIATE
-> write source facts and durable effects
-> COMMIT
-> return committed state and exact invalidation scopes
-> run UI, haptic, notification, and cache work
```

No optimistic source mutation is permitted. TanStack Query is a disposable read cache only.

### Typed Boundary Validation

**Apply to:** persisted rows, effect payloads, content assets, notification payloads, native bridge input/output, and test-seed input.

Use versioned Zod schemas at the boundary, then pass pure validated values inward. Unknown versions and malformed rows fail with typed, redacted errors.

### Errors and Diagnostics

**Apply to:** commands, queries, migrations, effects, native adapters, and root/local UI failures.

- Translate technology errors at adapter boundaries.
- Render actions from typed retry metadata, never raw message matching.
- Log stable category/correlation/revision/timing fields only.
- Never log SQL parameters, set payloads, notes, passwords, keys, or plaintext.

### Query Invalidation

**Apply to:** committed commands and completed effects.

Commands return exact affected query scopes. Do not use a global database change listener and do not persist the query cache.

### Test Seed and Native Contracts

**Apply to:** `app/__native-contracts.tsx`, scripts, and Maestro.

The development-test-only route runs shared contracts against production adapters and emits bounded machine-readable results. Test setup enters through supported public test application commands; Maestro never executes arbitrary SQL. Assert that the route is absent from non-development-test artifacts.

### Accessibility

**Apply to:** all Phase 1 routes and components.

One announced heading per route, visible labels on root navigation, semantic actions sharing the same command, deterministic focus restoration, no timer-tick live region, non-color cues, reduced-motion behavior, 48dp minimum targets, and 200% text without clipping are implementation requirements, not later QA cleanup.

## No Analog Found

| File/Module Role | Reason | Canonical Pattern |
|---|---|---|
| Expo Router shell and screens | No application scaffold exists | Expo Router SDK 57 guidance + `01-UI-SPEC.md` |
| Theme, primitives, adaptive/accessibility UI | No UI source exists | `01-UI-SPEC.md` |
| Domain contracts/rules/commands/ports | No domain source exists | `.planning/research/ARCHITECTURE.md` dependency rule |
| SQLite writer/reader/kernel | No persistence source exists | Phase research private-writer correction + SQLite docs |
| Migrations and durable effects | No schema/source exists | Phase research migration/outbox pattern |
| Content seed and copied plans | No assets/domain source exists | Phase research ownership/activation pattern; exact seed still blocked |
| Workout set/draft/Undo path | No workout source exists | Phase research complete-set flow + UI dock contract |
| Rest and notification reconciliation | No platform source exists | Project timestamp/revision policy + Expo Notifications |
| Progression and outcomes | No progression/history source exists | Locked `load_reps` fixture + UI completion contract |
| Argon2 local module | No native module exists | Expo Modules + Bouncy Castle + RFC 9106 |
| Jest/RNTL/SQLite/Maestro tests | No test harness exists | Phase validation architecture and official tool guidance |

## Planner Guardrails

- Do not claim an in-repo application analog until implementation exists.
- Do not invent Full Body Foundation exercise content; make fixture approval a blocking task in 01-07.
- Do not begin feature writes before 01-04 passes the actual Expo SQLite contract.
- Do not generalize future catalog, history correction, Progress, backup UI, or release promotion into Phase 1.
- Do not use `withExclusiveTransactionAsync()` as the integrity kernel.
- Do not let UI, notifications, haptics, caches, or projections become workout truth.
- Do not put platform imports in pure domain rules or SQL in screens/hooks.
- Do not use mocked Expo modules as native proof.

## Metadata

**Analog search scope:** all tracked repository files
**Tracked application files scanned:** 0
**Operational files inspected:** `.githooks/commit-msg`, `scripts/install-git-hooks.sh`
**Canonical planning/research files:** `01-CONTEXT.md`, `01-RESEARCH.md`, `01-UI-SPEC.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`
**Pattern extraction date:** 2026-08-16
