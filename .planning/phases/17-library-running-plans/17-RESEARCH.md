# Phase 17: Library & Running Plans - Research

**Researched:** 2026-10-06
**Domain:** Expo/React Native Library parity plus SQLite-authoritative, versioned Running-plan authoring
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

**Verbatim source:** [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:18-31,67-70]

### Locked Decisions

### Library and creation
- **D17-01:** Preserve remembered Plans/Exercises, search/filter/favorite/scroll state, grouped active/inactive/starter/custom identities, and all existing editor/impact/migration routes.
- **D17-02:** Every Create plan entry—including true empty Plans—opens the same neutral chooser: Strength or Running.
- **D17-03:** Creation/save/duplicate/import is inactive. Activation is a separate explicit confirmation with current revisions and schedule impact.

### Structured Running
- **D17-04:** Running creation captures goal distance/time, benchmark provenance, optional target date, frequency/available days, long-run day, and optional weekly distance. No gender/height.
- **D17-05:** Sessions are typed Recovery, Long run, Progression, Tempo, Intervals, Hills, Fartlek with common Day/Warm-up/Cool-down/intensity and only their contextual fields.
- **D17-06:** Sessions have stable identities; add/edit/delete/reorder persist locally. Deleting the final session produces a true empty plan and never restores defaults.
- **D17-07:** Multiple ordered sessions on one weekday are valid and survive reopen/backup. Future edits create prospective revisions without changing past occurrences.
- **D17-08:** Move run, Move strength, Keep both are explicit schedule decisions; no coaching/medical judgment is inferred.

### Claude's Discretion
- Exact form decomposition and validation helpers, provided the prototype copy and state coverage remain traceable.

### Deferred Ideas (OUT OF SCOPE)

Running rotation, plan recommendations, Garmin workout push, and automatic activation.
</user_constraints>

<phase_requirements>
## Phase Requirements

The IDs and descriptions below are copied verbatim from the requirement source. [VERIFIED: .planning/REQUIREMENTS.md:116-153]

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-01 | Remember Plans/Exercises selection with independent search, filters, favorites and detail-return state. | Extend `LibraryScreen` state ownership and route-return focus; do not replace the existing root. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1247-1286,1577-1614,1808-1863] |
| LIB-02 | Present Active Plans, My Plans and Starter Plans with owned/inactive/starter/Running identity, next scheduled item and grouped counts. | Replace the singular active projection with the Phase 13 sport-aware collection and add kind/next-item facts. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:410-446,1761-1817] |
| LIB-03 | Search each view, clear query separately, apply filter counts and preserve query when clearing filters; distinguish No matches from true no-plan state. | Keep per-view process state and make plan filtering source-backed. [VERIFIED: src/ui/screens/LibraryScreen.tsx:131-140,208-219,1577-1588] |
| LIB-04 | Show Favorites, Recent and All Exercises with per-exercise favorite toggles and searchable metric/equipment context. | Reuse the paged exercise repository and favorite commit behavior; enrich row facts without widening screen SQL. [VERIFIED: src/platform/sqlite/repositories/librarySearchRepository.ts:21-102,751-863] |
| LIB-05 | Provide Create plan and Create exercise from the Library actions sheet; keep Import plan explicitly unavailable/Later rather than implying a working importer. | Replace the current direct plan CTA with a focus-restoring shared actions sheet; import stays inert. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1627-1635; .planning/phases/17-library-running-plans/17-UI-SPEC.md:210-217] |
| LIB-06 | Route every Create plan entry, including true empty Plans, to one neutral Strength/Running chooser explaining that creation does not activate. | Convert `app/library/plan/create.tsx` from a Strength editor wrapper into the neutral chooser and move Strength capture to a new route. [VERIFIED: app/library/plan/create.tsx:14-33; .planning/design/v1.2-prototype-parity-matrix.md:151-151] |
| LIB-07 | Show No plans yet and Create a strength or running plan to get started with the same chooser action. | Derive true empty from the unfiltered persisted result, not a fixture switch. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:268-281] |
| LIB-08 | Add a plan summary route with active/inactive status, schedule, history, source and training days before editing actions. | Add the parity-mapped `index.tsx`/`OwnedPlanDetailScreen` pair and change the root row target from edit to summary. [VERIFIED: app/(tabs)/library.tsx:48-54; .planning/design/v1.2-prototype-parity-matrix.md:153-153] |
| LIB-09 | Provide Edit plan, Edit schedule, Duplicate, Archive plan/confirmation and Reactivate plan with preserved history and explicit activation. | Move lifecycle actions to detail while retaining the existing edit/schedule routes and command receipts. [VERIFIED: app/library/plan/[planId]/edit.tsx:27-54; src/domains/plans/ownedPlanCommands.ts:497-581] |
| LIB-10 | Retain immutable starter preview, source/equipment/schedule/training days, Preview activation and Save editable copy. | Restyle, do not replace, the existing starter detail/activation seams. [VERIFIED: app/library/starter/[templateId].tsx:14-33; .planning/design/v1.2-prototype-parity-matrix.md:155-155] |
| LIB-11 | Preview the actual affected schedules and create/activate a reviewed owned copy only on confirmation; Save without activating stays inactive. | Bind the existing starter screen to Phase 13 sport-scoped activation preview/command; never infer the affected pair in UI. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:112-129; app/library/starter/[templateId]/activate.tsx:49-59] |
| LIB-12 | Keep template-update comparison and Create new copy reachable through the existing activation update query route, preserving previous owned history. | Preserve the exact `?mode=update&ownedPlanId=...` route and `TemplateUpdateScreen`. [VERIFIED: app/(tabs)/library.tsx:55-58; app/library/starter/[templateId]/activate.tsx:20-47] |
| LIB-13 | Collect Plan name and First day, continue to the real editor, and save the draft without activation. | Add `create-strength.tsx`; retain `OwnedPlanEditorScreen` and `createOwnedPlanDraft` for the real graph. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:158-158; src/bootstrap/ownedPlanRuntime.tsx:149-171] |
| LIB-14 | Preserve day/exercise/set/metric target editing, add/move/remove actions and explicit save while applying the approved compact editor presentation. | Restyle the existing aggregate editor without replacing its draft graph or impact routes. [VERIFIED: src/domains/plans/ownedPlanCommands.ts:61-100,459-495; .planning/design/v1.2-prototype-parity-matrix.md:159-159] |
| LIB-15 | Preserve unsaved-change confirmation, save failure/retry, revision conflict, archive/duplicate confirmations and immutable completed history. | Reuse existing dirty/reorder tests and retain expected revisions/request hashes through every command. [VERIFIED: src/platform/sqlite/repositories/ownedPlanRepository.ts:75-112,171-235; src/ui/__tests__/OwnedPlanEditor.test.tsx:841-1002] |
| LIB-16 | Edit future weekday bindings with selected-day state and Save schedule, preserving real effective-date, rotation and multi-plan ownership rules. | Preserve the schedule deep route and prospective version command; Phase 17 must not fork a Running scheduler. [VERIFIED: app/library/plan/[planId]/schedule.tsx:17-38; src/platform/sqlite/repositories/scheduleRepository.ts:52-92] |
| LIB-17 | Retain occurrence/all-occurrences scope, compatible metric selection, target review and refreshed impact preview before saving replacement. | Keep the existing replacement route/screen and its stale-preview command boundary. [VERIFIED: app/library/plan/[planId]/replace/[occurrenceId].tsx:18-42; .planning/design/v1.2-prototype-parity-matrix.md:162-162] |
| LIB-18 | Retain removal impact, replacement binding/remove binding, effective date and current-workout guard before deleting a plan day. | Keep the existing removal route/screen and current-workout guard. [VERIFIED: app/library/plan/[planId]/day/[dayId]/remove.tsx:18-42; .planning/design/v1.2-prototype-parity-matrix.md:163-163] |
| LIB-19 | Show exercise instructions, tracking, equipment, last result and plan usage with favorite and Hide from pickers actions while preserving bundled facts. | Retain the detail route and preference-only actions for bundled rows. [VERIFIED: app/library/exercise/[exerciseId].tsx:33-59] |
| LIB-20 | Show custom identity and manual progression; edit name/tracking/equipment through the real editor and archive explicitly. | Retain `ExerciseEditorScreen`, custom runtime, and archive preview. [VERIFIED: app/library/exercise/[exerciseId]/edit.tsx:32-105; .planning/design/v1.2-prototype-parity-matrix.md:165-165] |
| LIB-21 | Create a local custom exercise with valid Name, Tracking and Equipment fields, then open its detail; preserve all supported metric-profile choices. | Keep the create-to-detail replacement flow and domain validation. [VERIFIED: app/library/exercise/create.tsx:14-30] |
| LIB-22 | Preserve existing edit?mode=copy and edit?mode=metric routes, future-target impact, policy choice, confirmation and active-workout guard. | Do not collapse the current query-mode branches into a generic editor. [VERIFIED: app/library/exercise/[exerciseId]/edit.tsx:32-105] |
| LIB-23 | Preserve loading, query failure/retry, refresh failure, deleted/missing detail and content-update review/dismiss states in all Library flows. | Keep last-good data during refresh and add missing-detail states to every new deep route. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1247-1314,1550-1575,1780-1807] |
| LIB-24 | Show saved goal/pacing/schedule and derived weekly sessions with Sync Garmin / match activity, Edit running plan and collision entry points. | Add the proposed Running detail route/screen against Phase 13 read ports; Garmin is a contextual hand-off only. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:169-169] |
| LIB-25 | Open Running creation from the chooser with goal, benchmark and structured sessions; save inactive and make Garmin connection optional afterward. | Commit profile plus zero/many session drafts atomically as inactive; never commit a route-only session ID. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:285-299,337-367] |
| LIB-26 | Edit goal distance/time and weekly sessions, validate invalid goal input, and persist edits that the detail and Progress can read. | Use shared typed parsing at the boundary and the Phase 13 profile revision command. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:341-367] |
| LIB-27 | Add/edit a session with Workout type, Day, Warm-up, Cool-down, Session preview and Save session; preserve common fields when changing type. | Share one `RunningSessionFields` component and keep per-type transient drafts in the editor only. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:390-407] |
| LIB-28 | Expose Volume (time or distance) and Easy target (pace, HR zone, or RPE) for Recovery sessions. | Implement the exact contextual field matrix through a typed union, not a prose blob. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-420] |
| LIB-29 | Expose volume, Effort target and Easy throughout/Steady finish/Progression finish options for Long run. | Implement the exact contextual field matrix through a typed union, not a prose blob. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-420] |
| LIB-30 | Expose Total volume, Stages, Start target and Finish target for Progression sessions. | Implement the exact contextual field matrix and integer stage validation. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-428] |
| LIB-31 | Expose Continuous/Tempo repeats format, Repeats, Work duration/distance, Recovery and Intensity target for Tempo. | Validate/persist only fields visible for the selected format. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-428] |
| LIB-32 | Expose Repeats, Work duration/distance, Recovery and pace/HR-zone/RPE target for Intervals. | Store semantic units and a typed intensity target; do not store formatted preview text. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-428] |
| LIB-33 | Expose Repeats, Uphill duration/distance, Return recovery and Effort target for Hills. | Keep uphill and return-recovery fields distinct in the domain payload. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-428] |
| LIB-34 | Expose Structured/Unstructured style, Surges/repeats, Fast segment or cue, Easy float/recovery and Effort target. | Use separate typed variants for Structured and Unstructured Fartlek. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:408-428] |
| LIB-35 | Persist session addition, edit, deletion and order; preserve a truly empty saved session list and provide error/retry without restoring fixture defaults. | Make stable identity, immutable revision, slot order, and zero-session reload SQLite integration gates. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-386] |
| LIB-36 | Offer Move run, Move strength and Keep both with actual future-date choices, explicit confirmation and persisted outcomes. | Use one preview-confirm-command transaction over both schedule revisions; `Keep both` needs an audited acknowledgement, not a no-op. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:440-459] |
</phase_requirements>

