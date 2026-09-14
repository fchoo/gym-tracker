# Phase 2: Owned Library and Planning - Research

**Researched:** 2026-08-17  
**Domain:** Offline exercise catalog, SQLite FTS5, versioned workout metrics, owned plan graphs, and calendar-safe scheduling  
**Confidence:** HIGH for platform/codebase architecture; MEDIUM for the exact reviewed catalog subset and starter content until their human acceptance artifacts are signed

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Plan Ownership and Activation
- **D-01:** Exactly one plan schedule is active at a time.
- **D-02:** Activating a starter template that already has user-owned copies asks the owner to reactivate an existing copy or create another independent copy; it never silently chooses.
- **D-03:** Switching plans keeps the previous user-owned plan and its schedule state, but marks that schedule inactive. It does not reset or archive the plan.
- **D-04:** Plan switching is blocked while a workout is in progress. The owner must Resume, Finish partial, or Discard before switching.
- **D-05:** Activation uses a confirmation preview. It defaults the start date to today, permits editing the date and switching between the template's suggested Weekday or Rotation configuration, and commits only after confirmation.

### Library Information Architecture
- **D-06:** Library opens Plans on first use, then remembers the last opened `Plans | Exercises` section across later launches.
- **D-07:** With no plan search, order sections as Active Plan, My Plans, then Starter Plans.
- **D-08:** With no exercise search or filters, show separate Favorites and Recent sections followed by All Exercises.
- **D-09:** Preserve each section's query, filters, and scroll position while opening details or switching sections in the running app, but reset transient query/filter/scroll state after a full app restart. The last opened Plans/Exercises section remains persisted per D-06.
- **D-10:** Archived plans/exercises and hidden exercises are excluded by default and exposed through Visibility filters. Unavailable built-in exercises remain reachable from existing references and through an explicit Unavailable filter.

### Exercise Discovery, Filters, and Attribution
- **D-11:** Search ranking is deterministic: exact canonical-name match, canonical-name prefix, alias exact/prefix, then remaining normalized partial matches. Stable alphabetical canonical name and stable ID break ties. Favorites and recency never outrank text relevance.
- **D-12:** `Recent` means a completed working-set exposure in a completed or partial session, ordered by the most recent exposure and capped at 10 unique exercises. Merely opening or selecting an exercise does not count.
- **D-13:** Favorites are an explicit persistent owner-controlled flag exposed as an accessible row action and a filter. They do not alter text-search relevance.
- **D-14:** Multiple selected values combine with OR inside one taxonomy category and AND across categories.
- **D-15:** Rows show compact `Built-in` or `Custom` origin only when relevant. Exercise detail shows source pack, revision, license, attribution, and unavailable status. Starter preview/detail shows source notes.
- **D-16:** When an alias caused a match, show the canonical exercise name with `Matched alias: …` as secondary text.
- **D-17:** A likely duplicate custom exercise triggers a warning based on normalized name plus similar metric/equipment, displays existing matches, and allows creation after explicit confirmation.

### Starter Discovery and New Plans
- **D-18:** Starter ordering uses deterministic fit based on the selected goal, experience, and available equipment, followed by remaining templates. Each recommendation includes a short `Why this fits` explanation; this is not generative or opaque ranking.
- **D-19:** Starter browsing offers optional combinable Goal, Experience, Days per week, and Equipment filters plus one `Clear filters` action.
- **D-20:** Starter activation preview shows goal, experience, equipment, estimated duration, all days and exercises, metric types, schedule suggestion, progression summary, and source notes.
- **D-21:** `Create my own` starts with a plan name and first day name, creates an explicit draft, then opens the day editor. The plan remains inactive until explicitly scheduled.
- **D-22:** A draft may contain one named empty day, but scheduling/activation requires at least one day containing an exercise with valid targets. Invalid drafts remain visible in My Plans with a `Draft` label, the exact missing requirement, and disabled Schedule/Activate actions.

### Editing, Reordering, Duplication, and Lifecycle
- **D-23:** Plan, day, target, schedule, and exercise forms use explicit `Save`; the whole validated edit commits atomically. Fields are not persisted independently on blur or debounce.
- **D-24:** Leaving a dirty editor prompts `Save changes`, `Discard`, or `Keep editing`.
- **D-25:** Reordering provides drag handles and accessible `Move up` / `Move down` actions. Reordering changes the draft and persists only with Save.
- **D-26:** Plan duplication copies the full editable graph—days, exercise order, targets, warm-ups, rest, policies, and schedule defaults—into fresh user-owned IDs and leaves the duplicate inactive.
- **D-27:** Bundled exercises can be hidden but not edited in place. `Create custom copy` creates an independent user-owned exercise for modification.
- **D-28:** Custom exercises and user-owned plans can be archived and restored. Phase 2 exposes no permanent deletion.
- **D-29:** Archiving a custom exercise previews affected plans, removes it from new selection, and leaves existing plans runnable with an `Archived` label until restored or replaced.
- **D-30:** The active plan may be edited when no workout is running. Future-facing changes save atomically; the active schedule is preserved unless structural changes require an explicit schedule-impact review.
- **D-31:** A plan used by an in-progress workout remains editable because the workout uses immutable snapshots. Show `Current workout is unaffected`; block only edits that require restructuring the active schedule until the workout resolves.
- **D-32:** Deleting a day with active schedule bindings requires an impact preview and an explicit replacement, removal, or effective-date choice before Save.

### Custom Metric-Profile Changes
- **D-33:** Metric selection for a new custom exercise is explicit. Present plain-language profile choices with example inputs and comparison behavior; do not infer a profile or default to load/reps.
- **D-34:** A custom exercise's metric profile may change after use, but this is an explicit migration of future plan targets and defaults only. Completed and in-progress session snapshots and observations are immutable. — **Reversibility:** one-way — a committed profile migration changes versioned future target contracts and cannot reconstruct discarded old future targets without another explicit migration.
- **D-35:** Block metric-profile migration while any workout using the exercise is in progress.
- **D-36:** Require the owner to review and enter valid replacement defaults for every affected plan target. Never infer values across profiles.
- **D-37:** Preserve historical observations under the same exercise identity but segment Best/Average/Last and comparable exposure by metric-profile version. Never compare or aggregate across profiles.
- **D-38:** Invalidate pending recommendations and incompatible progression policies, require a valid new policy or manual Hold, and establish a fresh baseline after migration.
- **D-39:** Before saving a profile change, explain that future plan targets migrate while history never changes.

### Schedule Setup and Effective Changes
- **D-40:** Initial schedule setup preselects the starter's suggested mode and bindings but permits changing Weekday/Rotation and bindings before activation.
- **D-41:** Later schedule edits show before/after state and an effective local date, defaulting to today. They are prospective and never rewrite earlier dates, opportunities, sessions, or history.
- **D-42:** Completing the currently scheduled Rotation day advances automatically. `Repeat` keeps the pointer; `Skip` records an explicit skipped opportunity and advances; `Advance` moves the pointer without creating a workout.
- **D-43:** A date override can choose another plan day, Rest day, or explicit Skip. Training another day or an empty workout does not advance or rebind the schedule unless the owner explicitly chooses `Advance rotation after this workout`.
- **D-44:** Exactly one effective override exists per local date. Editing may replace a pending override with confirmation. A consumed override remains immutable historical fact; later intent requires a new explicit action.
- **D-45:** In Weekday mode, Skip records an explicit skipped opportunity for that date only. It never moves the workout or removes the recurring weekday binding.
- **D-46:** Missed weekday opportunities remain `Planned but not completed`; they do not carry forward, become silently skipped, or block later plan days.

### Timezone, Midnight, and DST
- **D-47:** A session's start local date remains authoritative if the workout crosses midnight. Completion does not split or move it.
- **D-48:** Resolve weekday intent from local date and weekday in the schedule's stored timezone. DST may change instants but never the intended calendar day.
- **D-49:** On a device-timezone change, preserve the schedule timezone and prompt once: `Follow device timezone from today` or `Keep current timezone`. Any accepted change is prospective; prior local dates are immutable.

### Content Packs and Replacements
- **D-50:** A content-pack update installs only after complete validation and atomic import. Afterward, Library shows a non-blocking summary of added, updated, and newly unavailable built-in exercises.
- **D-51:** An upstream removal becomes `Unavailable`: preserve stable identity and attribution, keep existing plans runnable, and exclude the item from new selection by default. Never auto-replace or remove it from plans.
- **D-52:** Replacing a plan exercise shows compatible profiles first and requires explicit review of target, warm-ups, rest, and progression. Never infer comparability or migrate history.
- **D-53:** Replacement offers `This occurrence` or `All occurrences in this plan` and shows an impact preview before Save.
- **D-54:** Starter-template updates never mutate existing user-owned copies. Show `Template update available` with a diff and offer creating a new independent copy for comparison.

### Claude's Discretion
- Exact visual treatment and iconography within the approved precision-instrument design system and Phase 2 UI contract.
- Exact normalized-text function and FTS query construction, provided the locked relevance order, punctuation safety, stable pagination, transactional parity, and deterministic rebuild contracts hold.
- Exact compatible-exercise ranking beneath the hard metric-profile compatibility boundary.
- Exact wording of validation, impact-preview, and migration explanations, while preserving the literal labels and semantics recorded above.

