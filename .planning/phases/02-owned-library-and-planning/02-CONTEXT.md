# Phase 2: Owned Library and Planning - Context

**Gathered:** 2026-08-17
**Status:** Ready for research, UI review, and planning

<domain>
## Phase Boundary

Deliver the complete personal Library and planning system: a reviewed searchable exercise catalog of at least 300 entries, custom exercises, six original starter templates, independently editable user-owned plan copies, plan/day/target editing, complete weekday and rotation scheduling, content-pack ownership and update behavior, and every approved metric profile required by the starter plans. The phase extends the trustworthy Phase 1 workout loop without mutating bundled sources or historical/session snapshots. Calendar correction, overall period progress, the complete recommendation lifecycle, backup/restore, and public release remain later phases.

</domain>

<decisions>
## Implementation Decisions

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

### Equipment-Heavy Body-Part Starter
- **D-55:** The sixth original template is `Gym Body-Part Split`: an intermediate, hypertrophy-oriented five-day Weekday schedule ordered Monday `Chest`, Tuesday `Back`, Wednesday `Shoulders`, Thursday `Legs`, Friday `Arms`. Each day contains four reviewed `load_reps` occurrences and prioritizes barbells, dumbbells, cables, machines, a bench, and a squat rack; it contains no bodyweight occurrence or exercise substitution. All targets, rests, increments, and warm-ups are explicit editable candidate defaults that require the same hash-bound owner acceptance as every other starter template.

### Physical-Review Remediation
- **D-56:** The default app presentation uses a neutral grey canvas with black or near-black card surfaces and high-contrast card text. Library becomes intentionally card-based for plan and exercise items. Cards remain flat, independently scannable, and never nest inside other cards.
- **D-57:** Every existing date entry uses an accessible in-app calendar selector. Every duration or time-of-day entry uses an accessible time-style selector. Number-only values continue to invoke an appropriate number or decimal keypad. No package may be installed for these controls.
- **D-58:** Same-row actions share one visible height and align to the right edge of their card or row. `Move up`, `Move down`, Complete set, Skip set, Complete warm-up, Skip warm-up, Plan default/reset, Add set, Add warm-up, Copy warm-up, Pause/Resume rest, and Skip rest use familiar glyph controls where space benefits, while retaining exact accessible names and minimum `48dp` targets.
- **D-59:** Completed and skipped set state appears at the top-right of the set card through distinct circle glyphs plus explicit non-color semantics; a compact status tag may reinforce the state. Remove visible warm-up copy `Excluded from records and progression` while retaining the exclusion in domain behavior, accessibility/help text where useful, and tests.
- **D-60:** The in-app rest timer can collapse and expand while the remaining time stays visible in both states. Its action order is exactly `Skip`, `Pause`/`Resume`, `−15`, `+15`; Pause/Resume and Skip are glyph buttons. Skipping rest transitions directly to ready state and shows no `Rest skipped` notice.
- **D-61:** Android rest completion uses a new versioned notification channel with user-configurable sound and vibration toggles. The default provides both a short system tone and a haptic vibration. Foreground expiry also produces the enabled feedback exactly once, while notification denial or delivery failure never changes SQLite-authoritative timer/workout truth.
- **D-62:** An active workout exposes a dedicated `Today's plan` overview showing every exercise in workout order with completed, current, planned, and skipped states. The owner can open any listed exercise to review it; returning to the current exercise does not mutate the authoritative active pointer.
- **D-63:** While a workout remains `in_progress`, any previously completed working set can be reopened and its values edited without an eight-second limit. The command is revision-checked and atomically updates only that completed set and affected derivatives; it does not restore an old whole-session snapshot, rewind later set/exercise progress, or replace the current rest state. Correction after a workout is finalized remains Phase 3.
- **D-64:** `Add warm-up`, `Copy warm-up`, and `Add working set` must execute against the current migration schema, carry complete metric identity and owned-target compatibility, expose an inline failure/retry state, and return focus/scroll to the newly inserted row. Current tests that exercise only migration `0001` do not satisfy this decision.
- **D-65:** The active-workout header is sticky above the scrolling set content and always identifies the workout/exercise context. It must coexist with the collapsible rest surface, software keyboard, safe areas, 200% text, compact/medium/expanded layouts, and landscape.
- **D-66:** The expanded root layout uses navigator-level left-tab positioning rather than applying rail visuals to a bottom-tab scene. Compact and medium remain bottom tabs; expanded uses the left rail without a blank lower-right content region.
- **D-67:** Any source implementation for D-56 through D-66 invalidates the retained Phase 2 APK evidence. Closure requires a new exact-HEAD APK, all host/native/Maestro/benchmark/round-trip evidence, attended Samsung and emulator adaptive review, and the physical-required verifier as the final executable command.