## Summary

Phase 17 should be planned as a thin feature/UI consumer of Phase 13's authoritative sport-aware plan, Running revision, schedule-slot, activation, collision, and portability ports, plus Phase 14's shared visual primitives. The roadmap explicitly says Phase 17 depends on Phases 13 and 14, while the current planning-only branch still exposes a singular active Library plan, schema version `27` (quoted source: `version: 27`), no Running routes, and Source Sans-era theme tokens. [VERIFIED: .planning/ROADMAP.md:158-176; .planning/STATE.md:1-35; src/bootstrap/workoutAppRuntime.tsx:399-446; src/platform/sqlite/migrations/0027_advanced_timing_target_ownership.ts:31-32; src/ui/theme/index.ts:15-31]

The safest executable decomposition is: dependency conformance gate; Library root/detail parity; preserved Strength/starter/exercise routes; Running runtime adapter and goal/create/detail flow; typed session editor/lifecycle; collision review/commit; then cross-cutting portability, state recovery, accessibility, performance, and evidence. Phase 17 must not copy the Phase 13 proposed schema into a second repository, key Running sessions by weekday, or let screens issue SQL. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:43-61,112-145,186-205]

The current live implementation is valuable and should be evolved in place: it already has committed section preference, independent in-process search/filter state, scroll restoration, last-good refresh behavior, aggregate Strength drafts, request hashes/revision guards, prospective schedule versions, starter update comparison, custom exercise ownership rules, and deep impact routes. [VERIFIED: src/ui/screens/LibraryScreen.tsx:117-219,1247-1314,1550-1614,1780-1863; src/platform/sqlite/repositories/ownedPlanRepository.ts:75-235,2107-2172; src/platform/sqlite/repositories/scheduleRepository.ts:52-92]

**Primary recommendation:** Lead with an end-to-end inactive Running-plan tracer that consumes final Phase 13/14 contracts: neutral chooser → atomic inactive plan with two same-weekday session slots → reopen → edit/reorder/delete-to-empty → backup/restore → separate activation/collision review; then expand Library parity and all seven session variants. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:18-31; .planning/architecture/v1.2-multi-active-plans.md:197-205]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Library root state, chooser, deep routes, form drafts, focus restoration | Browser / Client | Database / Storage | React Native owns presentation and transient drafts; only committed preference/favorite/plan facts cross into SQLite. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1247-1286; src/bootstrap/workoutAppRuntime.tsx:1659-1744] |
| Strength/starter/exercise route preservation | Browser / Client | Database / Storage | Existing route wrappers delegate to runtime/repository commands and must remain deep-linkable. [VERIFIED: app/library/plan/[planId]/edit.tsx:15-56; app/library/starter/[templateId]/activate.tsx:19-60; app/library/exercise/[exerciseId]/edit.tsx:32-105] |
| Running goal/session validation and command intent | Browser / Client (domain/runtime) | Database / Storage | Pure typed validation precedes repository writes; UI validation is advisory and repository validation remains authoritative. [VERIFIED: src/domains/plans/ownedPlanCommands.ts:118-148,429-495] |
| Stable plan/session identities and immutable revisions | Database / Storage | Browser / Client | SQLite is source of truth; screens display returned stable identity/revision and never manufacture committed IDs. [VERIFIED: .trae/rules/rules.md:16-23; .planning/architecture/v1.2-multi-active-plans.md:47-59] |
| Same-weekday ordered Running slots | Database / Storage | Browser / Client | The Phase 13 design owns `weekday` plus `slot_ordinal`; UI renders and reorders the stable ordered projection. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61] |
| Prospective schedule edit and collision resolution | Browser / Client (domain/runtime) | Database / Storage | UI selects and confirms; one domain command revalidates both reviewed schedule revisions and commits atomically. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:440-459; .planning/architecture/v1.2-multi-active-plans.md:112-129] |
| Backup/restore/merge/rebuild | Database / Storage | Browser / Client | Running source tables join the existing logical graph; rebuildable projections stay derived. [VERIFIED: src/domains/portability/backupContracts.ts:26-110; .planning/architecture/v1.2-multi-active-plans.md:186-195] |
| Garmin/FIT transport | — | — | Explicitly outside Phase 17. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:9-11,67-70] |

## Project Constraints (from .trae/rules/rules.md)

- Keep SQLite source facts authoritative. [VERIFIED: .trae/rules/rules.md:16-19]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:19-19]
- Do not acknowledge a set before its exclusive transaction commits; apply the same commit-before-success boundary to plan/session/schedule commands. [VERIFIED: .trae/rules/rules.md:20-20; src/platform/sqlite/repositories/ownedPlanRepository.ts:2107-2172]
- Preserve bundled versus user-owned data boundaries. [VERIFIED: .trae/rules/rules.md:21-21]
- Keep the workout critical path offline; Phase 17 plan/session authoring is local and must not require Garmin or network access. [VERIFIED: .trae/rules/rules.md:22-22; .planning/phases/17-library-running-plans/17-UI-SPEC.md:253-266]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. The repository's coverage gate enforces 100% statements, branches, functions, and lines for listed critical files. [VERIFIED: .trae/rules/rules.md:23-23; scripts/run-coverage-gate.mjs:16-123,171-204]
- Use atomic commits and the required co-author trailer during execution. This research task is explicitly non-committing. [VERIFIED: .trae/rules/rules.md:24-26]
- The two external source-document paths named by the project rules were unavailable in this workspace during research; the in-repo v1.2 owner brief, source precedence, requirements, inventory, parity matrix, ADR, CONTEXT, and UI-SPEC were therefore used as the executable source chain. [VERIFIED: .trae/rules/rules.md:5-14; command check 2026-10-06]

## Dependency and Baseline Audit

### Hard dependency gate

Phase 13 and Phase 14 are not optional conveniences. The project state says v1.2 is planning-only with zero completed phases and zero plans; Phase 17's roadmap entry depends on Phase 13 and Phase 14. [VERIFIED: .planning/STATE.md:1-35; .planning/ROADMAP.md:158-176]

The Phase 13 ADR explicitly marks its schema names as proposed, and the current migration registry ends at `advancedTimingTargetOwnershipMigration` with `CURRENT_SCHEMA_VERSION` derived from that array. Therefore Phase 17 Plan 01 must inspect the implemented Phase 13 types and migrations after Phase 13 lands, then bind to those real symbols; it must fail closed if they are absent rather than creating a parallel Running store. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:43-65; src/platform/sqlite/migrations/index.ts:21-60]