### Deferred Ideas (OUT OF SCOPE)
- Calendar correction, reversible session removal, and date-history editing remain Phase 3.
- Overall period analytics and complete recommendation lifecycle remain Phase 4.
- Backup/restore reconciliation, CSV, and public release remain Phase 5.
- Permanent deletion, cross-profile history conversion, automatic plan/template merging, automatic exercise substitution, AI plan generation, media without separately verified licensing, and cloud/social features remain outside Phase 2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-01 | Library combines a visible Plans and Exercises switch and remembers the last opened section. | Reuse the four-root Expo Router shell, persist only the selected section in authoritative settings, and keep query/filter/scroll state process-local. |
| LIB-02 | App ships at least 300 reviewed common exercises with stable IDs, aliases, type, muscle groups, equipment, metric profile, source revision, license, and attribution. | Pinned Git provenance, app-owned review overlay, deterministic generated content pack, Phase 1 identity preservation, and license/attribution manifest. |
| LIB-03 | Owner can search exercises by partial name or alias and filter by type, muscle group, equipment, origin, visibility, recent use, and favorite status. | Relational source tables, deterministic normalization/ranking, category-specific filter predicates, explicit owner preferences, and completed-exposure Recent query. |
| LIB-04 | Search keeps relational rows authoritative, synchronizes FTS in the same write transaction, paginates results, handles punctuation safely, and can rebuild the FTS index. | FTS5 candidate index, authoritative search-term rows, triggers within the serialized writer transaction, normalized bound queries, keyset cursor, integrity diagnostics, and rebuild command. |
| LIB-05 | Owner can create, edit, hide, and archive custom exercises with an explicit metric profile and manual progression when no policy is configured. | Ownership-specific command ports, duplicate warning, explicit metric registry selection, archive/restore state, affected-plan preview, and manual-Hold fallback. |
| LIB-06 | App ships six original starter-plan templates with goal, experience, schedule, equipment, source notes, explicit metric semantics, and progression policies, including an equipment-heavy weekday body-part split. | Versioned starter schema, profile-coverage matrix, checked catalog-reference gate, original source notes, and required human acceptance artifact for exact substitutions/targets. |
| LIB-07 | Activating any starter template clones its plan, days, targets, schedule defaults, and source attribution into user-owned rows. | Generalize the existing Full Body Foundation clone transaction; copy the complete editable graph and retain source template/revision without future mutation. |
| LIB-08 | Owner can create, rename, duplicate, reorder, edit, schedule, and archive user-owned plans and plan days. | Aggregate-edit commands with explicit Save, optimistic revisions, full-graph duplication, draft validity, lifecycle state, and schedule-impact preview. |
| LIB-09 | Scheduling supports weekday and rotation modes, date overrides, repeat, explicit skip/advance, rest day, Train anyway, local midnight, DST, and timezone behavior without silent schedule rewrites. | Effective-dated schedule versions, immutable opportunities/events/consumed overrides, calendar-date utilities, rotation pointer rules, and timezone-change prompts. |
| LIB-10 | Content-pack upgrades can update only bundled rows, preserve custom/copied rows and historical snapshots, and retain removed sources as unavailable. | Staged full validation, origin-scoped upsert policy, unavailable transition, same-transaction import, immutable session snapshots, and post-commit summary. |
| LIB-11 | Each supported metric profile has versioned observation and aggregate contracts, comparator direction, average population, precision, tie order, and comparable-exposure rules. | Metric registry keyed by profile/contract version plus exercise metric-generation, complete comparator table, deterministic ties/rounding, and no cross-version aggregation. |
| LIB-12 | App supports load/reps, bodyweight reps, added load/reps, assisted reps, timed hold, fixed distance, fixed time, intervals, and unscored observations needed by approved plans. | Nine-profile boundary schemas, plan-target schemas, snapshot fields, SetRow adapters, starter profile coverage, and cross-profile native/E2E fixtures. |
</phase_requirements>

## Project Constraints (from `.trae/rules/rules.md`)

- [VERIFIED: `.trae/rules/rules.md:3-14`] Read and follow `AGENTS.md`; use the approved product/design contract, engineering QA plan, core-workout reference, and app-system reference as source documents.
- [VERIFIED: `.trae/rules/rules.md:18-23`] Keep SQLite source facts authoritative; keep notifications, projections, and recommendations replayable/rebuildable; never acknowledge a set before its exclusive transaction commits; preserve bundled/user-owned boundaries; keep the workout critical path offline; write tests with each behavior and give integrity-critical modules complete branch coverage.
- [VERIFIED: `AGENTS.md:5-18`] Architecture work routes through `gstack-plan-eng-review`; design work follows the approved design review/UI contract; bugs, QA, review, and shipping use their named gstack workflows.
- [VERIFIED: `.planning/config.json:20-49`] Nyquist validation, UI safety, plan checking, verification, code review, and security enforcement are enabled.
- [VERIFIED: `02-UI-SPEC.md:68-68`] The retired set editor/action dock remains excluded; Active Workout retains inline values plus adjacent `Complete` and `Skip`, with `Retry` directly below the set list.
- [VERIFIED: `02-UI-SPEC.md:72-87`] Reuse the repository-owned React Native design system and Lucide icons; add no component framework, utility-class layer, shadcn, Radix, or parallel visual system.

## Summary

[VERIFIED: `src/platform/sqlite/migrations/index.ts:1-9`] The released database is currently at three ordered migrations—verbatim: `"initialMigration"`, `"outcomeEffortMigration"`, and `"exerciseHistoryIndexMigration"`. [VERIFIED: `src/platform/sqlite/migrations/0001_initial.ts:15-35,61-79,165-217`] Its source schema only accepts exercise/session metric profiles `"load_reps"` and `"timed_hold"`, and its schedule mode is constrained to `"weekday"`. Phase 2 therefore requires forward-only structural migrations; simply adding TypeScript unions or UI controls cannot satisfy LIB-09/LIB-12.

[VERIFIED: pinned `kinetic-place/exercises-db` Git revision `1783421f145e546fa168c591a0e4d11cae6f23df`] The official pinned tree contains 899 English rows, 17 muscle groups, 36 equipment records, unique stable UUIDs, and an MIT license. It does **not** contain aliases, and all 899 exercise rows use the coarse source value `"type": "reps"`, including cardio rows. The app must therefore own a reviewed overlay for inclusion, canonical naming, aliases, normalized taxonomy, metric profile/version, defaults, availability, and source-to-app identity. [VERIFIED: npm registry + package-legitimacy seam] The README-advertised `@kinetic-place/exercises-db` package currently returns npm 404 and a `SLOP` verdict, so the implementation must not install it; generate and commit the pack from the pinned Git tree instead.