### Claude's Discretion
- Exact neutral grey and near-black token values, card spacing, shadows/borders, status-tag styling, and glyph selection within D-56/D-58 accessibility constraints.
- Exact normalized-text function and FTS query construction, provided the locked relevance order, punctuation safety, stable pagination, transactional parity, and deterministic rebuild contracts hold.
- Exact compatible-exercise ranking beneath the hard metric-profile compatibility boundary.
- Exact wording of validation, impact-preview, and migration explanations, while preserving the literal labels and semantics recorded above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Phase Contract
- `.planning/PROJECT.md` — core value, active requirements, constraints, and milestone boundaries.
- `.planning/REQUIREMENTS.md` §Library and Planning — atomic LIB-01 through LIB-12 requirements.
- `.planning/ROADMAP.md` §Phase 2 — goal, success criteria, likely slices, research flags, and release gates.
- `.planning/STATE.md` — current position, inherited integrity constraints, and artifact-evidence warning.

### Prior-Phase Decisions and Patterns
- `.planning/phases/01-trustworthy-workout-loop/01-CONTEXT.md` — authoritative ownership, SQLite, transaction, UI, testing, and offline decisions inherited by Phase 2.
- `.planning/phases/01-trustworthy-workout-loop/01-PATTERNS.md` — module boundaries, repository/writer patterns, session snapshots, queries, tests, and platform seams to preserve.
- `.planning/phases/01-trustworthy-workout-loop/01-VERIFICATION.md` — canonical Phase 1 acceptance and constraints that Phase 2 must not regress.
- `.planning/phases/01-trustworthy-workout-loop/01-10-SUMMARY.md` — exact native, E2E, performance, and artifact evidence; runtime changes require new evidence.

### Product, Design, and Engineering Contracts
- `DESIGN.md` — persistent visual system, adaptive/accessibility rules, and compact inline Active Workout contract.
- `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md` — approved full product/architecture contract, content source, starter definitions, metric registry, scheduling, Library behavior, and quality gates.
- `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md` — approved engineering QA routes, fixtures, edge cases, and critical paths.
- `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png` — approved app-system and Library visual reference.
- `~/.gstack/projects/gym_tracker/designs/approved-20260815/core-workout-flow.png` — canonical workout interaction reference that Phase 2 plan changes must continue to feed.