The Phase 17 UI contract requires Phase 14's Archivo/IBM Plex Mono editorial system, while the current theme still quotes `"SourceSans3_400Regular"`, `"SourceSans3_600SemiBold"`, `"IBMPlexMono_400Regular"`, and `"IBMPlexMono_600SemiBold"`. Phase 17 must consume the final Phase 14 tokens and must not patch a Library-only theme. [VERIFIED: src/ui/theme/index.ts:15-31; .planning/phases/17-library-running-plans/17-UI-SPEC.md:29-50]

### Current live seams to preserve

| Seam | Current exact file/symbol | Planning consequence |
|------|---------------------------|----------------------|
| Library root | `LibraryRoute` → `LibraryScreen` in `app/(tabs)/library.tsx` | Keep this wrapper; add detail/chooser targets and state restoration props rather than creating another Library root. [VERIFIED: app/(tabs)/library.tsx:22-63] |
| Plan open | `onOpenPlan` currently pushes `/library/plan/${planId}/edit` | Change default row navigation to the new summary route while preserving direct edit deep links. [VERIFIED: app/(tabs)/library.tsx:48-54] |
| Strength create | `CreateOwnedPlanRoute` currently renders `OwnedPlanEditorScreen` at `/library/plan/create` | Make this route the neutral chooser and move current behavior behind `create-strength.tsx`. [VERIFIED: app/library/plan/create.tsx:14-36] |
| Strength editor | `OwnedPlanEditorScreen`, `createOwnedPlanDraft`, `saveOwnedPlan`, `duplicateOwnedPlan`, archive/restore | Restyle/reconnect; do not rewrite aggregate commands. [VERIFIED: app/library/plan/[planId]/edit.tsx:27-54; src/domains/plans/ownedPlanCommands.ts:429-581] |
| Schedule editor | `ScheduleEditorScreen`, `loadSchedule`, `saveSchedule`, `setDateOverride` | Keep Strength Weekday/Rotation behavior; bind Running to the Phase 13 ordered-slot schedule ports. [VERIFIED: app/library/plan/[planId]/schedule.tsx:27-36] |
| Starter update | `STARTER_TEMPLATE_UPDATE_MODE` branch on existing activation route | Preserve the query route and independent-copy semantics. [VERIFIED: app/library/starter/[templateId]/activate.tsx:19-47] |
| Exercise edit modes | `mode === "metric"` and `mode === "copy"` | Preserve both route modes and guards exactly. [VERIFIED: app/library/exercise/[exerciseId]/edit.tsx:32-105] |
| Library process state | `LibrarySectionState` contains per-view `query`, `filters`, `selectedId`; scroll offsets are per section | Add a return-focus target and persist the state for the route lifetime; do not collapse to one query/filter object. [VERIFIED: src/ui/screens/LibraryScreen.tsx:131-140,208-219,1271-1286,1852-1860] |
| Current plan projection | `plans.active` is `LibraryRuntimePlanSummary | null` and read-back uses `.find(...)` | Replace with a sport-aware active collection supplied by Phase 13; the singular shape cannot represent concurrent Strength and Running. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:434-446,1813-1817] |
| Repository writes | `OwnedPlanRepository` uses request ID/hash, expected revision, `kernel.write`, and receipt replay | Mirror this command shape for Running; success is returned only after the exclusive writer completes. [VERIFIED: src/platform/sqlite/repositories/ownedPlanRepository.ts:75-112,192-235,2107-2172] |
| Portability | `LOGICAL_BACKUP_TABLE_DEFINITIONS` is an explicit allowlist | Every Phase 13 Running source table must already be present before Phase 17 exposes authoring; add no UI-only persistence. [VERIFIED: src/domains/portability/backupContracts.ts:26-110] |

## Standard Stack

### Core

| Library / layer | Version | Published | Purpose | Why Standard |
|-----------------|---------|-----------|---------|--------------|
| Expo / React Native | Expo `~57.0.25`; React Native `0.86.3` | 2026-09-24 / 2026-08-24 [CITED: https://registry.npmjs.org/expo] [CITED: https://registry.npmjs.org/react-native] | Native Android app and controls | Existing locked application stack; do not upgrade in Phase 17. [VERIFIED: package.json:92-114] |
| Expo Router | `~57.0.23` | 2026-09-24 [CITED: https://registry.npmjs.org/expo-router] | Root, dynamic, and deep Library routes | Current routes already use `router.push`, `router.replace`, `router.back`, and `useLocalSearchParams`; official docs confirm replace does not append history. [VERIFIED: package.json:106-106; app/library/plan/create.tsx:1-33] [CITED: https://docs.expo.dev/router/basics/navigation/] |
| Expo SQLite + project kernel | `~57.0.3` | 2026-09-11 [CITED: https://registry.npmjs.org/expo-sqlite] | Authoritative local source facts and exclusive transactions | Existing `SqliteKernel`/`kernel.write` pattern already serializes commits and repository receipts. [VERIFIED: package.json:109-109; src/platform/sqlite/repositories/ownedPlanRepository.ts:2107-2172] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/] |
| Zod | `4.4.3` | 2026-05-04 [CITED: https://registry.npmjs.org/zod] | Strict typed boundary parsing for Running profile/session payloads | Already used for branded stable IDs, safe timestamps, strict versioned objects, and boundary errors. [VERIFIED: package.json:123-123; src/domains/shared/contracts.ts:1-63] |

### Supporting

| Library / layer | Version | Published | Purpose | When to Use |
|-----------------|---------|-----------|---------|-------------|
| React Native Gesture Handler | `~2.32.0` | 2026-06-11 [CITED: https://registry.npmjs.org/react-native-gesture-handler] | Deliberate press/drag reorder gesture | Use only through the existing accessible reorder pattern; pointer drag is never the sole path. [VERIFIED: package.json:115-115; .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-378] |
| React Native Reanimated | `4.5.1` | 2026-07-02 [CITED: https://registry.npmjs.org/react-native-reanimated] | Lift/insertion/reorder animation | Reuse Phase 14 motion tokens and remove positional motion under Reduced Motion. [VERIFIED: package.json:118-118; .planning/phases/17-library-running-plans/17-UI-SPEC.md:546-549] |
| Project UI primitives | in-repo | n/a | `AdaptiveScreen`, actions, header, notices, skeletons, confirmation sheet, search/filter rows | Use after Phase 14 conversion; no Library-private equivalents. [VERIFIED: src/ui/components/index.ts:305-937; src/ui/layout/AdaptiveScreen.tsx:50-140] |
| Jest / jest-expo / Testing Library | Jest `29.7.0`; jest-expo `~57.0.5`; Testing Library `14.0.1` | Jest 2023-09-12; Testing Library 2026-06-23 [CITED: https://registry.npmjs.org/jest] [CITED: https://registry.npmjs.org/@testing-library/react-native] | Unit, component, SQLite-host, integration contracts | Existing four-project validation architecture. [VERIFIED: package.json:125-132; jest.config.js:1-90] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing SQLite/runtime ports | Screen-owned SQL or a new state store | Rejected: duplicates authority, bypasses receipts/revisions, and violates project rules. [VERIFIED: .trae/rules/rules.md:16-23; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:18-28] |
| Zod plus pure domain validation | Ad-hoc component validation only | Rejected: hidden fields and deep-link inputs could bypass the component; final commands must validate again. [VERIFIED: src/domains/shared/contracts.ts:37-63; .planning/phases/17-library-running-plans/17-UI-SPEC.md:422-429] |
| Existing gesture/motion stack | A new drag-and-drop package | Rejected: no package is needed, and the parity contract requires accessible move alternatives regardless. [VERIFIED: package.json:112-123; .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-378] |
| Atomic create/profile/session graph | Persist each creation field immediately | Rejected for initial creation: partial source facts and fake session identities would leak before `Create running plan`. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:285-299,337-367] |

**Installation:** none. Use the repository's pinned dependencies; Phase 17 authorizes no new package. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:620-627]

## Package Legitimacy Audit

No external package installation is recommended, so the Package Legitimacy Gate is not applicable to the Phase 17 plan. Existing dependencies remain pinned by `package.json`; the planner must not add a package task. [VERIFIED: package.json:92-132; .planning/phases/17-library-running-plans/17-UI-SPEC.md:620-627]

## Architecture Patterns

### System Architecture Diagram

```text
Library root / deep route
        |
        v
Screen-local draft + exact UI validation
        |
        v
Phase 17 RunningPlanRuntimePort adapter
        |
        +---- read ----------> Phase 13 typed read ports ----> SQLite snapshot
        |
        +---- command -------> pure domain validation
                                  |
                                  v
                         request hash + expected revisions
                                  |
                                  v
                         serialized SQLite transaction
                                  |
                    +-------------+-------------+
                    |                           |
                 conflict                    COMMIT
                    |                           |
          retain draft/review latest     append receipt/event
                                                |
                                                v
                            invalidate Library/Calendar/Progress/backup
                                                |
                                                v
                                  refresh committed read model
                                                |
                                                v
                                     route/detail/toast success
```

This flow matches the existing command/repository boundary and the proposed sport-aware activation flow. [VERIFIED: src/domains/plans/ownedPlanCommands.ts:420-495; src/platform/sqlite/repositories/ownedPlanRepository.ts:2107-2172; .planning/architecture/v1.2-multi-active-plans.md:112-129]

### Recommended Project Structure

```text
app/
├── (tabs)/library.tsx
└── library/
    ├── plan/
    │   ├── create.tsx
    │   ├── create-strength.tsx
    │   └── [planId]/
    │       ├── index.tsx
    │       ├── edit.tsx
    │       ├── schedule.tsx
    │       ├── replace/[occurrenceId].tsx
    │       └── day/[dayId]/remove.tsx
    ├── starter/[templateId].tsx
    ├── starter/[templateId]/activate.tsx
    ├── exercise/create.tsx
    ├── exercise/[exerciseId].tsx
    ├── exercise/[exerciseId]/edit.tsx
    └── running/
        ├── create.tsx
        ├── [planId].tsx
        └── [planId]/
            ├── edit.tsx
            └── session/
                ├── new.tsx
                └── [sessionId].tsx
src/
├── bootstrap/runningPlanRuntime.tsx
└── ui/
    ├── components/
    │   ├── RunningSessionFields.tsx
    │   └── ScheduleConflictSheet.tsx
    ├── running/
    │   └── runningFormDraft.ts
    └── screens/
        ├── PlanTypeChooserScreen.tsx
        ├── OwnedPlanDetailScreen.tsx
        ├── RunningPlanDetailScreen.tsx
        ├── RunningPlanEditorScreen.tsx
        └── RunningSessionEditorScreen.tsx
```

The route/screen targets above come from the parity matrix; `runningPlanRuntime.tsx`, `RunningSessionFields.tsx`, and `runningFormDraft.ts` are the recommended Phase 17 adapter/decomposition under Claude's discretion. If Phase 13 lands an equivalent adapter name, use the landed symbol rather than maintaining both. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:151-181] [ASSUMED]

### Component Responsibilities

| File / symbol | Responsibility | Must not own |
|---------------|----------------|--------------|
| `app/(tabs)/library.tsx` / `LibraryRoute` | Route targets, focus generation, runtime wiring | Search business rules or SQL. [VERIFIED: app/(tabs)/library.tsx:22-63] |
| `src/ui/screens/LibraryScreen.tsx` / `LibraryScreen` | Per-view transient state, grouping, sheets, scroll/focus restoration, last-good refresh UI | Plan activation/cardinality or fixture plan rows. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1247-1314,1550-1614,1780-1863] |
| `app/library/plan/create.tsx` / `PlanTypeChooserScreen` | Neutral equal Strength/Running choice | Plan creation command. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:251-266] |
| `OwnedPlanDetailScreen` | Source-backed summary and explicit lifecycle navigation/confirmations | Editing the Strength graph in place. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:153-154] |
| `RunningPlanEditorScreen` | Goal/availability draft, ordered session projection, dirty/revision/save states | SQL, schedule cardinality, generated coaching. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:337-386] |
| `RunningSessionEditorScreen` + `RunningSessionFields` | Common fields, contextual variant fields, preview, per-type transient drafts, save/delete confirmation | Persisting hidden fields or changing stable IDs. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:390-436] |
| `RunningPlanRuntimePort` | Stable UI-facing methods: `loadRunningPlan`, `createRunningPlan`, `saveRunningPlan`, `createRunningSession`, `saveRunningSession`, `deleteRunningSession`, `reorderRunningSessions`, `previewActivation`, `activateRunningPlan`, `previewScheduleCollision`, `commitScheduleCollisionChoice` | A second schema/repository or alternative conflict rules. [ASSUMED] |
| Phase 13 domain/repository ports | Validate source payloads, allocate stable IDs, append immutable revisions, version schedules, receipt replay, activation/collision atomicity, portability | UI copy/layout and transient field text. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:18-31; .planning/architecture/v1.2-multi-active-plans.md:47-61,112-145] |