[VERIFIED: `node_modules/expo-sqlite/vendor/sqlite3/sqlite3.h:149-151`, `node_modules/expo-sqlite/android/build.gradle:26-32`, retained Phase 1 APK binary] Pinned `expo-sqlite` 57.0.1 vendors SQLite `3.50.3`, enables `SQLITE_ENABLE_FTS5`, and the retained Android APK contains `ENABLE_FTS5`. [CITED: https://www.sqlite.org/fts5.html#the_trigram_tokenizer] FTS5 trigram supports arbitrary substring matching but returns no MATCH results for substrings shorter than three Unicode characters. The recommended contract is therefore trigram FTS candidate retrieval for normalized queries of three or more code points, a bounded relational `LIKE` fallback for one- and two-code-point queries, and relational calculation of the locked four relevance tiers. FTS/BM25 must not determine the product ranking.

[VERIFIED: `src/domains/workout/activeWorkout.ts:11-47`] Phase 1 already persisted `"timed_hold"` version `1` with `durationSeconds`, while the approved pre-git design proposed `durationMs` for its unified V1 contract. Reusing the numeric version with new units would reinterpret history. Preserve the shipped timed-hold V1 parser, add a future milliseconds contract under a new contract version, snapshot both metric contract version and per-exercise metric-generation, and never convert historical session JSON.

**Primary recommendation:** Treat Phase 2 as seven contract-first slices: freeze the reviewed content artifact and identity reconciliation; prove native FTS; implement the nine-profile registry and migrations; then build Exercise Library, starter activation, owned plan editing, and finally effective-dated scheduling—closing with a new source-digest-bound Phase 2 APK because packaged runtime code/assets necessarily change.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Catalog provenance, reviewed subset, starter fixtures | CDN / Static (committed assets) | API / Backend-equivalent domain layer | Maintainer-time generation creates immutable checked assets; the installed app never fetches runtime catalog data. |
| Content validation/import and ownership policy | API / Backend-equivalent application layer | Database / Storage | Commands validate complete assets and enforce origin-specific writes before one SQLite transaction. |
| Exercise relational facts and FTS derivative | Database / Storage | API / Backend-equivalent query layer | SQLite owns exercise/alias/taxonomy/preferences; FTS is rebuildable candidate retrieval. |
| Search normalization, ranking, filters, cursor | API / Backend-equivalent domain/query layer | Database / Storage | The locked relevance order and Boolean filter semantics are product rules; SQL executes them against source tables/FTS candidates. |
| Metric schemas, comparators, aggregates, migrations | API / Backend-equivalent domain layer | Database / Storage | Pure versioned rules own meaning; SQLite snapshots exact profile/contract/generation values. |
| Starter and owned plan graph commands | API / Backend-equivalent application layer | Database / Storage | Clone/edit/duplicate/archive are atomic graph operations over narrow repository ports. |
| Weekday/rotation/date/timezone rules | API / Backend-equivalent domain layer | Database / Storage | Calendar intent is a pure state machine; schedule versions, opportunities, events, and overrides persist source facts. |
| Library/editor presentation and transient state | Browser / Client | API / Backend-equivalent query layer | React Native renders approved states; only the selected Plans/Exercises section persists, while query/filter/scroll stays process-local. |
| Native SQLite/Android evidence | Database / Storage + Android runtime | CI / test tooling | Host SQLite is insufficient proof for packaged FTS, migrations, and lifecycle behavior. |

## Critical Live-Code Constraints

### Source-of-Truth Values Read This Session

- [VERIFIED: `src/domains/plans/index.ts:3-27`] Current plan contracts quote origins `"bundled" | "custom" | "copied"` and schedule mode `"weekday"`.
- [VERIFIED: `src/platform/sqlite/migrations/0001_initial.ts:18-35`] Current exercise ownership values are verbatim `"bundled"`, `"custom"`, and `"copied"`; custom rows currently require null source identity, while bundled/copied rows require source namespace and upstream ID.
- [VERIFIED: `src/platform/sqlite/migrations/0001_initial.ts:22-24,174-176`] Current persisted metric values are verbatim `"load_reps"` and `"timed_hold"`.
- [VERIFIED: `src/domains/workout/activeWorkout.ts:1-28`] Current working-set source values are verbatim `"recommended"`, `"last_workout"`, `"plan_default"`, and `"manual"`; observations are `"load_reps"` V1 with `loadGrams`/`reps` and `"timed_hold"` V1 with `durationSeconds`.
- [VERIFIED: `src/domains/workout/outcomes.ts:1-18`] Current session statuses are verbatim `"in_progress"`, `"completed"`, `"partial"`, `"discarded"`, `"voided"`, `"manual_visit"`, and `"zero_sets"`; outcome actions are `"finish_completed"`, `"finish_partial"`, `"save_zero_sets"`, `"discard"`, and `"resume_partial"`.
- [VERIFIED: `src/platform/sqlite/serializedWriter.ts:6-8,46-73`] All source writes use verbatim SQL controls `"BEGIN IMMEDIATE"`, `"COMMIT"`, and `"ROLLBACK"` and return only after commit resolves.
- [VERIFIED: `src/domains/content/index.ts:3-99`] The Phase 1 content boundary is hard-coded to weekdays `"Monday"`, `"Wednesday"`, `"Friday"`, two days `"Full Body A"` / `"Full Body B"`, and policies `"load_reps.double_progression.v1"` / `"timed_hold.v1"`.
- [VERIFIED: `src/bootstrap/workoutAppRuntime.tsx:121-123`] The authoritative database filename is verbatim `"gym-tracker.db"` and the runtime imports `assets/content/full-body-foundation.v1.json` directly.

### Consequences for Planning

1. **Do not edit `0001_initial.ts` in place.** The migration manifest is released and retained fixtures depend on it. Create numbered forward migrations and retain every old fixture.
2. **Plan table rebuilds before UI breadth.** SQLite cannot widen existing `CHECK` constraints for nine metric profiles or rotation mode with a simple column addition. Mark the migrations that rebuild constrained source tables as `destructive` so the existing migration runner creates/validates its internal recovery backup first.
3. **Preserve Phase 1 exercise IDs and namespaces.** The ten starter exercise IDs are already referenced by copied plan rows and sessions. Do not replace them with Kinetic UUIDs. Keep them as `gym-tracker.original` content and map/exclude reviewed upstream equivalents separately.
4. **Keep old metric JSON parsers forever.** New storage units or fields require a new contract version; historical `target_json`, `observed_json`, and session snapshots are immutable.
5. **Generalize the runtime, do not grow one repository.** `plansWorkoutRepository.ts` currently mixes import, activation, Today, schedule, and workout-start behavior. Split Phase 2 content, Library query, plan editing, metric, and scheduling ports while preserving public domain boundaries and the serialized kernel.

## Standard Stack

### Core

| Library / Runtime | Pinned Version | Purpose | Planning Direction |
|---|---:|---|---|
| Expo | `~57.0.13` | CNG application/runtime | Keep pinned; Phase 2 changes app assets/routes but needs no Expo upgrade. [VERIFIED: `package.json:41-57`] |
| React Native | `0.86.2` | Android UI and accessibility | Reuse existing primitives and current accessibility APIs. [VERIFIED: `package.json:59-66`] |
| Expo Router | `~57.0.13` | Four roots plus nested detail/editor routes | Preserve exactly Today, Calendar, Library, Progress; route files stay thin. [VERIFIED: `package.json:53-53`, `app/(tabs)/_layout.tsx:20-41`] |
| Expo SQLite | `~57.0.1` / SQLite `3.50.3` | Source facts, migrations, FTS5 | Keep the custom private writer and explicit transactions; add a native FTS contract. [VERIFIED: `package.json:55-55`, installed package source, retained APK] |
| Zod | `4.4.3` | Versioned asset/persistence boundaries | Expand into catalog, metric, target, policy, schedule, cursor, and update-summary schemas. [VERIFIED: `package.json:67-67`] |
| React Query | `5.101.4` | Disposable read cache | Use exact key factories/invalidation only; no optimistic source writes and no persisted Library cache. [VERIFIED: `package.json:44-44`] |

### Supporting

| Library / Tool | Pinned Version | Purpose | When to Use |
|---|---:|---|---|
| Jest / jest-expo | `29.7.0` / `~57.0.4` | Unit, component, host SQLite, integration | Pure comparator/schedule tables, command contracts, retained migrations, and UI states. [VERIFIED: `package.json:69-75`] |
| React Native Testing Library | `14.0.1` | Semantic component verification | Segmented control, filters, editors, impact previews, 200% text, focus/state labels. [VERIFIED: `package.json:70-70`] |
| Maestro | `2.8.0` | Installed Android journeys | Phase 1 regression plus Library/activation/editor/schedule/profile flows. [VERIFIED: `.github/workflows/pr.yml:13-20`, local CLI probe] |
| Host SQLite | `3.51.0` locally | Fast SQL/migration/FTS contracts | Development feedback only; packaged Android SQLite remains the release authority. [VERIFIED: local CLI probe] |
| Lucide React Native | `1.31.0` | Approved icon vocabulary | Reuse only mappings in the UI-SPEC; no new icon system. [VERIFIED: `package.json:58-58`] |

### Alternatives Considered

| Instead of | Could Use | Why Not Here |
|------------|-----------|--------------|
| Pinned Git source + committed generated pack | `@kinetic-place/exercises-db` npm install | Registry lookup is 404 and legitimacy is `SLOP`; remove this installation path entirely. |
| SQLite FTS5 trigram candidate index | JavaScript full-catalog filtering | It duplicates query semantics, hydrates unnecessary rows, and cannot prove relational/FTS parity. |
| Existing Expo/React Native stack | New ORM/search/date/state packages | No package is needed for the locked contracts; new dependencies increase native/runtime evidence scope without solving a missing primitive. |
| Effective-dated schedule facts | A mutable “current schedule” JSON blob | A blob cannot prove prospective changes, consumed override immutability, or opportunity history. |
| Versioned metric registry | One wide generic numeric record | It permits nonsensical cross-profile comparisons and silent unit reinterpretation. |

**Installation:** no external package installation is recommended for Phase 2.

### Registry Version Verification

Registry checks were run on 2026-08-17. Keep the Expo-compatible lockfile rather than upgrading individual packages during this phase.

| Package | Pinned | Pinned Publish Date | Registry Latest Checked | Direction |
|---|---:|---|---:|---|
| `expo` | `57.0.13` | 2026-08-14 | `57.0.13` | Keep |
| `expo-sqlite` | `57.0.1` | 2026-07-15 | `57.0.1` | Keep |
| `expo-router` | `57.0.13` | 2026-08-14 | `57.0.13` | Keep |
| `react` | `19.2.3` | 2025-12-11 | `19.2.8` | Keep the Expo-resolved pin |
| `react-native` | `0.86.2` | 2026-07-27 | `0.87.0` | Keep the Expo-resolved pin |
| `zod` | `4.4.3` | 2026-05-04 | `4.4.3` | Keep |
| `@tanstack/react-query` | `5.101.4` | 2026-07-21 | `5.101.4` | Keep |
| `@testing-library/react-native` | `14.0.1` | 2026-06-23 | `14.0.1` | Keep |
| `jest` | `29.7.0` | 2023-09-12 | `30.4.2` | Keep the `jest-expo`-compatible major |

## Package Legitimacy Audit

| Package | Registry | Source Repo | Verdict | Disposition |
|---------|----------|-------------|---------|-------------|
| `@kinetic-place/exercises-db` | npm: not found | `https://github.com/kinetic-place/exercises-db` | `SLOP` from package-legitimacy seam | **REMOVED as an installable dependency.** Read pinned Git source only and commit a generated artifact. |

**Packages removed due to `SLOP` verdict:** `@kinetic-place/exercises-db` as an npm dependency.  
**Packages flagged as suspicious for installation:** none; Phase 2 should add no package.

## Architecture Patterns

### System Architecture Diagram

```text
Maintainer-only update entry
  pinned Git revision + LICENSE + reviewed overlay + starter fixtures
      -> strict source/overlay validation
      -> deterministic normalize + diff + reviewer gate
      -> committed versioned content-pack asset
                                     |
Installed app launch / bundled update |
                                     v
  full asset validation outside write transaction
      -> serialized SQLite writer
      -> BEGIN IMMEDIATE
      -> bundled relational upsert + unavailable transitions
      -> authoritative search-term rows
      -> FTS triggers in the same transaction
      -> starter bundled graph upsert
      -> parity checks + COMMIT
      -> committed update summary
      -> exact query invalidation / non-blocking Library notice

Library input
  section + query + filters + cursor
      -> normalized bounded query
      -> [query >= 3 code points] FTS trigram candidates
         [query < 3 code points] bounded relational LIKE candidates
      -> relational relevance tier + taxonomy/ownership predicates
      -> stable keyset page of exercise IDs
      -> bounded row/taxonomy hydration
      -> React Native Library/detail/editor

Plan/schedule input
  explicit Save / Activate / Repeat / Skip / Advance / Override
      -> versioned domain validation + impact preview
      -> serialized transaction
      -> owned graph or effective-dated schedule facts
      -> immutable event/opportunity/override history
      -> COMMIT
      -> Today/Library refresh

Workout start
  current copied-plan target + schedule opportunity
      -> immutable exercise/profile/contract/generation/target/policy snapshots
      -> existing Phase 1 inline SetRow loop
      -> committed session outcome
      -> explicit schedule advancement event only when rules allow
```

### Recommended Project Structure

```text
assets/content/
├── exercise-library.v1.json
├── exercise-library.v1.manifest.json
├── exercise-library.v1.review.json
├── starter-plans.v2.json
└── third-party/kinetic-place-exercises-db.MIT.txt
scripts/content/
├── fetch-pinned-exercises.mjs
├── build-exercise-pack.mjs
├── diff-exercise-pack.mjs
└── validate-exercise-pack.mjs
src/domains/
├── content/          # source/overlay/pack contracts, import/update commands
├── library/          # search/filter/detail/custom lifecycle ports and rules
├── metrics/          # observation/target/aggregate registry and comparators
├── plans/            # starter activation, owned graph commands, draft validation
├── scheduling/       # LocalDate/timezone, schedule state machine, opportunities
└── workout/          # generalized snapshots and nine-profile set operations
src/platform/sqlite/
├── migrations/       # numbered forward migrations after 0003
└── repositories/     # content, library, plans, schedules, metric-aware workout
src/ui/
├── components/       # approved shared Phase 2 primitives
└── screens/          # Library, detail, editors, previews, schedule/migration flows
app/
├── (tabs)/library.tsx
└── library/          # thin detail/editor/activation/schedule routes
tests/
├── content/
├── migrations/fixtures/
├── sqlite-host/
└── integration/
maestro/phase2/
```

### Component Responsibilities

| Component | Owns | Must Not Own |
|---|---|---|
| Content generator | Pinned fetch verification, source parsing, overlay application, deterministic asset/diff | Runtime network fetch, user data, SQLite mutation |
| Content domain | Whole-pack validation, bundled-only update policy, update summary | Direct filesystem APIs or UI |
| Library domain/query | Normalization, ranking tiers, filter semantics, cursor contract, custom lifecycle | Raw Expo database objects |
| Metric registry | Parsers, targets, comparator/aggregate/format rules by version | React state or SQL |
| Plan domain | Draft validity, clone/duplicate/edit/archive/replace graph rules | Schedule calendar math |
| Scheduling domain | LocalDate, effective versions, overrides, opportunities/events, rotation transition | Device clock APIs or UI prompts |
| SQLite repositories | Parameterized source writes/queries, trigger-backed FTS sync, transactions | Product defaults, implicit conversion, UI state |
| Library UI | Approved layouts, explicit Save/impact flows, transient process state | SQL, persisted search cache, optimistic source mutation |

## Content Pack and Provenance Contract

### Verified Source Facts

- [CITED: https://github.com/kinetic-place/exercises-db/tree/1783421f145e546fa168c591a0e4d11cae6f23df] The exact reviewed revision is `1783421f145e546fa168c591a0e4d11cae6f23df`, committed 2026-04-01.
- [CITED: https://github.com/kinetic-place/exercises-db/blob/1783421f145e546fa168c591a0e4d11cae6f23df/LICENSE] License text is MIT, copyright 2026 Kinetic.place, and requires retaining the copyright and permission notice in copies/substantial portions.
- [VERIFIED: pinned source tree] SHA-256 values: `en/exercises.json` = `1a9f8edf72a6780ed2d0404a2792f0848b568a51634d2a03ab1408d4c27210d5`; `en/muscle_groups.json` = `b4a7c50798714ef7ccef91f6190d828073e96ed8e61abffe1db9e3500f2fd54e`; `en/equipment.json` = `0bb60c40e078ad73210793c11aaed80c2f8dd6a9316b0d67ba724519d84f6ef0`; `LICENSE` = `497dedffb4292e2b74e250f159ad8d70136564d6ccf13be604642350d34538e0`.
- [VERIFIED: pinned source tree] The 899 source UUIDs are unique and identical across English/Spanish rows by position; source fields are `id`, `name`, `type`, `difficultyLevel`, `forceType`, `mechanics`, `category`, `instructions`, `muscleGroups`, and `equipment`.
- [VERIFIED: pinned source tree] No alias field exists and all 899 `type` values are `"reps"`; source measurement type cannot be copied into the app metric profile.

### Prescribed Maintainer Workflow

1. Fetch the exact commit into a temporary directory and fail unless `git rev-parse HEAD` and all four recorded SHA-256 values match.
2. Parse source entities with a strict versioned Zod schema; validate UUID uniqueness, source relation IDs, required strings, instruction bounds, and known source enum values.
3. Apply a checked-in review overlay keyed by upstream UUID. The overlay must explicitly state inclusion/exclusion, app canonical name, aliases, app exercise type, movement class, primary/secondary muscles, equipment normalization, metric profile + contract version, default units/rest, app stable ID, and reviewer disposition.
4. Preserve all ten Phase 1 `gym-tracker.original` exercise IDs. Do not silently relabel them as Kinetic rows. A curator may link an upstream equivalent only after reviewing semantic identity; otherwise exclude the near-duplicate Kinetic row from the initial visible subset.
5. Require at least 300 included, fully reviewed rows; zero `needs review`; globally unique app IDs; non-empty canonical names; normalized-name/alias collision report; known taxonomy references; and a valid metric registry entry for every row.
6. Validate every starter plan reference, target schema, policy/version, substitution compatibility, and source note against the generated pack.
7. Generate the pack deterministically sorted by stable app ID, include source revision/file hashes/license/attribution, and fail if rebuilding from identical inputs changes bytes.
8. Diff against the previous pack by stable app ID: classify added, source-updated, attribution-updated, and newly unavailable. Never emit deletion for a previously shipped identity.
9. Commit the generated pack, review overlay, manifest, MIT notice, diff, and signed-off review summary. The app consumes only committed artifacts; it never runs Git/npm/network fetches.

### Required Relational Model

| Source Fact | Recommended Table/Field Direction |
|---|---|
| Pack provenance | Add a text-capable content revision/manifest table; do not overload the existing integer `content_packs.source_revision` with a Git SHA. |
| Exercise identity | Preserve `exercises.id` as app identity; keep `source_namespace` + `upstream_id` separate and unique for bundled source rows. |
| Availability | Store bundled `available` / `unavailable` as content authority; an upstream omission changes availability, never deletes the row. |
| Owner state | Separate per-exercise favorite/hidden/archive state from bundled source fields. Bundled hide/favorite mutates owner state only; custom archive mutates owner-owned lifecycle only. |
| Aliases | One authoritative alias row per exercise/ordinal with display and normalized forms; aliases are not a delimiter-concatenated exercise field. |
| Taxonomy | Normalized exercise type, movement class, muscle, equipment, and relation tables with source IDs/labels where applicable. |
| Search terms | One authoritative canonical/alias search-term row with integer row ID, exercise ID, kind, display text, and normalized text; FTS indexes these rows. |
| Review provenance | Pack manifest/review artifact records reviewer status and source hashes; do not put maintainer notes into user-editable exercise fields. |

### Atomic Update Algorithm

1. Parse and validate the complete asset before entering the write queue.
2. Enter the existing FIFO `BEGIN IMMEDIATE` kernel.
3. Verify pack revision monotonicity and source manifest.
4. Upsert only `origin='bundled'` rows in the pack namespace.
5. Mark previously bundled-but-absent source identities unavailable.
6. Never update custom/copied exercise fields, copied plans, plan targets, or any session snapshot.
7. Update aliases/taxonomy/search-term source rows; trigger-backed FTS changes occur in this same transaction.
8. Validate foreign keys, included counts, starter references, and relational/FTS parity before commit.
9. Commit, then return `{added, updated, unavailable}` and exact invalidation scopes.
10. Render `Exercise library updated` only from the committed result.

## FTS5 Search Contract

### Platform Facts

- [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#prepared-statements] Expo recommends prepared statements for user input and requires finalization; its `execAsync()` does not escape parameters.
- [CITED: https://www.sqlite.org/fts5.html#fts5_strings] FTS query strings have their own operator grammar; SQL parameter binding prevents SQL injection but does not make raw punctuation harmless inside MATCH syntax.
- [CITED: https://www.sqlite.org/fts5.html#the_trigram_tokenizer] Trigram supports substring matching and optional case-insensitive diacritic removal; MATCH tokens under three Unicode characters match no rows.
- [CITED: https://www.sqlite.org/fts5.html#external_content_table_pitfalls] External-content FTS consistency is the application’s responsibility and inconsistent indexes produce unintuitive results.
- [CITED: https://www.sqlite.org/fts5.html#the_integrity_check_command] `integrity-check` with rank `1` compares an external-content FTS index to its content table.
- [CITED: https://www.sqlite.org/fts5.html#the_rebuild_command] `rebuild` deletes and reconstructs an external-content index from authoritative content.
- [CITED: https://www.sqlite.org/fts5.html#the_bm25_function] Better SQLite FTS5 BM25 matches have numerically smaller scores. This score is not the locked product ranking.

### Prescribed Index

Use an external-content FTS5 table over authoritative `exercise_search_terms`, with one row per canonical name or alias and `tokenize='trigram remove_diacritics 1'`. Maintain it with insert/update/delete triggers created by the migration. Commands write only relational search-term rows; SQLite triggers update FTS inside the same explicit transaction.

Do not concatenate aliases into one opaque field and do not index taxonomy labels in FTS. Taxonomy remains relational so OR-within/AND-across filtering is exact.

### Normalization V1

`normalizeExerciseSearchTextV1` should be one pure function used by the content generator, custom exercise commands, duplicate detection, query building, and fixtures:

1. Unicode NFKD normalization.
2. Locale-independent lowercase.
3. Remove combining marks.
4. Replace every run that is not a Unicode letter or number with one ASCII space.
5. Trim and collapse spaces.

Persist both display text and normalized text. Version the function in the pack manifest and cursor fingerprint; changing normalization requires rebuilding authoritative normalized columns and then FTS.

### Query Construction and Ranking

1. Normalize the user query. Empty normalized text means default sections, not MATCH-all.
2. For one or two Unicode code points, use a bounded prepared relational `LIKE '%…%' ESCAPE '\'` scan across normalized canonical/alias rows. At 300–899 rows this is predictable and fills the documented trigram short-query gap.
3. For three or more code points, bind a safely quoted normalized phrase to MATCH to retrieve candidate term/exercise IDs. The normalizer removes FTS punctuation/operators; still quote the entire phrase and bind it.
4. Join candidates to authoritative exercise/alias/taxonomy/owner-state rows.
5. Compute the exact tier:
   - `0`: normalized canonical name equals query.
   - `1`: normalized canonical name starts with query.
   - `2`: at least one normalized alias equals or starts with query.
   - `3`: remaining canonical/alias substring candidate.
6. Sort by `(tier ASC, canonical_sort_key ASC, exercise_id ASC)`. Do not include BM25, favorite, recency, source order, or rowid in the product sort.
7. If an alias caused the best match, choose displayed alias deterministically: exact before prefix before contains, then normalized alias and stable alias ID. Display `Matched alias: …`; this alias selection does not alter row order.
8. Apply filter semantics with `EXISTS`/join predicates: selected values use OR within type/muscle/equipment/origin/visibility/recent/favorite groups and every non-empty group is ANDed.

### Stable Pagination

Use a versioned opaque keyset cursor containing:

- normalization version;
- query fingerprint;
- canonicalized filter fingerprint;
- content revision;
- final tier;
- canonical sort key;
- stable exercise ID.

Page size is 30 per the approved product contract. Reject/restart a cursor when the query/filter/content revision differs. Fetch stable IDs/ranking first, then hydrate only those IDs and required taxonomy. `OFFSET` is not the primary pagination contract.

### Parity and Repair

Diagnostics must report:

- SQLite version and `sqlite_compileoption_used('ENABLE_FTS5')`;
- authoritative search-term count and FTS row count;
- missing/extra search-term row IDs;
- missing/extra grouped exercise IDs;
- `integrity-check` result;
- content revision and normalization version;
- duration and bounded safe error code, never raw query text.

`rebuildExerciseSearch` runs through the serialized writer, executes the FTS5 rebuild special command, then repeats parity and integrity checks before commit. Add a launch-safe repair path only for detected derivative failure; FTS failure never mutates source rows.

## Metric Registry Contract

### Canonical Profile Names

[VERIFIED: `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md:451-466`] The approved profile values are verbatim:

```text
"load_reps"
"bodyweight_reps"
"added_load_reps"
"assisted_reps"
"timed_hold"
"fixed_distance"
"fixed_time"
"intervals"
"unscored"
```

### Version Keys

Every exercise/current target/session snapshot/observation must carry:

1. `profile` — one of the nine names.
2. `contractVersion` — parser/unit/schema version for that profile.
3. `exerciseMetricVersion` — monotonically increasing generation for that exercise identity, incremented by an explicit future-target profile migration.
4. `comparatorId` + `comparatorVersion` where comparison is plan-authored.

Comparable history requires all relevant keys to match. This is stricter than profile name alone and directly implements D-37.

### Legacy Compatibility

- [VERIFIED: `src/domains/workout/activeWorkout.ts:11-28`] Preserve `"load_reps"` contract V1 exactly as `loadGrams` + `reps`.
- [VERIFIED: `src/domains/workout/activeWorkout.ts:19-24`] Preserve shipped `"timed_hold"` contract V1 exactly as `durationSeconds`; never reinterpret those stored integers as milliseconds.
- New millisecond timed-hold observations use a new contract version. UI formatters normalize both versions to the same display without rewriting source history.
- Existing rows receive `exerciseMetricVersion = 1` and their existing contract version during migration.

### Comparator, Aggregate, Tie, and Exposure Matrix

The average population is completed working sets from comparable exposures only. A comparable exposure belongs to a `completed` or `partial` session, excludes warm-ups/skipped/draft/discarded/voided/zero-set rows, and has every planned working set for that exercise completed. Final deterministic tie fallback for every scored profile is most recent exposure timestamp, stable session ID, set ordinal, then stable set ID.

| Profile | Atomic Observation | Best Direction and Tie | Average | Additional Comparable Boundary |
|---|---|---|---|---|
| `load_reps` | nonnegative integer grams; positive integer reps | higher load, then higher reps | mean load and mean reps separately | same exercise metric generation, contract, and compatible load/reps comparator |
| `bodyweight_reps` | positive integer reps | higher reps | mean reps | same variation/comparator when a variation is target-significant |
| `added_load_reps` | nonnegative integer added grams; positive reps | higher added load, then higher reps | mean added load and mean reps | same bodyweight/added-load profile contract and comparator |
| `assisted_reps` | nonnegative integer assistance grams; positive reps | lower assistance **among sets meeting target**, then higher reps | mean assistance and mean reps | same assistance equipment/comparator; band levels are not silently converted to grams |
| `timed_hold` | positive duration in contract-defined base unit | longer duration | mean duration | same side/variation when target-significant |
| `fixed_distance` | positive integer distance meters and duration ms | lower duration | mean duration | equal planned distance |
| `fixed_time` | positive duration ms and nonnegative distance meters | greater distance | mean distance | equal planned duration |
| `intervals` | immutable protocol ID, completed rounds, completed work ms | execute stored plan-authored comparator; deterministic policy tie then common fallback | mean rounds and work ms separately | same protocol ID, comparator ID/version, work/rest structure |
| `unscored` | completion boolean | completion only; latest completion for Last | completion rate for aggregate use; UI Average is not applicable | completion history only; never feeds automatic progression |

[VERIFIED: approved design lines 515-522] Atomic values remain integer base units; aggregates may be fractional and are never written back as observations or targets. Presentation-only rounding is: configured precision for load/assistance, at most one decimal for repetition/round means, whole seconds below ten minutes and `mm:ss` otherwise, and configured unit precision for distance.

### Target and Policy Separation

Do not reuse observation schemas as complete plan-target schemas. Each profile needs:

- a versioned per-set target schema;
- a versioned unit/display schema;
- a policy descriptor or explicit manual Hold;
- target revision for stale-write protection;
- profile/contract/exercise metric version;
- comparator identity and any target-significant dimensions.

Fixed distance targets carry planned distance; fixed time targets carry planned duration; intervals reference an immutable protocol; assisted targets name the assistance equipment/step model; unscored has no automatic policy.

### Explicit Profile Migration Command

`migrateCustomExerciseMetricProfile` must:

1. Reject bundled exercises and reject when any in-progress session references the exercise.
2. Read every affected future plan occurrence/target/policy.
3. Require a valid owner-entered replacement target/default/policy for each occurrence; no cross-profile inference.
4. Preview affected plans and state that history remains unchanged.
5. In one transaction, increment the exercise metric generation, update only future exercise defaults/plan targets, replace/invalidate incompatible policies, invalidate pending recommendations, and preserve sessions/sets.
6. Commit before UI success; return exact invalidation scopes.
7. Produce a fresh baseline because no historical observation shares the new exercise metric generation.

## Starter Plan Contract

### Locked Template Intent

[VERIFIED: approved design lines 300-349 plus owner amendment D-55] The six original templates and their intent are:

| Template | Locked Audience / Goal | Suggested Schedule | Required Policy Direction |
|---|---|---|---|
| Full Body Foundation | beginner/returning; general strength, hypertrophy, consistency | three weekdays alternating A/B | resistance double progression; manual timed hold |
| Upper / Lower | intermediate; balanced strength/hypertrophy | Upper A, Lower A, Upper B, Lower B | exercise rep ranges and equipment increments |
| Push / Pull / Legs | movement-pattern trainee; hypertrophy-oriented | three-day Rotation | rep-range progression with accepted load changes |
| Minimal Equipment Full Body | home/hotel/limited equipment | three weekdays | reps, duration, resistance level, or harder variation |
| Strength + Conditioning | mixed general fitness | two resistance days plus one mixed conditioning day | resistance rules plus plan-authored duration/interval/distance |
| Gym Body-Part Split | intermediate; hypertrophy-oriented one-body-part focus using gym equipment | Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, Friday Arms | editable load/reps double progression for four weighted exercises per day |

### Required Fixture Shape

Each template fixture must include:

- stable template ID and source revision;
- display name, goal, experience, equipment, days/week, estimate, source notes;
- suggested Weekday and/or Rotation config with bindings;
- ordered days and occurrences;
- each occurrence’s stable reviewed catalog reference;
- explicit profile, contract version, exercise metric version, per-set targets, units, warm-ups, rest, comparator, and progression policy/version;
- reviewed compatible substitution references, each with target/warm-up/rest/policy review metadata;
- deterministic fit inputs and stable original template order.

### Profile Coverage Gate

Across the six templates, fixtures must exercise all nine profiles. A safe allocation is:

- Full Body Foundation: `load_reps`, legacy/new `timed_hold`;
- Upper / Lower: `load_reps`, `assisted_reps`;
- Push / Pull / Legs: `load_reps`, `bodyweight_reps`, `added_load_reps`;
- Minimal Equipment Full Body: `bodyweight_reps`, `timed_hold`, `unscored`;
- Strength + Conditioning: `load_reps`, `fixed_distance`, `fixed_time`, `intervals`.
- Gym Body-Part Split: `load_reps` only, emphasizing reviewed barbells, dumbbells, cables, machines, bench, and squat-rack equipment.

This allocation is a planning prescription, not permission to infer targets. Exact exercise substitutions, targets, assistance model, interval protocol/comparator, rests, and policy parameters require the checked starter-review artifact before 02-05 closes.

### Verified Candidate Catalog References

The following IDs exist at the pinned Kinetic revision and are suitable inputs to the review—not automatically approved substitutions:

| Upstream UUID | Source Name | Source Equipment |
|---|---|---|
| `605ab3e8-4491-4737-aa22-f06598adadf5` | Barbell Squat | Barbell |
| `d586b5aa-c2f4-4cb5-8038-d10b03c3b763` | Barbell Bench Press | Barbell |
| `15f4d417-d0fc-4e5d-b274-2f83a89f1c68` | Romanian Deadlift | Barbell |
| `e415dbf1-eb35-4d84-a126-bf4b4f3bb295` | Plank | Body Only |
| `13a0f0b4-8dc3-49fd-8cc8-984ed8864684` | Deadlift | Barbell |
| `eb5423a2-e3d3-4cfe-a6d9-c12ba3fcfe97` | Barbell Shoulder Press | Barbell |
| `1069769c-bde1-4d35-957f-070c23350968` | Seated Cable Rows | Cable |
| `040c3ef8-9101-4d01-a6e0-262695aefa9f` | Dumbbell Bench Press | Dumbbell |
| `25a42cb6-a4aa-4c88-a955-f131760c8a38` | One-Arm Dumbbell Row | Dumbbell |
| `eb499497-bc63-451d-9e3d-4e1ca6bfd6dc` | Wide-Grip Lat Pulldown | Cable |
| `95d63886-d777-414e-b6fd-89a09f251b91` | Dumbbell Lateral Raise | Dumbbell |
| `400b84e2-d746-49dc-af45-e1615fb00c71` | Triceps Pushdown | Cable |
| `e8db53da-73ac-4a4b-af78-132775a0cdbd` | Barbell Curl | Barbell |
| `89d7e2eb-bd09-46bb-9aa0-ad68550cb6c5` | Leg Press | Machine |
| `a7e1453b-9243-460d-94c5-59802178d804` | Lying Leg Curls | Machine |
| `ac6024f7-ab06-466a-88c2-7159cb149e93` | Standing Calf Raises | Machine |
| `384a3662-4207-409b-8fd1-5f118afe33cc` | Pushups | Body Only |
| `ace882b2-0462-4ff1-aba3-0d57d5d118a7` | Pullups | Body Only |
| `45e14530-4a8a-4f5a-80f9-94c807e4ad8f` | Band Assisted Pull-Up | Other |
| `c6378398-8c07-412a-b774-5499ce462abf` | Running, Treadmill | Machine |
| `32f4967a-cf3d-4830-80e6-d82172a49443` | Bicycling, Stationary | Machine |
| `d3328096-e7cf-4163-8772-7c16f4d02e1c` | Hamstring Stretch | Body Only |

[VERIFIED: pinned source audit] Generic Phase 1 names `Lat Pulldown`, `Overhead Press`, `Reverse Lunge`, and `Side Plank` do not all have exact source-name matches, and `Band Assisted Pull-Up` does not provide gram-based machine assistance semantics. Keep Phase 1 originals unless the review explicitly approves a mapping; never infer it from substring similarity.

### Activation and Template Updates

- Activation first validates the complete bundled graph, then asks existing-copy vs new-copy per D-02.
- New-copy activation creates fresh user-owned plan/day/occurrence/target/warm-up/policy/schedule IDs in one transaction and deactivates the old active schedule without deleting/resetting it.
- Reactivation preserves the chosen copy’s owned graph and schedule state, then applies the confirmed prospective start/mode changes.
- Store source template ID/revision on the copied plan for attribution/update comparison only.
- A newer starter revision computes a diff against the copied source revision; it never updates the copy. `Template update available` offers creating another copy.

## Owned Plan and Exercise Command Patterns

### Aggregate Save

Editors build a process-local draft. `Save plan`, `Save day`, `Save target`, `Save exercise`, and `Save schedule` submit one versioned aggregate command with expected revisions. The command validates the complete affected graph and writes it atomically. Blur/debounce may update local draft state only.

### Draft Validity

A created plan may persist one named empty day with lifecycle `Draft`. Scheduling/activation is disabled until at least one occurrence has one or more valid working-set targets and compatible metric/policy contracts. Persist a machine-readable validation code and derive the exact visible reason; do not store UI prose as truth.

### Full Duplication

Plan duplication copies:

- plan metadata and source attribution;
- days and ordinals;
- all occurrences and order;
- warm-ups/rest;
- every target/unit/profile/contract/exercise metric version;
- progression/comparator policy;
- schedule defaults, but no active status, consumed opportunities, overrides, sessions, or recommendations.

Every new row receives a fresh user-owned ID and revision. The duplicate remains inactive.

### Archive and Replacement

- Bundled hide/favorite uses owner preference and never edits source content.
- `Create custom copy` creates a new independent custom exercise with copied provenance notes but new identity/history.
- Custom exercise archive previews all plan occurrences, removes it from new selection, and leaves existing references runnable/labeled.
- Replacement filters hard by profile/contract compatibility first. It then requires explicit target/warm-up/rest/policy review and applies only the selected occurrence scope. It never moves history to the replacement.

## Scheduling Architecture

### Calendar Value Types

Use a validated `YYYY-MM-DD` `LocalDate` value for calendar identity and an IANA timezone string for interpretation. [CITED: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_components_and_time_zones] A JavaScript `Date` stores an instant, not a timezone; host local timezone is external and offsets vary by represented instant/DST. [CITED: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format] Date-only ISO strings parse as UTC.

Prescribe:

- parse/validate date components explicitly;
- perform add/difference/weekday calendar math with UTC component arithmetic, never `instant + 86_400_000` for schedule intent;
- derive local date for an instant and stored timezone through `Intl.DateTimeFormat(..., {timeZone, year, month, day}).formatToParts`;
- validate timezone by constructing the formatter;
- inject `Clock` and `DeviceTimeZonePort` into application commands/tests.

### Source Tables

| Fact | Required Persistence |
|---|---|
| Plan schedule identity | one schedule per owned plan, lifecycle active/inactive; unique partial index permits exactly one active schedule globally |
| Prospective edits | immutable/effective-dated schedule versions with mode, timezone, effective local date, revision, and created time |
| Weekday rules | bindings by schedule version, cycle week, weekday, plan day |
| Rotation rules | ordered bindings by schedule version plus current pointer/revision |
| Date override | one row per schedule/local date, kind plan-day/rest/skip, pending/consumed state; consumed rows immutable |
| Opportunity | immutable scheduled fact with local date, schedule/version, source, plan day/rest, status, and optional source session |
| Event | append-only activation/edit/timezone/repeat/skip/advance/completion record with before/after pointer where relevant |

### Weekday State Machine

- Resolve the binding from local date/weekday under the effective schedule version and stored timezone.
- Materialize a due opportunity idempotently.
- Completing another/empty workout does not consume it.
- Explicit Skip consumes only that date’s opportunity as skipped.
- Once the local date passes, an unconsumed due opportunity becomes `Planned but not completed`; it does not carry or block.
- Effective edits never update earlier opportunities.

### Rotation State Machine

- Activation creates the first current opportunity/pointer.
- Completing the currently scheduled plan day consumes it as completed and appends the next pointer/opportunity.
- `Repeat` records an event and preserves pointer/current opportunity.
- `Skip` consumes the current opportunity as skipped and advances.
- `Advance` records an event and advances without a workout.
- Alternate/rest-day/empty workouts do not advance unless `Advance rotation after this workout` is explicitly selected and committed with the session outcome.

### Overrides and Timezone Changes

- Pending override replacement is one transaction with before/after preview.
- Consuming an override links it to the immutable opportunity/session; no edit command accepts consumed state.
- On detected device-zone change, retain schedule timezone and prompt once for that detected change.
- `Follow device timezone from today` creates a new effective schedule version; `Keep current timezone` records the dismissed detected-zone fingerprint without schedule mutation.
- Session `local_date` captured at start remains unchanged across midnight and timezone changes.

## Migration Strategy

### Required Forward Migrations

The planner may split exact numbers, but preserve this dependency order:

1. **Content provenance/taxonomy/search source tables (additive):** manifest, aliases, taxonomy, owner state, authoritative search terms, review/update metadata.
2. **Exercise/plan lifecycle widening (destructive where CHECKs change):** widen metric profiles; add contract/generation/lifecycle/availability fields; add exactly-one-active-plan/schedule constraints.
3. **Metric snapshot widening (destructive):** widen `session_exercises`, `session_sets`, targets, and policy constraints; add versions/comparator dimensions while copying existing rows exactly.
4. **FTS virtual table/triggers (additive/rebuildable):** create after authoritative search terms exist; populate/rebuild and verify parity.
5. **Schedule versions/opportunities/events/overrides (destructive for current mode CHECK; otherwise additive):** migrate existing weekday schedules into version 1 without changing their dates/bindings.
6. **Starter/content import:** install validated assets only after schema and metric registry support every referenced row.

### Data Migration Rules

- Existing Phase 1 content rows keep IDs, namespace, names, profile values, and references.
- Existing load/reps and timed-hold JSON bytes remain readable; do not rewrite historical snapshots for “normalization.”
- Add missing version/generation fields with deterministic legacy values.
- Existing weekday schedule becomes one effective schedule version at its original start date/timezone and preserves all bindings.
- FTS is built from authoritative search-term rows, never copied from an old index.
- Every migration updates `user_version` only in its successful writer transaction and runs verify + integrity checks.
- A destructive migration must trigger the existing recovery-backup seam; failure retains prior schema/version/data and blocks roots.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | [VERIFIED: `src/bootstrap/workoutAppRuntime.tsx:121-123`] Installed app state lives in `gym-tracker.db`; released user versions 1–3 may contain Phase 1 original exercises, copied plans, weekday schedules, sessions, targets, observations, effects, and recommendations. | **Data migration:** apply every numbered forward migration to retained v0/v1/current fixtures and actual installed SQLite; preserve IDs and historical JSON. Never replace the database or rely on reinstall. |
| Live service config | None — verified from the offline/no-backend project contract and live source scan: Phase 2 has no remote service, admin UI, server database, or runtime catalog API. | None. The maintainer Git fetch is build-time tooling, not live app configuration. |
| OS-registered state | [VERIFIED: `app.config.ts:21-26`] Android registers schemes `gymtracker-devtest` / `gymtracker` and packages `com.fchoo.gymtracker.devtest` / `com.fchoo.gymtracker`; no Phase 2 rename is planned. A previously installed package may retain the database that must migrate on launch. | **Code/test action:** keep identifiers unchanged; test upgrade-in-place on the development-test package, not only clean install. No OS re-registration migration is required. |
| Secrets / env vars | None that encode catalog/profile/schedule names. [VERIFIED: `app.config.ts:5-10`, `scripts/build-current-native-test-apk.sh:8-9,76-85`] Build/runtime controls are `GYM_TRACKER_BUILD_PROFILE`, `GYM_TRACKER_ANDROID_SERIAL`, `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT`; Phase 2 does not rename them. | None beyond using pinned environment values. Do not add catalog credentials or runtime network secrets. |
| Build artifacts / installed packages | [VERIFIED: `scripts/build-current-native-test-apk.sh:66-69`] Native evidence is created under `artifacts/native/$suite` as `build.json`, a retained APK, and `zipalign.txt`. Existing Phase 1 artifacts package the old schema/assets/runtime. | **Rebuild/evidence action:** produce a new Phase 2 suite/APK/manifest/results; keep old Phase 1 evidence for regression history but never cite it as proof of Phase 2 runtime behavior. No npm package install is added. |

**Canonical post-edit question:** after source files change, installed `gym-tracker.db` files and installed Android packages still carry prior schema/data until migration runs; retained Phase 1 APK/evidence still carries the old runtime forever and must remain historical rather than current proof.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Catalog dependency | Runtime scraper or unofficial npm fallback | Pinned official Git revision + deterministic committed artifact | Offline integrity, provenance, and registry package is absent. |
| Full-text engine | JavaScript inverted index | Packaged SQLite FTS5 | SQLite already ships the native index/rebuild/integrity primitives. |
| SQL/FTS safety | Raw interpolated MATCH string | Deterministic normalizer + quoted bound MATCH parameter + prepared SQL | SQL binding and FTS grammar are separate boundaries. |
| Source/FTS synchronization | UI refresh or background best-effort repair | Relational search-term rows + same-transaction SQLite triggers | Prevents acknowledged source state with stale derivative. |
| Date arithmetic | 24-hour milliseconds or host-local parsing | Validated LocalDate arithmetic + IANA timezone formatter | DST and device-zone changes otherwise shift intent. |
| Metric comparison | Generic “higher number wins” | Versioned registry comparator per profile | Direction/units/ties differ fundamentally. |
| Cross-profile target conversion | Heuristic mapping | Explicit owner-entered replacement targets | Locked D-34/D-36 prohibit inference. |
| Plan graph duplication | JSON clone detached from revisions/IDs | Transactional repository graph copy | Must preserve ownership, references, policies, and schedule defaults. |
| Schedule history | Mutating one current blob | Effective versions + immutable opportunities/events | Prospective changes and consumed overrides need auditability. |
| UI architecture | New component library | Existing theme, `AdaptiveScreen`, shared components | UI-SPEC forbids a parallel system. |

## Common Pitfalls

### Pitfall 1: Treating Upstream Data as Product-Ready
**What goes wrong:** aliases are missing, all measurement types say reps, and near-duplicates enter starters/search.  
**Avoid:** require an app-owned reviewed overlay and zero unresolved rows.  
**Warning signs:** metric profile derived from source `type`; no alias/reviewer artifact; Phase 1 IDs replaced.

### Pitfall 2: Reusing Timed-Hold V1 With New Units
**What goes wrong:** historical `durationSeconds` becomes interpreted as milliseconds.  
**Avoid:** retain legacy V1 and add a new contract version.  
**Warning signs:** parser changes field/unit without version change; migration rewrites session JSON.

### Pitfall 3: Letting BM25 Violate D-11
**What goes wrong:** frequency/length weighting outranks exact/prefix/alias tiers.  
**Avoid:** FTS retrieves candidates only; relational CASE computes locked rank.  
**Warning signs:** `ORDER BY rank` or `bm25()` is the first product sort.

### Pitfall 4: Ignoring Trigram Short Queries
**What goes wrong:** one- or two-character partial searches return no results.  
**Avoid:** explicit bounded relational fallback and fixtures for 1/2/3 code points.  
**Warning signs:** all non-empty queries use MATCH.

### Pitfall 5: SQL-Binding Raw FTS Operators
**What goes wrong:** punctuation remains an FTS syntax error or changes semantics even though SQL is parameterized.  
**Avoid:** normalize to safe text, quote the phrase, bind it, and fixture punctuation/operator words.  
**Warning signs:** raw `bench - press`, quotes, colon, parentheses, `AND`, `OR`, or `NOT` reaches MATCH.

### Pitfall 6: Offset Pagination Under Mutable Content
**What goes wrong:** updates/filters cause duplicates or omissions between pages.  
**Avoid:** content-revision-bound keyset cursor over the full stable sort tuple.  
**Warning signs:** `LIMIT ? OFFSET ?`; cursor lacks query/filter/revision fingerprint.

### Pitfall 7: Additive TypeScript Over a Restrictive Schema
**What goes wrong:** domain accepts a profile/mode that SQLite rejects at execution.  
**Avoid:** inspect and rebuild every CHECK-constrained source/snapshot table first.  
**Warning signs:** nine-profile union lands without retained migration fixtures.

### Pitfall 8: Updating Current Schedule in Place
**What goes wrong:** prior date intent and consumed overrides change retroactively.  
**Avoid:** effective schedule versions plus immutable opportunities/events.  
**Warning signs:** one UPDATE changes timezone/mode/bindings without effective date.

### Pitfall 9: Implicit Rotation Advancement
**What goes wrong:** alternate/empty/rest-day workouts unexpectedly move the pointer.  
**Avoid:** central pure transition table and append-only explicit event.  
**Warning signs:** “any completed workout” advances rotation.

### Pitfall 10: Reusing Phase 1 Native Evidence
**What goes wrong:** the retained APK predates new assets, migrations, FTS, routes, and profile runtime.  
**Avoid:** build one new Phase 2 development-test APK and bind native/FTS/Maestro/performance evidence to it.  
**Warning signs:** Phase 2 verification cites APK SHA `220e46ae…`.

## Code Examples

### Existing Commit-Gated Writer Pattern

```typescript
// Source: src/platform/sqlite/serializedWriter.ts
await writer.execAsync("BEGIN IMMEDIATE");
try {
  const committedState = await command(writer);
  await writer.execAsync("COMMIT");
  return committedState;
} catch (error) {
  await writer.execAsync("ROLLBACK");
  throw error;
}
```

The production implementation already wraps failures more carefully; Phase 2 repositories must enter through `SqliteKernel.write`, not copy this as a second writer.

### Official Prepared-Statement Pattern

```typescript
// Source: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#prepared-statements
const statement = await db.prepareAsync(
  "SELECT * FROM exercise_search_terms WHERE normalized_text = ?",
);
try {
  const result = await statement.executeAsync([normalizedQuery]);
  return await result.getAllAsync();
} finally {
  await statement.finalizeAsync();
}
```

### Proposed Search Ordering Skeleton

```sql
-- Recommendation derived from D-11; proposed identifiers are not existing schema.
ORDER BY
  relevance_tier ASC,
  canonical_sort_key ASC,
  exercise_id ASC
```

### Official FTS Repair Commands

```sql
-- Source: https://www.sqlite.org/fts5.html#the_integrity_check_command
INSERT INTO exercise_search_fts(exercise_search_fts, rank)
VALUES('integrity-check', 1);

-- Source: https://www.sqlite.org/fts5.html#the_rebuild_command
INSERT INTO exercise_search_fts(exercise_search_fts)
VALUES('rebuild');
```

## Likely Files

| Existing / New Path | Action |
|---|---|
| `assets/content/full-body-foundation.v1.json` | Retain as legacy original source; migrate its importer into the generalized pack without changing shipped IDs. |
| `assets/content/exercise-library.v1*.json` | New generated source, manifest, and review artifacts. |
| `scripts/content/*.mjs` | New pinned fetch/hash/build/diff/validate workflow. |
| `src/domains/content/index.ts` | Split legacy fixture schema from generalized versioned pack schemas/import commands. |
| `src/domains/library/*` | New search/custom/preference/detail rules and ports. |
| `src/domains/metrics/*` | New nine-profile observations/targets/aggregates/comparators/migration registry. |
| `src/domains/plans/*` | Generalize activation; add draft/edit/duplicate/archive/replace commands. |
| `src/domains/scheduling/*` | New LocalDate/timezone utilities and weekday/rotation state machines. |
| `src/domains/workout/activeWorkout.ts` | Widen observation/target unions without reusing legacy versions; preserve SetRow command shape. |
| `src/platform/sqlite/migrations/0004_*.ts` onward | Forward schema/table rebuild/FTS/schedule migrations. |
| `src/platform/sqlite/repositories/plansWorkoutRepository.ts` | Decompose into content/library/plan/schedule/workout repositories. |
| `src/bootstrap/workoutAppRuntime.tsx` | Compose new public ports/query keys; stop hard-coding one fixture/activation path. |
| `src/ui/screens/RootScreens.tsx` | Replace only Library placeholder; preserve Calendar/Progress boundaries. |
| `src/ui/components/index.ts` | Add approved shared primitives, not screen-local style variants. |
| `app/(tabs)/library.tsx`, `app/library/*` | Keep root and nested routes thin. |
| `app/__native-contracts.tsx` | Add actual packaged FTS5/trigram/parity/rebuild/migration cases. |
| `scripts/run-native-sqlite-contracts.mjs` | Permit a Phase 2 suite/count while preserving artifact binding. |
| `.github/workflows/pr.yml`, `package.json` | Add Phase 2 host/native/Maestro gates and retain Phase 1 regressions. |
| `scripts/run-coverage-gate.mjs` | Add all integrity-critical content/search/metric/schedule/migration modules to the explicit 100% list. |

## Plan Slicing and Dependencies

| Plan | Scope | Depends On | Exit Evidence |
|---|---|---|---|
| 02-01 | Pinned content source workflow, reviewed 300+ overlay, identity preservation, provenance/taxonomy schema, content update fixtures | Phase 1 | Deterministic pack/hash/diff; 300+ reviewed; Phase 1 IDs retained; MIT attribution; update rollback/unavailable tests |
| 02-02 | FTS migration, triggers, normalization/query/cursor/ranking/filter repository, parity/rebuild diagnostics, native FTS spike | 02-01 authoritative search terms | Host + actual Expo SQLite punctuation/1-2-3-char/rank/page/parity/rebuild contracts |
| 02-03 | Nine-profile schemas/targets/aggregates/comparators/legacy migration/profile-change command; widen snapshots/SetRow adapters | Phase 1 schema; may develop pure rules parallel to 02-01/02-02 | Complete table tests, legacy timed-hold proof, every profile round/tie/exposure case, migration fixtures |
| 02-04 | Plans/Exercises Library shell, search/filter/default sections, favorite/recent, detail/attribution, custom lifecycle/migration UI | 02-01, 02-02, 02-03 | RNTL + integration across loading/empty/error/partial/adaptive/accessibility states |
| 02-05 | Six accepted starter fixtures, deterministic fit/filter/detail, existing-copy choice, full clone activation, template update diff | 02-01, 02-03 | Human-reviewed fixture artifact; all references/profiles/policies valid; body-part day/equipment contract satisfied; clone immutability tests |
| 02-06 | Owned plan/day/target editors, draft validity, explicit aggregate Save, reorder, duplicate, archive/restore, replacement/impact flows | 02-03, 02-05 | Atomic graph command/failure tests; current-workout snapshot regression; UI dirty/focus/200% states |
| 02-07 | Effective weekday/rotation schedules, overrides, opportunities/events, timezone/midnight/DST, Today integration, Phase 2 native/E2E closure | 02-05, 02-06 | Fake-clock/timezone tables, host/device migration, Phase 2 Maestro, Phase 1 regression, new bound APK evidence |

The planner should keep pure content-generation, FTS-query, and metric-registry tasks parallel where write sets are disjoint, but schema migrations and shared runtime/workout unions require sequential integration and review.

## State of the Art

| Old / Existing Approach | Current Phase 2 Approach | Impact |
|---|---|---|
| One seed fixture imported at activation | Validated versioned content packs installed independently of activation | Library can exist/update without creating a user plan. |
| Two profile CHECK constraints | Registry + snapshot contract/generation versions for nine profiles | Every starter/custom target is semantically explicit. |
| Weekday-only mutable schedule | Effective weekday/rotation versions + immutable opportunities/events | No retroactive or silent rewrite. |
| JavaScript/SQL partial-name assumptions | FTS5 trigram candidates + short-query fallback + locked relational rank | Punctuation-safe substring behavior with deterministic pages. |
| Phase 1 timed hold V1 seconds | Preserve V1; add new unit semantics under a new version | Historical values remain truthful. |
| `setAccessibilityFocus` | React Native 0.86 recommends focus accessibility events | New modal focus code should not adopt the deprecated helper. [CITED: https://reactnative.dev/docs/0.86/accessibilityinfo#setaccessibilityfocus] |
| Advertised npm catalog package | Pinned official Git tree + generated asset | Avoids a nonexistent registry dependency. |

## Environment Availability

| Dependency | Required By | Available | Version / State | Fallback / Action |
|------------|------------|-----------|-----------------|------------------|
| Node.js | generators/tests/build | ✓ but shell default mismatches pin | default `v26.7.0`; project pin `24.19.0` | activate pinned Node before execution |
| npm | locked install/scripts | ✓ but default mismatches pin | default `11.19.0`; project pin `11.17.0` | use project-pinned npm |
| Java 17 | Android build | ✓ | Temurin `17.0.20+8` installed | set `JAVA_HOME=$(/usr/libexec/java_home -v 17)` |
| Android SDK / adb | native contracts/Maestro | ✓ via script fallback, not current PATH | `/opt/homebrew/share/android-commandlinetools`; adb 1.0.41 | let project scripts set PATH or export Android vars |
| Ready Android device | native evidence | ✗ during research | no ready `adb` device in current shell | start API 36 emulator or attach approved physical device |
| Maestro | E2E | ✓ | `2.8.0` | project script adds `~/.maestro/bin` |
| Host SQLite | fast FTS/migrations | ✓ | `3.51.0`, FTS5 enabled | still require packaged Expo SQLite proof |
| Pinned source Git access | catalog generation | ✓ | exact commit cloned successfully | committed generated pack makes runtime/network independent |

**Missing dependency with no runtime fallback:** a ready Android device/emulator is required before Phase 2 native evidence can close.  
**Version action:** the executor must switch from default Node/npm/Java to repository pins before claiming build/test results.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7 multi-project + RNTL 14.0.1 + host SQLite + actual Expo SQLite + Maestro 2.8 |
| Config file | `jest.config.js`, `package.json`, `.github/workflows/pr.yml` |
| Quick run command | `npm run test:unit -- --runInBand` or one targeted Jest path |
| Host full command | `npm run test:all` |
| Native phase gate | build one Phase 2 development-test APK, run native SQLite/FTS, Phase 1 + Phase 2 Maestro, benchmark, and artifact round-trip against that same manifest |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-01 | remembered section; transient reset/preservation | component/integration | targeted RNTL Library shell suite | ❌ Wave 0 |
| LIB-02 | source hashes, 300+ reviewed rows, aliases/taxonomy/license | generator/schema | content validator Jest/script | ❌ Wave 0 |
| LIB-03 | partial/alias search and all filters/Recent/Favorite | unit/host/component | search rule + SQLite query + RNTL suites | ❌ Wave 0 |
| LIB-04 | FTS sync/rank/punctuation/page/parity/rebuild | host/native SQLite | host FTS suite + Phase 2 native contract | ❌ Wave 0 |
| LIB-05 | custom create/edit/hide/archive/profile/manual fallback | unit/integration/component | custom lifecycle suites | ❌ Wave 0 |
| LIB-06 | five valid starters/profile/policy/source notes | fixture/schema | starter-pack validator | ❌ Wave 0 |
| LIB-07 | full independent clone and existing-copy choice | integration/native | starter activation repository + Maestro | Phase 1 analog exists; Phase 2 breadth ❌ |
| LIB-08 | create/rename/duplicate/reorder/edit/archive graph | unit/integration/component | plan command + editor suites | ❌ Wave 0 |
| LIB-09 | weekday/rotation/override/repeat/skip/advance/time | pure fake-clock + integration + E2E | schedule table tests + host/native + Maestro | ❌ Wave 0 |
| LIB-10 | bundled-only atomic update/unavailable/history preservation | migration/integration/native | retained fixtures + injected failure + native update | ❌ Wave 0 |
| LIB-11 | every comparator/average/tie/round/exposure/version | table-driven unit | metric registry suite | ❌ Wave 0 |
| LIB-12 | nine input/snapshot/display/workout profiles | unit/component/integration/E2E | schema/SetRow/workout suites + Maestro | ❌ Wave 0 |

### Required Test Tables

- Content source malformed/missing/duplicate relation, hash/license mismatch, deterministic rebuild, 299/300 rows, alias collisions, Phase 1 identity retention.
- FTS punctuation (`-`, `/`, `(`, `)`, quotes, colon), operator words, diacritics, one/two/three code points, canonical/alias tier boundaries, 29/30/31 rows, cursor invalidation, same-transaction rollback, parity and rebuild.
- Every metric valid/invalid boundary, comparator direction, all ties, average population, rounding, incomparable target dimensions, profile/contract/generation separation, legacy timed hold.
- Profile migration blocked/in-progress, affected-target completeness, rollback, recommendation/policy invalidation, immutable session bytes.
- Starter reference/policy/profile/substitution validation and complete clone graph.
- Plan dirty leave, aggregate validation rollback, accessible reorder, duplicate ID freshness, archive affected-plan behavior, replacement scope.
- Schedule local date/month/year/leap boundaries, DST spring/fall zones, device-zone change, midnight crossover, effective edits, consumed override immutability, all rotation transitions, missed weekdays.

### Sampling Rate

- **Per task commit:** targeted pure/schema/command/component test under 30 seconds.
- **Per plan merge:** `npm run typecheck`, `npm run lint`, relevant unit/component/host/integration suites, and coverage gate.
- **After migration/FTS/runtime changes:** actual Expo SQLite suite on the Phase 2 APK.
- **Phase gate:** full host suite, 100% integrity-critical files, CNG clean generation, one exact Phase 2 APK, native SQLite/FTS, Phase 1 regressions, Phase 2 Maestro, adaptive/accessibility evidence, performance, and artifact round-trip.

### Wave 0 Gaps

- [ ] Content generator/validator/diff harness and pinned source fixture.
- [ ] Approved review overlay with 300+ rows and exact source hashes.
- [ ] Starter review artifact with exact references, targets, substitutions, and interval comparator.
- [ ] Host FTS5 contract and packaged Expo SQLite FTS/trigram contract.
- [ ] Retained migration fixtures for current user versions plus expected post-migration assertions.
- [ ] Nine-profile fixture factory and comparator tables.
- [ ] Fake LocalDate/timezone/device-zone schedule harness.
- [ ] Phase 2 native route/suite/count and Maestro flows.
- [ ] Coverage-gate enumeration for new integrity-critical modules.

## Native Evidence Invalidation

[VERIFIED: `artifacts/native/phase1/build.json`] Existing evidence is bound to implementation HEAD `4e3e5211f039f6445b8e963ab97eda4ce96c6e18`, source digest `34f15295372882e478acf65a11e687d4141a7fbd4928fb55eb9225267e944acc`, and APK SHA-256 `220e46ae5760d36ec45a3f8c4909b703a446abd494aa08a8e9e1f57c0a74721b`.

Phase 2 necessarily changes committed assets, migrations, routes, runtime composition, and workout profile code. Those are packaged-runtime changes, so the Phase 1 artifact-neutral override does not apply. The planner must budget a new build-once evidence cycle and retain:

- manifest with Phase 2 HEAD/source digest/APK SHA;
- SQLite version/compile option/trigram creation proof;
- all prior 10 kernel contracts plus new FTS/migration/content contracts;
- Phase 1 Maestro regressions;
- Phase 2 Library/activation/edit/schedule/cross-profile flows;
- adaptive/200% text/keyboard-D-pad/reduced-motion checks;
- performance sampling for search page and set commit;
- installed-byte and artifact round-trip equality.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Maintain explicit untrusted asset → strict schema → domain → serialized SQLite trust boundaries. |
| V2 Authentication | no | Single-owner offline v1 has no identity/authentication system. |
| V3 Session Management | no | Workout sessions are domain records, not authentication sessions. |
| V4 Access Control | limited/internal | Enforce bundled vs custom/copied write authority and prohibit commands from editing bundled source in place. |
| V5 Validation / Sanitization / Encoding | yes | Zod whole-pack/version validation, bounded text/counts, normalized FTS grammar, prepared SQL. |
| V6 Cryptography | no new control | Phase 2 adds no cryptographic feature; preserve existing backup exclusions and defer archive crypto to Phase 5. |
| V7 Error / Logging | yes | Typed bounded codes/timing/counts; never log raw search text, SQL parameters, notes, set payloads, or content instructions. |
| V8 Data Protection | yes | Local workout source facts remain in excluded SQLite paths; unavailable/archive do not leak through debug/export surfaces. |
| V11 Business Logic | yes | Exactly-one-active schedule, ownership, immutable history, explicit profile migration, and no silent advancement/substitution. |
| V12 Files / Resources | yes | Pinned source hashes, bounded generated assets, no runtime remote input, atomic validated import. |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Malformed/untrusted content pack | Tampering | Pin/hash/strict-parse/bound every field and validate all references before transaction. |
| Raw MATCH grammar injection/DoS | Tampering / Denial | Normalize, quote, bind, cap length, use fixed query templates and bounded pages. |
| Ownership-confused update | Tampering | Origin-scoped repository methods and SQL predicates; tests prove custom/copied rows unchanged. |
| Partial content/FTS update | Tampering | One serialized transaction plus triggers and parity check before commit. |
| Schedule/profile stale write | Tampering | Expected revisions and immutable consumed/history rows. |
| Sensitive diagnostic leakage | Information disclosure | Safe codes/counts/revisions only; no raw input or observation payloads. |
| Oversized catalog/list hydration | Denial | Build-time bounds, 30-row pages, ID-first hydration, bounded instructions/aliases/taxonomy. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Recommendations are explicit prescriptions derived from locked constraints; unresolved content approvals are listed below rather than asserted as facts. | — | — |

## Resolved Planning Decisions / Required Execution Acceptance Gates

These are **not unresolved research questions**. The implementation direction is resolved below.
Each exact content or native result is an execution artifact that must pass its named blocking
acceptance gate before dependent implementation can close.

1. **Which exact 300+ rows, canonical aliases, and Phase 1/upstream duplicate dispositions are approved?**
   - Status: **RESOLVED FOR PLANNING — blocking catalog acceptance gate during execution.**
   - What we know: pinned source/provenance/schema and its limitations are verified.
   - Gap: the reviewed overlay does not exist yet.
   - Planning action: make the overlay + diff + reviewer sign-off the deliverable of 02-01, not an ad hoc implementation choice.

2. **What exact exercise substitutions, targets, rests, and policy parameters do the four new starter templates use?**
   - Status: **RESOLVED FOR PLANNING — blocking starter-pack acceptance gate during execution.**
   - What we know: template intent, schedule shape, required profile coverage, and many valid candidate references are known.
   - Gap: exact fitness content and interval comparator/protocol are acceptance artifacts, not derivable from the upstream dataset.
   - Planning action: include a human-review checkpoint before 02-05 fixture lock; implementation must not invent values.

3. **Which Phase 1 originals should be linked to an upstream equivalent?**
   - Status: **RESOLVED — preserve every Phase 1 identity; link/exclude only through the blocking catalog acceptance artifact.**
   - What we know: several names are exact/near matches, while generic Lat Pulldown/Overhead Press/Reverse Lunge/Side Plank mappings are ambiguous.
   - Recommendation: preserve all existing `gym-tracker.original` identities and exclude visible upstream duplicates unless a curator explicitly links them.

4. **Does FTS5 trigram behave identically on the packaged API 36 Android adapter?**
   - Status: **RESOLVED FOR PLANNING — mandatory packaged-native prerequisite gate during execution.**
   - What we know: source flags and retained binary strings prove FTS5 is compiled in.
   - Gap: Phase 1 native contracts did not create/query trigram FTS.
   - Planning action: 02-02 begins with an actual Expo SQLite contract; feature search does not close on host proof.

5. **How should legacy timed-hold V1 coexist with the new milliseconds contract in new starters?**
   - Status: **RESOLVED — preserve seconds V1 and assign milliseconds a later contract version selected explicitly by starter fixtures.**
   - What we know: historical seconds V1 must not be reinterpreted.
   - Recommendation: preserve legacy parser/display and assign a new contract version to millisecond targets/observations; starter review selects the intended version explicitly.

These are implementation acceptance checkpoints, not unresolved product-scope decisions. They do not block planning if the PLAN files make the checkpoints explicit and ordered before dependent implementation.

## Sources

### Primary

- `02-CONTEXT.md` — 54 locked decisions and scope.
- `02-UI-SPEC.md` — approved interaction, layout, copy, adaptive, and verification contract.
- `src/platform/sqlite/migrations/0001_initial.ts` through `0003_exercise_history_index.ts` — live schema.
- `src/platform/sqlite/serializedWriter.ts`, `sqliteKernel.ts`, `connection.ts` — live writer/adapter contract.
- `src/domains/content/index.ts`, `assets/content/full-body-foundation.v1.json` — Phase 1 content contract.
- `src/domains/workout/activeWorkout.ts`, `src/domains/progression/loadRepsV1.ts` — live metric contracts.
- https://github.com/kinetic-place/exercises-db/tree/1783421f145e546fa168c591a0e4d11cae6f23df — pinned catalog.
- https://github.com/kinetic-place/exercises-db/blob/1783421f145e546fa168c591a0e4d11cae6f23df/LICENSE — MIT terms.
- https://www.sqlite.org/fts5.html — FTS5 tokenizers, query grammar, external content, rank, integrity, rebuild.
- https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ — Expo SQLite prepared statements/transactions/PRAGMAs.
- https://reactnative.dev/docs/0.86/accessibility
- https://reactnative.dev/docs/0.86/accessibilityinfo
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
- https://tc39.es/ecma402/#sec-intl-datetimeformat-constructor
- https://owasp.org/www-project-application-security-verification-standard/

### Secondary

- `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md` — approved product/metric/starter/scheduling contract.
- `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md` — approved QA routes and edge cases.
- Retained Phase 1 APK/binary/manifest/native evidence under `artifacts/native/phase1/`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — live pinned dependencies and installed package source inspected.
- Catalog provenance/schema: HIGH — exact official Git revision cloned and hashed.
- Catalog subset/aliases: MEDIUM — workflow is specified, but human-reviewed overlay is not yet authored.
- FTS architecture: HIGH — official SQLite/Expo docs, host probes, package flags, and retained APK binary agree; actual Android trigram behavior remains a planned gate.
- Metric architecture: HIGH — approved contract plus live Phase 1 conflicts were read; exact new interval/starter policy values need review.
- Scheduling architecture: HIGH — locked transition semantics and standards-based date/time behavior are sufficient to plan.
- Validation: HIGH — existing test/native evidence machinery and invalidation boundary inspected.

**Research date:** 2026-08-17  
**Valid until:** 2026-09-16 for the pinned stack/source; re-check if Expo/SQLite pins or the upstream catalog revision changes.