### Research Baseline
- `.planning/research/SUMMARY.md` — cross-cutting architecture and delivery synthesis.
- `.planning/research/ARCHITECTURE.md` — authoritative data flow, ownership, writer, effects, and projection boundaries.
- `.planning/research/FEATURES.md` — accepted product hierarchy and anti-features.
- `.planning/research/PITFALLS.md` — false-proof traps and prevention requirements.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domains/content/index.ts` and `assets/content/full-body-foundation.v1.json` provide the existing boundary-validated bundled content pattern; Phase 2 should generalize it rather than create an unrelated importer.
- `src/domains/plans/activateStarterPlan.ts` and `src/platform/sqlite/repositories/plansWorkoutRepository.ts` already prove template import, copied ownership, stable source attribution, activation, and session snapshot creation for Full Body Foundation.
- `src/platform/sqlite/migrations/0001_initial.ts` contains the Phase 1 ownership graph and versioned JSON seams for exercises, plans, schedules, targets, policies, and session snapshots; Phase 2 extends it through forward migrations and retained fixtures.
- `src/platform/sqlite/serializedWriter.ts`, `src/platform/sqlite/sqliteKernel.ts`, and repository ports are the only source-mutation path. FTS, content import, custom exercises, plan edits, schedules, and favorites must use the same serialized explicit transaction kernel.
- `src/ui/layout/AdaptiveScreen.tsx`, `src/ui/components/`, `src/ui/theme/`, and `src/ui/screens/RootScreens.tsx` provide adaptive, semantic, card-light primitives and the intentional Library placeholder to replace.
- `src/bootstrap/workoutAppRuntime.tsx` and `src/bootstrap/appContainer.ts` are the composition and query integration points.
- `src/domains/progression/loadRepsV1.ts` and `src/domains/workout/sessionDetail.ts` provide the initial profile/comparable-evidence patterns to generalize through a versioned metric registry.

### Established Patterns
- SQLite source facts remain authoritative; FTS and query caches are rebuildable derivatives.
- Screens and hooks never execute SQL. Application commands own narrow repository ports and return committed state plus exact invalidation scopes.
- All source writes serialize FIFO and use explicit `BEGIN IMMEDIATE`; UI acknowledgement and external effects occur only after commit.
- Bundled rows and user-owned rows have separate write authorities; copied plans and historical session snapshots never follow later template/content mutations.
- Boundaries use versioned Zod parsing; domain rules consume validated values and typed errors.
- Integrity-critical branches require complete coverage, retained migration fixtures, host SQLite proof, actual Expo SQLite contracts, and Android flows for changed runtime behavior.

### Integration Points
- Replace `LibraryScreen` in `src/ui/screens/RootScreens.tsx` and route through `app/(tabs)/library.tsx`; add detail/editor routes without changing the four root destinations.
- Extend `src/domains/content/` for catalog schemas/import/queries/custom lifecycle and `src/domains/plans/` for editing, activation, duplication, and schedule commands.
- Add forward SQLite migrations and repositories under `src/platform/sqlite/`; do not reshape released migration 0001 in place.
- Extend workout target/session observation unions and UI rows for all approved metric profiles while preserving the compact inline SetRow interaction and immutable session snapshots.
- Add content fixtures, every-version migration fixtures, FTS parity/rebuild contracts, metric comparator tables, schedule clock/timezone fixtures, RNTL adaptive/accessibility tests, and applicable native/Android evidence.

</code_context>

<specifics>
## Specific Ideas

- Keep exact visible labels where decided: `Plans`, `Exercises`, `Active Plan`, `My Plans`, `Starter Plans`, `Favorites`, `Recent`, `All Exercises`, `Matched alias: …`, `Built-in`, `Custom`, `Unavailable`, `Archived`, `Draft`, `Why this fits`, `Template update available`, `Create custom copy`, `Current workout is unaffected`, `Save changes`, `Discard`, `Keep editing`, `This occurrence`, `All occurrences in this plan`, `Repeat`, `Skip`, `Advance`, `Advance rotation after this workout`, `Planned but not completed`, `Follow device timezone from today`, and `Keep current timezone`.
- The owner accepted every recommended default except initially choosing full metric-profile migration; the follow-up decisions make that migration explicit, future-only, history-preserving, and progression-invalidating.
- The owner added `Gym Body-Part Split`: Chest / Back / Shoulders / Legs / Arms on Monday–Friday, using weighted gym equipment as much as possible and no bodyweight occurrence.
- Physical review supersedes the earlier card-light direction: the Library should remain a quiet operational instrument but now uses flat, non-nested cards on the grey canvas.
- The active-workout add-set device failure is schema-specific: current `session_sets` requires `metric_profile`, `metric_contract_version`, and `exercise_metric_generation`, while the three session-add INSERT paths omit those columns and the existing integration fixture runs only migration `0001`.
- The owner wants completed-set editing during an active workout, not silent mutation of finalized workout history. Phase 3 still owns finalized-session correction and its audit ledger.

</specifics>

<deferred>
## Deferred Ideas

- Finalized-session correction, reversible session removal, and date-history editing remain Phase 3. D-63 is limited to a workout whose authoritative status is still `in_progress`.
- Overall period analytics and complete recommendation lifecycle remain Phase 4.
- Backup/restore reconciliation, CSV, and public release remain Phase 5.
- Permanent deletion, cross-profile history conversion, automatic plan/template merging, automatic exercise substitution, AI plan generation, media without separately verified licensing, and cloud/social features remain outside Phase 2.

</deferred>

---

*Phase: 02-owned-library-and-planning*
*Context gathered: 2026-08-17*