### Pattern 1: Dependency Conformance Before Feature Code

**What:** The first plan task reads the final Phase 13/14 implementation and creates a compile-time adapter to those actual contracts. It records the exact Running profile/session/schedule/collision types, active-plan shape, invalidation keys, and portability table coverage. [VERIFIED: .planning/ROADMAP.md:158-176]

**When to use:** Before any Running screen or new Library plan grouping is implemented.

**Rule:** If the final Phase 13 port is missing stable session identity, immutable revisions, same-weekday slot ordinal, sport-scoped activation, collision preview/commit, or logical portability, stop that tracer and repair Phase 13; do not implement the invariant in Phase 17. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:18-31; .planning/phases/17-library-running-plans/17-CONTEXT.md:49-55]

### Pattern 2: Atomic Initial Running Aggregate, Direct Post-Create Session Commands

**What:** Initial creation keeps goal/session input as one transient draft and commits one inactive Running aggregate containing zero or many sessions. Repository IDs are allocated only inside the create command. After creation, deep session routes commit append/edit/delete commands against stable plan/session revisions. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:285-299,337-386]

**Why:** This reconciles structured sessions during creation with the rule that a new-session route must not fabricate a persisted session ID before commit. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:160-168]

**Navigation consequence:** A dirty Running plan editor must resolve Save/Discard/Keep editing before opening a separately committing session route. On return from a successful session command, reload the parent committed snapshot and rebase only if no dirty parent draft exists. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:486-496] [ASSUMED]

### Pattern 3: Typed Discriminated Session Payloads

**What:** Use a strict discriminated union with structured scalar objects for duration/distance/intensity; warm-up and cool-down are optional structured values, not prose. Hidden variant fields are excluded from the command payload. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:390-429]

The source-of-truth labels are quoted verbatim: `"Recovery"`, `"Long run"`, `"Progression"`, `"Tempo"`, `"Intervals"`, `"Hills"`, `"Fartlek"`; intensity modes are `"Pace"`, `"HR zone"`, `"RPE"`. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:394-420]

Recommended type decomposition:

```typescript
type RunningSessionDraft =
  | RecoverySessionDraft
  | LongRunSessionDraft
  | ProgressionSessionDraft
  | TempoSessionDraft
  | IntervalsSessionDraft
  | HillsSessionDraft
  | FartlekSessionDraft;

type StructuredQuantity =
  | DurationQuantity
  | DistanceQuantity;

type IntensityTarget =
  | PaceTarget
  | HeartRateZoneTarget
  | RpeTarget;
```

These interface names are recommendations; the final persisted literal values must come from the implemented Phase 13 contract rather than this document. [ASSUMED]

### Pattern 4: Immutable Session Revision + Prospective Binding Version

**What:** Editing session content appends an immutable revision; changing weekday/order/deleting creates a new future schedule version referencing exact stable session identities/revisions. Old opportunities keep their original revision/binding. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61,127-129]

**Same-day rule:** Never model the week as `Record<Weekday, Session>`. Several Running rows can share one weekday and remain separate through `slot_ordinal`; reorder updates future binding order, not stable session identity. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61,131-145]

### Pattern 5: Preview → Review → Exclusive Collision Command

**What:** Load actual future opportunities and both expected schedule/version revisions; owner selects Move run, Move strength, or Keep both; confirmation shows before/after dates; one command revalidates and commits/replays. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:440-459]

**Persistence:** Move choices create the appropriate prospective override/version. Keep both appends a revision-bound acknowledgement/receipt so the same exact collision does not reopen, without completing/skipping either opportunity. A new collision caused by later revisions is reviewable again. [ASSUMED]

### Pattern 6: Route Wrapper → Screen → Runtime Port

**What:** Keep Expo route files declarative and small, as existing Library plan and exercise routes do; inject typed read/command callbacks into screens. [VERIFIED: app/library/plan/[planId]/schedule.tsx:17-38; app/library/exercise/create.tsx:14-30]

**Example:**

```typescript
// Source pattern: app/library/plan/[planId]/schedule.tsx:17-38
export default function Route() {
  const runtime = useRunningPlanRuntime();
  return (
    <RunningPlanEditorScreen
      loadPlan={runtime.loadRunningPlan}
      savePlan={runtime.saveRunningPlan}
    />
  );
}
```

The example symbol names are Phase 17 recommendations; route behavior is grounded in the existing wrapper pattern. [ASSUMED]

## Running Authoring Contract

### Plan/profile form

| Field | Typed source shape | Validation / persistence |
|-------|--------------------|--------------------------|
| `Goal distance` | Positive distance value plus explicit persisted unit | Required; reject zero, negative, or missing unit with `Enter a valid goal distance.` [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:341-365] |
| `Target time` | Positive normalized duration; retain raw draft text until commit | Required; reject zero, invalid segments, non-numeric text, and overflow with `Enter a valid target time.` [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:341-363] |
| `Current benchmark` | Optional typed fact with value, recorded date, and provenance quoted as `"Imported activity"`, `"Personal history"`, or `"Manual"` | Read-only selector/summary; absence shows `No benchmark recorded` and is valid. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:343-348,366-366] |
| `Target date (optional)` | Optional local date | When supplied, it must be a real future local date; no timestamp/timezone invention. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:348-348,364-364] |
| `Runs per week` | Positive safe integer | Required; cannot exceed selected available days unless explicit multiple same-day slots account for the difference. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:349-365] |
| `Available days` | Monday-first non-empty weekday set | Required for a schedulable plan; stored as source availability, not generated coaching. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:350-350] |
| `Long-run day` | Optional selected available weekday | Becomes required/consistent when a Long run session exists. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:351-351] |
| `Current weekly distance (optional)` | Optional positive distance plus unit | Descriptive source fact only; never generate a prescription from it. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:352-352] |

### Session discriminated-union matrix

All variants share `Workout type`, `Day`, optional structured `Warm-up`, optional structured `Cool-down`, derived `Session preview`, and `Save session`. Changing type preserves the common fields and keeps an in-memory contextual draft per type, but only the selected variant is persisted. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:390-407]

| Variant | Persisted contextual fields | Required validation |
|---------|-----------------------------|---------------------|
| `Recovery` | `Volume (time or distance)`; `Easy target (pace, HR zone, or RPE)` | Positive structured volume and one typed target. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-420,422-428] |
| `Long run` | `Volume (time or distance)`; `Effort target`; `Finish` quoted as `"Easy throughout"`, `"Steady finish"`, or `"Progression finish"` | Positive volume, effort, and one finish value. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-420,422-428] |
| `Progression` | `Total volume`; `Stages`; `Start target`; `Finish target` | Stages are a whole number at least 2; start/finish remain distinct and required. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-428] |
| `Tempo` | `Format` quoted as `"Continuous"` or `"Tempo repeats"`; `Work duration / distance`; `Intensity target`; repeats-only `Repeats` and `Recovery` | Repeats-only fields do not exist in a Continuous command payload; repeats are whole and at least 1. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-428] |
| `Intervals` | `Repeats`; `Work duration / distance`; `Recovery`; `Pace, HR zone, or RPE target` | Repeats are whole and at least 1; all quantities positive and unit-bearing. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-428] |
| `Hills` | `Repeats`; `Uphill duration / distance`; `Return recovery`; `Effort target` | Uphill and return recovery stay semantically distinct; repeats are whole and at least 1. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-428] |
| `Fartlek` | `Style` quoted as `"Structured"` or `"Unstructured"`; style-specific surges/fast/easy fields; `Effort target` | Persist only selected-style fields; structured quantities and unstructured cues remain separate variants. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:410-428] |

Intensity is a typed choice quoted verbatim as `"Pace"`, `"HR zone"`, or `"RPE"`; pace carries distance/time units, HR zone is Z1–Z5, and RPE is 1–10. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:420-420]

### Command/revision matrix

| Operation | Expected command inputs | Durable outcome |
|-----------|-------------------------|-----------------|
| Create Running plan | Request identity/hash, complete profile draft, zero/many ordered session drafts, creation time | One inactive plan/profile plus stable session identities/revision 1 in a single commit; zero sessions is valid. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:285-299,337-386] |
| Save Running goal/profile | Plan ID, expected plan/profile revision, validated profile, save time | Append/update the authoritative prospective profile revision; activation unchanged. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:20-27] |
| Add session | Plan ID, expected plan revision, validated selected variant, requested position/day | Allocate stable session identity and revision inside the transaction; publish a prospective schedule version. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61,127-129] |
| Edit session | Plan ID/revision, session ID/revision, validated selected variant | Append immutable session revision and prospectively rebind; past occurrences remain on the old revision. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61,127-147] |
| Delete session | Plan/session IDs and expected revisions | Remove only from future plan/schedule versions; retain identity/revisions for historical references; final delete persists empty. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-386,431-436] |
| Reorder sessions | Plan revision plus complete ordered stable-session ID list | Validate exact membership/no duplicates; create one prospective order/version; preserve same-day `slot_ordinal`. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-378; .planning/architecture/v1.2-multi-active-plans.md:51-61] |
| Activate | Target plan/profile/schedule revisions plus expected active pair for Running | Replace only reviewed same-sport pair, leave Strength unchanged, receipt-backed commit. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:112-129] |
| Resolve collision | Both opportunity identities, schedule/version revisions, selected factual choice, confirmation token | One audited prospective result; no implicit complete/skip/suppress. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:440-459] |

### Draft and recovery state machine

```text
committed snapshot
      |
      v
screen-local draft -- invalid submit --> retain draft + focus first invalid
      |
      +-- Back --> Save changes / Discard changes / Keep editing
      |
      +-- Save --> saving (draft visible, duplicate submit blocked)
                       |
            +----------+-----------+
            |                      |
         failure/conflict        committed
            |                      |
 retain every field/order    refresh source snapshot
 Review latest/Keep editing   then navigate/announce
```

The exact dirty-leave copy is `Save changes?` with `Save changes`, `Discard changes`, and `Keep editing`; save failure and revision conflict retain the full draft. If a domain-provided process-death draft exists, it is offered only through explicit `Resume recovered draft` / `Discard recovered draft`, never silently merged. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:463-496]

### Anti-Patterns to Avoid

- **Shadow Phase 13 store:** A Phase 17-only Running table, AsyncStorage plan graph, or component-owned schedule engine will drift from Calendar/Progress/Garmin/backup. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:47-61,186-205]
- **Weekday-keyed session map:** It silently deletes valid same-day slots. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:25-28]
- **Mutable session row:** It rewrites what past occurrences and future Garmin matches mean. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-57,145-147]
- **Fixture recovery:** Recreating default sessions after empty save, delete, failure, restore, or reload violates the true-empty contract. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-386,463-482]
- **Activation inside create/save/duplicate/import:** It bypasses current-revision impact review. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:18-28]
- **Two independent collision writes:** One schedule can commit while the other goes stale. Use one collision command over both reviewed revisions. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:451-459]
- **Generic session notes blob:** It prevents type-specific validation, stable previews, and later matching. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:59-63]
- **Library-only tokens/components:** Phase 17 consumes Phase 14; it does not fork theme, sheet, field, focus, motion, or toast behavior. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:29-50]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deep navigation/history | Custom route state machine | Existing Expo Router file routes and `push`/`replace`/`back` | Preserves deep links and stack semantics already used by the app. [VERIFIED: app/library/plan/create.tsx:1-33] [CITED: https://docs.expo.dev/router/basics/navigation/] |
| SQL serialization/idempotency | Component locks or boolean `isSaving` as data safety | `SqliteKernel.write`, request hash, expected revisions, durable receipt replay | UI busy state prevents duplicate taps; repository receipts prevent duplicate effects. [VERIFIED: src/platform/sqlite/repositories/ownedPlanRepository.ts:75-112,2107-2172] |
| Runtime validation | Scattered regexes only in JSX | Zod/pure domain validators plus UI field mapping | Deep links and direct command calls receive the same strict validation. [VERIFIED: src/domains/shared/contracts.ts:1-63] |
| Reorder | A new DnD dependency or drag-only control | Existing gesture/reanimated stack plus Move earlier/later actions | Required for D-pad/TalkBack and Reduced Motion. [VERIFIED: package.json:115-118; src/ui/__tests__/OwnedPlanEditor.test.tsx:1002-1302] |
| Date/duration primitives | Free-text dates and inconsistent duration parsing | Existing `CalendarField`, `TimeDurationField`, `SemanticNumberField` adapted to Phase 14 tokens | Existing controls already cover keyboard, focus, and validation behavior. [VERIFIED: src/ui/components/CalendarField.tsx:225-660; src/ui/components/TimeDurationField.tsx:88-295; src/ui/components/SemanticNumberField.tsx:19-182] |
| Backup product | Separate Running export/import | Existing logical backup/restore/merge graph from Phase 13 | One source graph preserves cross-entity identities and activation invariants. [VERIFIED: src/domains/portability/backupContracts.ts:26-110; .planning/architecture/v1.2-multi-active-plans.md:186-195] |
| Collision judgment | “Recommended” move or readiness score | Factual Move run / Move strength / Keep both choices from actual dates | The phase explicitly forbids coaching/medical inference. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:28-28] |

**Key insight:** Most Phase 17 complexity is identity/revision/recovery complexity disguised as form UI. The correct plan expands the established command and route seams while leaving source authority and historical meaning below the screen layer. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:47-61,112-145,186-205]

## Common Pitfalls

### Pitfall 1: Planning Against Proposed Phase 13 Names as if They Already Exist

**What goes wrong:** Phase 17 imports or duplicates names from the ADR, then fails after Phase 13 lands different symbols.  
**Why it happens:** The ADR explicitly says its entity names are proposed, and v1.2 is still planning-only. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:43-45; .planning/STATE.md:1-35]  
**How to avoid:** First task reads final Phase 13 implementation and binds one `RunningPlanRuntimePort` adapter.  
**Warning signs:** New migrations/repositories appear in a Phase 17 UI plan.

### Pitfall 2: Leaving the Library Snapshot Singular

**What goes wrong:** Only one Active plan renders, usually Strength, and Running disappears or replaces it nondeterministically.  
**Why it happens:** The current exact shape is `active: LibraryRuntimePlanSummary | null`, and the read model uses `.find(...)`. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:434-446,1813-1817]  
**How to avoid:** Consume Phase 13's sport-aware active collection and render separate labeled rows.  
**Warning signs:** Any `active` scalar or `LIMIT 1` remains in the v1.2 Library read.

### Pitfall 3: Breaking Preserved Deep Routes While Adding Summary

**What goes wrong:** Existing edit/schedule/replacement/removal/copy/metric/template-update URLs stop working.  
**Why it happens:** A new summary route is treated as a replacement rather than a new default destination.  
**How to avoid:** Change only default plan-row navigation to summary; retain all existing files and query modes. [VERIFIED: app/(tabs)/library.tsx:48-58; app/library/exercise/[exerciseId]/edit.tsx:32-105]  
**Warning signs:** Route deletions or redirect loops in `/edit`, `/schedule`, `?mode=copy`, `?mode=metric`, or template update.

### Pitfall 4: Committing Fake IDs During Creation

**What goes wrong:** A route sentinel or temporary UI key is stored as a session identity.  
**Why it happens:** Deep-linkable create routes are confused with persisted aggregates.  
**How to avoid:** Keep `draftKey` UI-only; the atomic create/session command allocates the stable identity in the repository transaction. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:160-168]  
**Warning signs:** Repository methods accept a route sentinel as `sessionId`.

### Pitfall 5: Session Edit Invalidates an Unsaved Parent Draft

**What goes wrong:** A child session command increments the plan revision while the parent still holds unsaved goal/order edits; later save conflicts or overwrites.  
**Why it happens:** Deep child routes commit independently.  
**How to avoid:** Resolve the parent dirty state before opening a committing child route; reload the committed plan on return and preserve/review any recoverable draft explicitly. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:486-496] [ASSUMED]  
**Warning signs:** A dirty plan can open session edit without any Save/Discard/Keep editing decision.

### Pitfall 6: Hidden Variant Fields Leak Into Storage

**What goes wrong:** Switching from one session type to another saves stale contextual values from the previous type.  
**Why it happens:** One large form object is serialized wholesale.  
**How to avoid:** Keep per-type transient drafts for UX but construct the command from common fields plus the selected variant only. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:390-429]  
**Warning signs:** Hidden inputs are validated or appear in persisted JSON.

### Pitfall 7: Same-Day Collapse

**What goes wrong:** Two Monday runs become one after reopen, reorder, backup, or projection.  
**Why it happens:** A map keyed by weekday or a Strength uniqueness constraint is reused.  
**How to avoid:** Preserve stable session identity plus explicit `slot_ordinal` in every read/write/backup/restore projection. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61]  
**Warning signs:** `UNIQUE(schedule_version_id, weekday)` or `Record<Weekday, Session>` for Running.

### Pitfall 8: Delete-to-Empty Restores Defaults

**What goes wrong:** Recovery/Intervals/Long run fixtures reappear after final deletion or reload.  
**Why it happens:** Empty is treated as “not loaded” and seed data is applied.  
**How to avoid:** Model loading, loaded-empty, and error separately; seed nothing outside explicit fixture/test adapters. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-386,463-482]  
**Warning signs:** `sessions.length === 0` triggers default insertion.

### Pitfall 9: Non-Atomic Collision Choices

**What goes wrong:** Move run commits, Move strength preview is stale, or Keep both is forgotten and immediately reappears.  
**Why it happens:** UI calls ordinary single-schedule overrides rather than a collision command.  
**How to avoid:** Review both opportunity/version identities and commit one receipt-backed command. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:440-459]  
**Warning signs:** Collision UI invokes two unrelated callbacks or Keep both is only `closeSheet()`.

### Pitfall 10: Authoring Before Portability

**What goes wrong:** Running plans work until backup/restore/merge, then sessions/revisions/order disappear.  
**Why it happens:** UI and repository tasks land before graph allowlists/remapping/rebuild tests.  
**How to avoid:** Phase 13 portability conformance is a prerequisite to exposing Create Running. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:186-205; src/domains/portability/backupContracts.ts:26-110]  
**Warning signs:** Running source tables are absent from logical backup definitions or merge reference maps.

### Pitfall 11: Theme Work Is Repeated in Phase 17

**What goes wrong:** Library uses a private orange/blue palette or old Source Sans components and diverges from other roots.  
**Why it happens:** Phase 14 has not landed when Phase 17 is planned.  
**How to avoid:** Depend on Phase 14 tokens/components and gate the first UI task on their presence. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:29-50; src/ui/theme/index.ts:15-31]  
**Warning signs:** New local color/type/spacing constants in Running or Library screen files.

### Pitfall 12: Unbounded Library/Session Reads

**What goes wrong:** Grouping active/owned/starter plans, next items, sessions, and filters causes N+1 queries or repeated full-list recomputation.  
**Why it happens:** Rich row facts are loaded per component.  
**How to avoid:** Batch one visible Library snapshot and one ordered session projection; inspect SQLite query plans and preserve existing search pagination. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2703-2719; src/platform/sqlite/repositories/librarySearchRepository.ts:751-842; .planning/architecture/v1.2-multi-active-plans.md:227-227]  
**Warning signs:** A row effect loads its own schedule/next item or search drops cursor paging.

## Code Examples

### Strict Boundary Parsing

```typescript
// Source pattern: src/domains/shared/contracts.ts:17-63
const result = RunningPlanCommandSchema.safeParse(input);
if (!result.success) {
  throw new RunningPlanInputError();
}
return result.data;
```

Use strict boundary parsing in the Phase 13/17 command adapter, then revalidate constraints inside the repository transaction where current revisions/schedule state matter. The example names are recommendations. [VERIFIED: src/domains/shared/contracts.ts:17-63] [ASSUMED]

### Receipt-Backed Repository Command

```typescript
// Source pattern: src/platform/sqlite/repositories/ownedPlanRepository.ts:2107-2172
return kernel.write(async (transaction) => {
  const replay = await readReceipt(transaction, input.requestId);
  if (replay) return replay;
  validateExpectedRevisions(input);
  const committed = await appendRunningRevision(transaction, input);
  await writeReceipt(transaction, committed);
  return committed;
});
```

The exact Running helper names are recommendations; the transaction/receipt/revision shape is the existing standard. [VERIFIED: src/platform/sqlite/repositories/ownedPlanRepository.ts:2100-2172] [ASSUMED]

### Route Success Uses Replace Only After Commit

```typescript
// Source: app/library/plan/create.tsx:20-33
<OwnedPlanEditorScreen
  onSaved={(planId) =>
    router.replace(`/library/plan/${planId}/edit` as Href)}
/>
```

Mirror this for successful Running creation, but replace into Running detail and only after the repository command acknowledges commit. [VERIFIED: app/library/plan/create.tsx:20-33]

## State of the Art

| Old/current approach | Phase 17 approach | Why it changes |
|----------------------|-------------------|----------------|
| Root plan row opens edit directly. [VERIFIED: app/(tabs)/library.tsx:48-54] | Root row opens source-backed summary; edit remains a deep action. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:153-154] | Restores review context before destructive/activation actions. |
| `/library/plan/create` immediately opens Strength editor. [VERIFIED: app/library/plan/create.tsx:14-33] | Same route is a neutral equal chooser; Strength moves to `create-strength.tsx`. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:251-266] | Every entry, including true-empty, must be neutral. |
| Library read exposes one active plan. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:434-446,1813-1817] | Phase 13 sport-aware active collection renders concurrent Strength and Running. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:8-12] | Concurrent plans are a v1.2 foundation invariant. |
| Strength schedule binding is unique by version/week/day. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:301-331] | Running uses a separate stable session revision binding with same-day slot ordinal. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61] | One-session-per-day is prohibited without weakening Strength constraints. |
| Existing theme quotes Source Sans/IBM Plex Mono 400/600. [VERIFIED: src/ui/theme/index.ts:15-31] | Consume Phase 14 Archivo/IBM Plex Mono 400/800 tokens. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:29-50] | Phase 17 must not carry v1.1 visual tokens forward. |

**Deprecated/outdated:**

- Treating `LibraryRuntimeSnapshot.plans.active` as a scalar is incompatible with the Phase 13 two-sport composition. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:434-446; .planning/architecture/v1.2-multi-active-plans.md:8-12]
- Treating zero Running sessions as “uninitialized” is prohibited; empty is a committed valid state. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-386]
- Creating/activating a plan in one submit is prohibited; activation is separately previewed and confirmed. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:18-28]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 13 will expose equivalent typed Running read/command/collision/portability contracts before Phase 17 executes; exact final symbol names are not present on this branch. [ASSUMED] | Dependency audit / architecture | High: Phase 17 cannot safely expose authoring without them. |
| A2 | Phase 14 will expose the shared Archivo, field, sheet, toast, focus, and motion primitives before Phase 17 executes. [ASSUMED] | Dependency audit / stack | High: otherwise UI tasks would duplicate the design system. |
| A3 | A single `RunningPlanRuntimePort` adapter with the recommended method names is the narrowest stable UI seam; final Phase 13 names may differ. [ASSUMED] | Component responsibilities | Medium: planner should adapt names, not architecture. |
| A4 | Initial Running creation should commit profile plus all initial session drafts atomically, while post-create session routes commit independently after resolving a dirty parent draft. [ASSUMED] | Architecture Pattern 2 | Medium: another design must still prove no fake IDs, no partial creation, deep links, and revision-safe parent return. |
| A5 | `Keep both` should persist a revision-bound acknowledgement/receipt so the exact collision does not reopen. [ASSUMED] | Architecture Pattern 5 | Medium: Phase 13 may already define a different audited collision outcome. |
| A6 | The recommended Phase 17 helper decomposition is `runningPlanRuntime.tsx`, `RunningSessionFields.tsx`, and `runningFormDraft.ts`; equivalent landed names should replace these rather than coexist. [ASSUMED] | Recommended Project Structure | Low: file names can change without changing behavior. |
| A7 | The recommended `RunningSessionDraft`, `StructuredQuantity`, and `IntensityTarget` interface family is a useful adapter shape, but final persisted discriminants come from Phase 13. [ASSUMED] | Architecture Pattern 3 / Code Examples | Medium: mismatched persisted literals would break parsing. |
| A8 | Phase 13 should define explicit bounded Running strings/counts/repeats analogous to existing integrity-critical command bounds; exact limits are not yet locked. [ASSUMED] | Security Domain | Medium: absent bounds can permit denial-of-service-sized local payloads. |

## Open Questions

1. **What exact Phase 13 symbols and migration/table names will exist?**
   - What we know: Phase 13 owns typed Running identities, immutable session revisions, ordered same-day slots, sport-aware activation/collision, and portability. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:18-31]
   - What's unclear: This planning-only branch has no Phase 13 implementation, and the ADR calls its names proposed. [VERIFIED: .planning/STATE.md:1-35; .planning/architecture/v1.2-multi-active-plans.md:43-45]
   - Recommendation: Make conformance against landed Phase 13 code the first executable task; bind through one adapter and block on missing invariants.

2. **What exact Phase 14 component/token names will replace the current theme?**
   - What we know: Phase 17 UI-SPEC locks shared Phase 14 tokens and forbids a Library-only theme. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:29-50]
   - What's unclear: The current source still uses old theme names. [VERIFIED: src/ui/theme/index.ts:15-31]
   - Recommendation: Plan UI tasks after Phase 14 and use final exported primitives verbatim.

3. **Does Phase 13 collision persistence already include a Keep-both acknowledgement?**
   - What we know: Phase 17 requires persisted Move run, Move strength, and Keep both outcomes after review. [VERIFIED: .planning/REQUIREMENTS.md:153-153]
   - What's unclear: The ADR defines collision policy but not a final command/event symbol for acknowledgement. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:131-145]
   - Recommendation: Reuse the Phase 13 collision command if complete; otherwise add the missing domain event there, not as UI-local state.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Typecheck/tests/scripts | ✓ | `v24.19.0` | — [VERIFIED: `node --version`, 2026-10-06] |
| npm | Dependency/test scripts | ✓ | `11.17.0` | — [VERIFIED: `npm --version`, 2026-10-06] |
| Java | Android build | ✓ | OpenJDK `27` | Use project doctor to confirm Android-compatible JDK before build. [VERIFIED: `java -version`, 2026-10-06] |
| SQLite CLI | Schema/query diagnostics | ✓ | `3.54.0` | Jest SQLite-host contracts remain authoritative. [VERIFIED: `sqlite3 --version`, 2026-10-06] |
| Maestro | Later native acceptance | ✓ | `2.8.0` | Phase 20 attended/native gate. [VERIFIED: `maestro --version`, 2026-10-06] |
| Local `node_modules` / Expo CLI | Tests/build | ✗ | — | Run the repository-approved dependency install before Wave 0 verification; do not add packages. [VERIFIED: local executable probe, 2026-10-06] |
| ADB | Android device/emulator checks | ✗ | — | Defer device evidence to a machine with Android SDK/ADB; unit/component/host SQLite work can proceed. [VERIFIED: `command -v adb`, 2026-10-06] |
| Watchman | Metro optimization | ✗ | — | Metro can run without it; no Phase 17 plan should require Watchman. [VERIFIED: `command -v watchman`, 2026-10-06] |

**Missing dependencies with no fallback:**

- None for planning or source implementation. Native Android acceptance requires a later environment with ADB and installed dependencies. [VERIFIED: environment probes, 2026-10-06]

**Missing dependencies with fallback:**

- Local dependency tree: install from the checked-in lockfile before test execution.
- ADB: use host/component/SQLite tests during implementation; schedule native evidence on the Android-capable acceptance machine.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `29.7.0`, jest-expo `~57.0.5`, Testing Library `14.0.1` [VERIFIED: package.json:125-132] |
| Config file | `jest.config.js` with `unit`, `components`, `sqlite-host`, `integration` projects [VERIFIED: jest.config.js:1-90] |
| Quick run command | `npm run test:components -- --runInBand src/ui/__tests__/RunningSessionEditorScreen.test.tsx` [VERIFIED: package.json:23-28; scripts/run-component-tests.mjs:1-26] |
| Full phase command | Targeted component + unit + SQLite-host + integration commands, then `npm run typecheck && npm run lint && npm run test:coverage -- --runInBand` [VERIFIED: package.json:19-28,72-74] |

### Phase Requirements → Test Map

| Req ID(s) | Behavior | Test Type | Automated Command | File Exists? |
|-----------|----------|-----------|-------------------|-------------|
| LIB-01–07, LIB-23 | Remembered Library views, grouping, filters/actions, true-empty/no-match, load/update recovery | component + route | `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx app/(tabs)/__tests__/library.test.tsx src/ui/__tests__/PlanTypeChooserScreen.test.tsx` | Partial; chooser test is ❌ Wave 0. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:146-152,168-168] |
| LIB-08–09 | Owned summary and lifecycle navigation/confirmations | component + route + integration | `npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanDetailScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/owned-plan-crud.test.ts` | Detail test ❌ Wave 0; integration ✅. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:153-154; tests/integration/owned-plan-crud.test.ts:420-1075] |
| LIB-10–12 | Starter preview/activation/update-copy parity | component + integration | `npm run test:components -- --runInBand src/ui/__tests__/StarterPlans.test.tsx && npm run test:integration -- --runInBand tests/integration/starter-activation-repository.test.ts` | ✅ existing; extend for sport scope. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:155-157] |
| LIB-13–15 | Strength create/editor/draft/revision/duplicate/archive parity | component + integration + SQLite-host | `npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanEditor.test.tsx && npm run test:integration -- --runInBand tests/integration/owned-plan-crud.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/owned-plans.test.ts` | ✅ existing; add create-strength/summary route assertions. [VERIFIED: src/ui/__tests__/OwnedPlanEditor.test.tsx:269-1716; tests/sqlite-host/owned-plans.test.ts:315-541] |
| LIB-16–18 | Prospective schedule, replacement, removal, stale/active guards | component + integration | `npm run test:components -- --runInBand src/ui/__tests__/ScheduleEditor.test.tsx src/ui/__tests__/PlanImpactReplacement.test.tsx && npm run test:integration -- --runInBand tests/integration/schedule-commands.test.ts tests/integration/plan-impact-replacement.test.ts` | ✅ existing; extend Phase 13 sport ownership. [VERIFIED: src/ui/__tests__/ScheduleEditor.test.tsx:152-968; src/ui/__tests__/PlanImpactReplacement.test.tsx:137-813] |
| LIB-19–22 | Built-in/custom exercise create/edit/copy/metric/archive boundaries | component + integration | `npm run test:components -- --runInBand src/ui/__tests__/CustomExerciseScreens.test.tsx && npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts tests/integration/metric-profile-migration.test.ts` | ✅ existing; restyle without reducing coverage. [VERIFIED: src/ui/__tests__/CustomExerciseScreens.test.tsx:110-1119] |
| LIB-24–26 | Running detail/create/edit goal and inactive persistence | component + unit + SQLite integration | `npm run test:components -- --runInBand src/ui/__tests__/RunningPlanDetailScreen.test.tsx src/ui/__tests__/RunningPlanEditorScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts` | ❌ Wave 0. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:169-171] |
| LIB-27–34 | Common + seven contextual Running session variants, validation, preview | unit + component | `npm run test:unit -- --runInBand src/domains/running && npm run test:components -- --runInBand src/ui/__tests__/RunningSessionEditorScreen.test.tsx` | ❌ Wave 0; final domain path depends on Phase 13. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:172-179] |
| LIB-35 | Add/edit/delete/reorder, final empty, same-day order, reopen/backup/restore | component + SQLite-host + integration | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/running-plans.test.ts && npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts tests/integration/portable-merge.test.ts` | ❌ Wave 0 for Running-specific files. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:180-180] |
| LIB-36 | All collision choices, stale preview, confirmation, persisted result, no inferred completion | unit + component + SQLite integration | `npm run test:components -- --runInBand src/ui/__tests__/RunningPlanDetailScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/running-schedule-collision.test.ts` | ❌ Wave 0. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:181-181] |

### Mandatory Scenario Matrix

| Scenario | Proof required |
|----------|----------------|
| Atomic inactive create | Profile plus zero/many sessions commit once; activation remains unchanged; duplicate request replays. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:20-27] |
| Same-day slots | Two sessions on one weekday preserve stable IDs, slot order, reopen, backup/restore/merge, and detail projection. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61] |
| Prospective edit | Session content/day/order edit changes only future schedule version; past occurrence/match references remain exact. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:127-147] |
| Final deletion | Delete last session, reopen/relaunch/restore, still `No sessions yet`; no fixture insert. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-386] |
| Draft/revision conflict | Failure/stale state retains every visible field and reorder position; Review latest does not overwrite silently. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:463-496] |
| Collision | Move run, Move strength, Keep both each require review; stale pair reloads; neither event is completed/skipped by choice. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:440-459] |
| Deep route continuity | Direct edit/schedule/impact/exercise mode/template-update paths remain resolvable; default row opens summary; Back restores row/scroll/focus. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:132-168] |
| Accessibility | 200% text, 48dp targets, separate favorite/disclosure/reorder stops, focus trap/restore, Move earlier/later, Reduced Motion. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:512-549] |
| Performance | Batched Library snapshot/session projection, paged exercise search, no row N+1; record before/after percentile rather than inventing a new threshold. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2703-2719; src/platform/sqlite/repositories/librarySearchRepository.ts:751-842; .planning/architecture/v1.2-multi-active-plans.md:227-227] |

### Sampling Rate

- **Per task commit:** Run the nearest unit/component/host test file in-band plus `npm run typecheck`. [VERIFIED: package.json:19-28]
- **Per wave merge:** Run all Phase 17 targeted component, unit, SQLite-host, and integration files plus boundary lint. [VERIFIED: jest.config.js:26-90; package.json:21-28]
- **Phase gate:** `npm run typecheck && npm run lint && npm run check:boundaries && npm run test:unit -- --runInBand && npm run test:components -- --runInBand && npm run test:sqlite:host -- --runInBand && npm run test:integration -- --runInBand && npm run test:coverage -- --runInBand`. [VERIFIED: package.json:19-28,72-74]

### Wave 0 Gaps

- [ ] `src/ui/__tests__/PlanTypeChooserScreen.test.tsx`
- [ ] `src/ui/__tests__/OwnedPlanDetailScreen.test.tsx`
- [ ] `src/ui/__tests__/RunningPlanDetailScreen.test.tsx`
- [ ] `src/ui/__tests__/RunningPlanEditorScreen.test.tsx`
- [ ] `src/ui/__tests__/RunningSessionEditorScreen.test.tsx`
- [ ] `tests/integration/running-plan-authoring.test.ts`
- [ ] `tests/integration/running-schedule-collision.test.ts`
- [ ] `tests/sqlite-host/running-plans.test.ts`
- [ ] Add final Phase 13 integrity-critical Running domain/repository/migration files to `scripts/run-coverage-gate.mjs`; the gate requires 100% for listed critical files. [VERIFIED: scripts/run-coverage-gate.mjs:16-123,171-204]
- [ ] Add Phase 17 route tests for summary default, preserved edit/schedule/impact paths, chooser origin/Back, Running deep links, and missing/deleted identities. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:132-168,463-480]
- [ ] Restore the local dependency tree from the lockfile before executing tests; no new dependency is required. [VERIFIED: environment probe, 2026-10-06]

## Performance Guidance

- Keep the current concurrent root load (`sectionPreference`, plans, filter options) and extend the plan query/read port to batch kind, lifecycle, schedule, next item, and counts; do not issue per-row effects. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2703-2719]
- Keep exercise search cursor paging and diagnostic duration; enrich only the projected columns needed by the visible rows. [VERIFIED: src/platform/sqlite/repositories/librarySearchRepository.ts:751-842]
- Query Running sessions once in persisted order with exact session revision and slot ordinal. Avoid sorting by localized title/type in JavaScript. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:370-378]
- Memoize form preview derivation from the selected variant draft; preview formatting must not trigger storage reads. [VERIFIED: .planning/phases/17-library-running-plans/17-UI-SPEC.md:404-420]
- Use stable row keys from plan/session identity, not list index, especially during reorder/delete. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:25-27]
- Preserve the existing 150ms set-commit budget by keeping Library/Running rebuild work outside the workout critical path; establish a Phase 17 before/after Library/session benchmark instead of reusing the set threshold as a new form target. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:227-227; package.json:74-74]

## Security Domain

Security enforcement is enabled at ASVS level 1 for this project. [VERIFIED: .planning/config.json:47-49]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 17 introduces no account/login boundary; Garmin auth is outside scope. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:9-11,67-70] |
| V3 Session Management | no | Running “sessions” are workout-plan entities, not authentication sessions. [VERIFIED: .planning/phases/17-library-running-plans/17-CONTEXT.md:23-28] |
| V4 Access Control | limited | Enforce bundled versus user-owned mutation rules and plan/session ownership in repository commands; there is no remote principal. [VERIFIED: .trae/rules/rules.md:21-21; src/platform/sqlite/repositories/ownedPlanRepository.ts:192-235] |
| V5 Input Validation | yes | Strict domain schemas, bounded strings/counts/units, route ID validation, expected revisions, contextual-field exclusion. [VERIFIED: src/domains/plans/ownedPlanCommands.ts:30-150,429-495; .planning/phases/17-library-running-plans/17-UI-SPEC.md:358-367,422-429] |
| V6 Cryptography | no new control | Do not add cryptography; reuse the existing logical backup/encryption boundary from Phase 13/earlier milestones. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:186-195] |

OWASP documents authentication, session management, access control, validation, stored cryptography, error handling, and data protection as separate verification areas; this offline phase primarily exercises validation, ownership boundaries, error handling, and local data integrity. [CITED: https://devguide.owasp.org/en/06-verification/01-guides/03-asvs/]

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed deep-route IDs or stale revisions trigger unintended mutation | Tampering | Treat route params as untrusted strings; load exact identity; command validates stable ID and expected plan/session/schedule revisions before write. [VERIFIED: src/domains/plans/ownedPlanCommands.ts:429-519] |
| SQL injection through plan/session text | Tampering | No screen SQL; parameterized repository queries and strict bounded validation. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:1662-1667,1693-1739; src/domains/plans/ownedPlanCommands.ts:429-495] |
| Duplicate taps or process retry duplicate a session/collision | Tampering / Repudiation | Busy UI plus request hash and durable idempotent receipt replay in the exclusive writer. [VERIFIED: src/platform/sqlite/repositories/ownedPlanRepository.ts:75-112,2100-2172] |
| Cross-plan/session ID binding | Tampering | Repository verifies parent ownership and exact revisions; collision command binds both reviewed schedule/opportunity identities. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:51-61,112-129] |
| Sensitive/user-entered text leaks in diagnostics | Information Disclosure | Log stable non-PII error/correlation codes and aggregate counts only; never log plan names, benchmark payloads, or draft field contents. [VERIFIED: src/platform/sqlite/repositories/ownedPlanRepository.ts:219-235; src/platform/sqlite/repositories/librarySearchRepository.ts:87-102] |
| Backup omits new source facts | Information Disclosure / Integrity | Phase 13 logical graph coverage and round-trip tests are a precondition before authoring is reachable. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:186-205] |
| Unbounded text/count/repeats exhaust UI/storage | Denial of Service | Domain maximums and positive safe integers; add analogous explicit Running bounds in Phase 13 contract and exercise long-text/large-list tests. [VERIFIED: src/domains/plans/ownedPlanCommands.ts:30-35; .planning/phases/17-library-running-plans/17-UI-SPEC.md:422-429] [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/17-library-running-plans/17-CONTEXT.md` — locked scope and decisions.
- `.planning/phases/17-library-running-plans/17-UI-SPEC.md` — approved route, copy, field, state, accessibility, and validation contract.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — LIB-01–36 ownership, dependencies, success criteria.
- `.planning/design/v1.2-prototype-inventory.json` and `.planning/design/v1.2-prototype-parity-matrix.md` — exact inventory IDs, target files, tests, evidence.
- `.planning/architecture/v1.2-multi-active-plans.md` — Phase 13 proposed identity/revision/schedule/portability architecture.
- Live route, runtime, repository, migration, portability, UI, and test files cited inline — inspected in this session.

### Secondary (MEDIUM confidence)

- https://docs.expo.dev/router/basics/navigation/ — push/replace navigation behavior.
- https://docs.expo.dev/router/advanced/stack/ — stack route behavior.
- https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ — exclusive transaction scope.
- https://reactnative.dev/docs/accessibility — roles/states/accessibility semantics; current search resolution was indirect, so claims remain medium confidence.
- https://devguide.owasp.org/en/06-verification/01-guides/03-asvs/ — ASVS category framing.

### Tertiary (LOW confidence)

- Recommended Phase 17 adapter/helper symbol names and initial-create draft decomposition are marked `[ASSUMED]` and must be reconciled with final Phase 13/14 implementation.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — pinned versions and current patterns were read from `package.json` and live source; no new dependency is proposed.
- Architecture: MEDIUM — locked invariants are clear, but Phase 13 and Phase 14 implementations do not yet exist on this planning-only branch.
- Existing Library/Strength parity: HIGH — routes, screens, commands, repositories, and tests were opened and mapped.
- Running implementation details: MEDIUM — UI/domain outcomes are locked; exact Phase 13 symbols and persistence names remain future inputs.
- Pitfalls: HIGH for live singleton/deep-route/backup/draft findings; MEDIUM where the mitigation depends on future Phase 13 command shape.

**Research date:** 2026-10-06  
**Valid until:** Phase 13 or Phase 14 implementation changes the dependency contracts; otherwise 2026-11-05.
