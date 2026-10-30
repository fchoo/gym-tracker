---
phase: 17
slug: library-running-plans
status: validated_host
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
requirements: [LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12, LIB-13, LIB-14, LIB-15, LIB-16, LIB-17, LIB-18, LIB-19, LIB-20, LIB-21, LIB-22, LIB-23, LIB-24, LIB-25, LIB-26, LIB-27, LIB-28, LIB-29, LIB-30, LIB-31, LIB-32, LIB-33, LIB-34, LIB-35, LIB-36]
plans: [17-01, 17-02, 17-03, 17-04, 17-05, 17-06, 17-07, 17-08, 17-09, 17-10, 17-11, 17-12, 17-13, 17-14]
automated_gaps: 0
manual_only: 0
---

# Phase 17 — Validation Strategy

> Execution-time Nyquist contract for Library parity and persistent structured Running authoring. No test, build, device mutation, or evidence command in this document was run during planning.

## Upstream conformance gate

Phase 17 execution starts only after the landed Phase 13 and Phase 14 implementations provide and verify:

- strict seven-kind Running contracts, stable plan/session roots, immutable revisions, same-weekday slot identity/order, prospective schedules, receipt-fenced commands, collision preview/commit with an append-only Keep both acknowledgement, and successor backup/restore/merge;
- sport-aware active-plan/library reads and bounded multi-event projections;
- one shared Archivo/IBM Plex theme, fields, BottomSheet, ConfirmationDialog, SemanticToast, focus restoration, motion and four-root shell;
- no Phase 17 table, repository, SQL path, AsyncStorage plan store, appearance provider, token namespace, modal frame, or toast host.

Plan 17-01 must stop on a missing invariant and repair the upstream owner. It may adapt final symbol names; it may not implement substitute authority or presentation systems.

## Test infrastructure

| Property | Value |
|---|---|
| Framework | Jest 29.7 with unit, components, sqlite-host, and integration projects; Maestro 2.8 native flows |
| Config | jest.config.js, scripts/run-coverage-gate.mjs, scripts/run-phase17-maestro.mjs, scripts/verify-phase17-evidence.mjs |
| Quick command | The owning task's focused automated command below |
| Full host gate | npm run typecheck && npm run lint && npm run check:boundaries && npm run test:unit -- --runInBand && npm run test:components -- --runInBand && npm run test:sqlite:host -- --runInBand && npm run test:integration -- --runInBand && npm run test:coverage -- --runInBand |
| Native gate | npm run verify:cng && npm run android:devtest:fresh -- --suite phase17 && npm run test:maestro:phase17 -- --manifest artifacts/native/phase17/build.json |
| Evidence gate | npm run verify:phase17:evidence -- --manifest artifacts/native/phase17/build.json --all |
| Retained manifest | artifacts/native/phase17/build.json |
| Consolidated evidence | .planning/phases/17-library-running-plans/evidence/phase17-library-running.json |
| Feedback target | Keep each focused task command under 60 seconds; split measured commands that exceed it |

Execution follows AGENTS.md and .trae/rules/rules.md. Every future implementation/evidence commit is atomic and ends with the exact Co-authored-by: TRAE CLI <noreply@users.noreply.github.com> trailer. This planning revision creates no commit.

## Reusable focused commands

| Plan | Exact automated command |
|---|---|
| 17-01 | npm run test:unit -- --runInBand src/bootstrap/runningPlanRuntime.test.tsx src/ui/running/runningFormDraft.test.ts && npm run test:components -- --runInBand src/ui/__tests__/RunningPlanEditorScreen.test.tsx app/library/running/__tests__/routes.test.tsx && npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts |
| 17-02 | npm run test:components -- --runInBand src/ui/__tests__/PlanTypeChooserScreen.test.tsx src/ui/__tests__/LibraryScreen.test.tsx "app/(tabs)/__tests__/library.test.tsx" |
| 17-03 | npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanDetailScreen.test.tsx "app/(tabs)/__tests__/library.test.tsx" && npm run test:integration -- --runInBand tests/integration/owned-plan-crud.test.ts tests/integration/multi-plan-activation.test.ts |
| 17-04 | npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanEditor.test.tsx src/ui/components/PlanEditorFields.test.tsx app/library/plan/__tests__/create-strength.test.tsx && npm run test:integration -- --runInBand tests/integration/owned-plan-crud.test.ts |
| 17-05 | npm run test:components -- --runInBand src/ui/__tests__/ScheduleEditor.test.tsx src/ui/__tests__/PlanImpactReplacement.test.tsx && npm run test:integration -- --runInBand tests/integration/schedule-commands.test.ts tests/integration/plan-impact-replacement.test.ts |
| 17-06 | npm run test:components -- --runInBand src/ui/__tests__/StarterPlans.test.tsx && npm run test:integration -- --runInBand tests/integration/starter-activation-repository.test.ts tests/integration/multi-plan-activation.test.ts |
| 17-07 | npm run test:components -- --runInBand src/ui/__tests__/CustomExerciseScreens.test.tsx && npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts tests/integration/metric-profile-migration.test.ts |
| 17-08 | npm run test:components -- --runInBand src/ui/__tests__/RunningPlanDetailScreen.test.tsx src/ui/__tests__/RunningPlanEditorScreen.test.tsx app/library/running/__tests__/routes.test.tsx && npm run test:integration -- --runInBand tests/integration/multi-plan-activation.test.ts |
| 17-09 | npm run test:components -- --runInBand src/ui/components/RunningSessionFields.test.tsx src/ui/__tests__/RunningSessionEditorScreen.test.tsx |
| 17-10 | npm run test:unit -- --runInBand src/ui/running/runningFormDraft.test.ts && npm run test:components -- --runInBand src/ui/components/RunningSessionFields.test.tsx src/ui/__tests__/RunningSessionEditorScreen.test.tsx |
| 17-11 | npm run test:components -- --runInBand src/ui/__tests__/RunningPlanEditorScreen.test.tsx src/ui/__tests__/RunningSessionEditorScreen.test.tsx && npm run test:sqlite:host -- --runInBand tests/sqlite-host/running-plans.test.ts && npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts tests/integration/multi-plan-portability.test.ts |
| 17-12 | npm run test:components -- --runInBand src/ui/components/ScheduleConflictSheet.test.tsx src/ui/__tests__/RunningPlanDetailScreen.test.tsx && npm run test:integration -- --runInBand tests/integration/running-schedule-collision.test.ts |
| 17-13 | npm run test:unit -- --runInBand src/testing/contracts/phase17LibraryRunning.contract.test.ts && node --test scripts/phase17-evidence-scripts.test.mjs && npm run check:boundaries && npm run test:coverage -- --runInBand |
| 17-14 | node --test scripts/phase17-evidence-scripts.test.mjs && npm run verify:phase17:evidence -- --manifest artifacts/native/phase17/build.json --all |

## Sampling rate

- After every task commit: run that task's narrow command.
- After each wave: run all focused commands owned by that wave plus typecheck, lint, and boundaries.
- After Wave 4: run Running SQLite restart/replay/rollback and full successor portability suites.
- Before phase verification: run the full host gate, clean CNG verification, one retained exact-source APK, all three Phase 17 Maestro journeys, and the all-evidence verifier.
- Watch mode is prohibited for acceptance evidence.

## Per-task verification map

| Task | Wave | Requirements | Threats | Automated proof | Status |
|---|---:|---|---|---|---|
| 17-01-01 | 1 | LIB-25, LIB-27, LIB-35 | T-17-01-01..04 | RunningPlanEditor local-session create + route | validated_host |
| 17-01-02 | 1 | LIB-25, LIB-35 | T-17-01-01..04 | zero/nonempty/two-same-day runtime + integration | validated_host |
| 17-01-03 | 1 | LIB-25..35 | T-17-01-01..04 | all seven typed local session drafts + goal helper/component | validated_host |
| 17-02-01 | 3 | LIB-05..07 | T-17-02-01..04 | chooser + produced Strength/Running routes | validated_host |
| 17-02-02 | 3 | LIB-01..04 | T-17-02-01..03 | LibraryScreen + Library route components | validated_host |
| 17-02-03 | 3 | LIB-05, LIB-07, LIB-23 | T-17-02-02..04 | LibraryScreen state/recovery matrix | validated_host |
| 17-03-01 | 4 | LIB-08, LIB-23 | T-17-03-01..03 | OwnedPlanDetail + Library route components | validated_host |
| 17-03-02 | 4 | LIB-09, LIB-15 | T-17-03-01..02 | detail component + owned CRUD + multi-plan activation integration | validated_host |
| 17-04-01 | 2 | LIB-13, LIB-15 | T-17-04-01..03 | OwnedPlanEditor + create route component | validated_host |
| 17-04-02 | 2 | LIB-14 | T-17-04-01..02 | OwnedPlanEditor + PlanEditorFields components | validated_host |
| 17-04-03 | 2 | LIB-15 | T-17-04-01..03 | editor component + owned CRUD integration | validated_host |
| 17-05-01 | 2 | LIB-16 | T-17-05-01..03 | ScheduleEditor component + schedule integration | validated_host |
| 17-05-02 | 2 | LIB-17 | T-17-05-01..02 | impact component + impact integration | validated_host |
| 17-05-03 | 2 | LIB-18 | T-17-05-01..03 | removal component + impact integration | validated_host |
| 17-06-01 | 2 | LIB-10, LIB-23 | T-17-06-01..03 | StarterPlans component | validated_host |
| 17-06-02 | 2 | LIB-11 | T-17-06-01..03 | StarterPlans + starter/multi-plan activation integration | validated_host |
| 17-06-03 | 2 | LIB-12, LIB-15, LIB-23 | T-17-06-01..03 | StarterPlans update-state matrix | validated_host |
| 17-07-01 | 2 | LIB-04, LIB-19, LIB-23 | T-17-07-01..03 | CustomExerciseScreens component | validated_host |
| 17-07-02 | 2 | LIB-20, LIB-21, LIB-23 | T-17-07-01..03 | custom component + custom exercise integration | validated_host |
| 17-07-03 | 2 | LIB-22 | T-17-07-01..03 | custom component + metric migration integration | validated_host |
| 17-08-01 | 3 | LIB-23..25 | T-17-08-01..03 | RunningPlanDetail component | validated_host |
| 17-08-02 | 3 | LIB-26 | T-17-08-01..03 | RunningPlanEditor + produced child-route component | validated_host |
| 17-08-03 | 3 | LIB-09, LIB-24 | T-17-08-01..03 | Running detail + multi-plan activation integration | validated_host |
| 17-09-01 | 2 | LIB-27, LIB-28 | T-17-09-01..03 | RunningSessionEditor component | validated_host |
| 17-09-02 | 2 | LIB-29, LIB-30 | T-17-09-01..03 | RunningSessionFields + editor components | validated_host |
| 17-10-01 | 3 | LIB-31, LIB-32 | T-17-10-01..03 | RunningSessionFields + editor components | validated_host |
| 17-10-02 | 3 | LIB-33 | T-17-10-01..03 | RunningSessionFields + editor components | validated_host |
| 17-10-03 | 3 | LIB-34 | T-17-10-01..03 | runningFormDraft unit + RunningSessionFields component + typecheck | validated_host |
| 17-11-01 | 4 | LIB-27, LIB-35 | T-17-11-01..03 | session component + authoring integration + running sqlite-host | validated_host |
| 17-11-02 | 4 | LIB-35 | T-17-11-01..03 | plan editor component + running sqlite-host | validated_host |
| 17-11-03 | 4 | LIB-25, LIB-35 | T-17-11-01..03 | running sqlite-host + authoring/portability integration | validated_host |
| 17-12-01 | 4 | LIB-24, LIB-36 | T-17-12-01..03 | conflict/detail components + collision integration | validated_host |
| 17-12-02 | 4 | LIB-36 | T-17-12-01..03 | all collision/stale/replay/rollback component/integration cases | validated_host |
| 17-13-01 | 5 | LIB-01..36 | T-17-13-01..04 | canonical contract unit + verifier mutation tests | validated_host |
| 17-13-02 | 5 | LIB-01..36 | T-17-13-01..04 | verifier mutation tests + boundaries + complete coverage | validated_host |
| 17-14-01 | 6 | LIB-01..23 | T-17-14-01..03 | Library native flow + scoped consolidated evidence verification | host implementation complete; native evidence pending Phase 20 |
| 17-14-02 | 6 | LIB-01..36 | T-17-14-01..03 | Running/accessibility native flows + all-evidence verification | host implementation complete; native evidence pending Phase 20 |

## Mandatory behavior matrix

| Scenario | Required proof |
|---|---|
| Upstream ownership | Adapter imports landed Phase 13/14 exports; boundary tests reject a Phase 17 repository/store/theme/provider. |
| Neutral create | Every populated/empty Create plan entry reaches the same unselected Strength/Running chooser; no command runs there. |
| Inactive create | Strength, Running, duplicate, starter copy, template copy, and any import contract remain inactive until separate preview/confirm. |
| Atomic initial sessions | Before the first write, RunningPlanEditor locally adds/edits/deletes/reorders typed sessions; separate zero-session and one-or-more cases include two same-day slots, and each complete profile/session graph commits once inactive with replay/rollback proof. |
| Library state | Plans/Exercises query, filters, favorites, selection, scroll, focus, last-good refresh, update notice and dismiss revision survive switches/routes/errors. |
| Deep routes | Owned summary, edit, schedule, replacement, removal, starter detail/activation/update, exercise detail/create/copy/metric, Running detail/edit/session routes all resolve directly. |
| Seven variants | Recovery, Long run, Progression, Tempo Continuous/repeats, Intervals, Hills, Fartlek Structured/Unstructured show and persist exact contextual fields only. |
| Stable identity | Add/edit/delete/reorder retain stable roots, append revisions, use exact membership, and keep past occurrence/match references unchanged. |
| Same-day order | Two or more same-weekday sessions remain distinct and ordered after save, reopen, backup, restore, merge, and projection. |
| True empty | Zero sessions and final deletion remain empty after restart/recovery; no fixture session is inserted. |
| Draft/error | Invalid submit, save failure, stale revision, process recovery, reorder cancel and missing detail retain/recover exact allowed state and focus. |
| Activation | Current plan/schedule revisions and affected dates are reviewed; other sport is unchanged; stale preview re-reviews. |
| Collision | Move run, Move strength, Keep both use actual dates, one confirmation and one exclusive command; no complete/skip/suppress/history effect. |
| Accessibility | Semantic labels/states/actions, touch, keyboard/D-pad, 48dp targets, 200% text, Light/Dark/System, landscape, all target widths, Reduced Motion, and modal trap/return; a live assistive-service run is not mandatory Phase 17 acceptance. |
| Performance | One batched Library snapshot, cursor-paged exercise search, one ordered session read, no row N+1; record actual before/after percentiles. |
| Privacy | Evidence/logs contain opaque IDs, counts, codes and hashes only; no plan/exercise names, benchmark/draft payloads, paths, archive bytes or secrets. |

## Wave 0 requirements

- [ ] Restore node_modules with npm ci from the checked-in lockfile; add no package.
- [ ] Assert Phase 13 and 14 SUMMARY/verification outputs and final exported symbols before creating Phase 17 adapters.
- [ ] Create RED-first tests named in Plans 17-01–17-14 before their production changes.
- [ ] Create tests/sqlite-host/running-plans.test.ts and extend tests/integration/multi-plan-portability.test.ts before lifecycle code is accepted.
- [ ] Create the Phase 17 canonical ledger and verifier tests before native evidence capture.
- [ ] Ensure Android SDK/adb and Maestro are available before the fresh Phase 17 artifact run; host tests do not substitute for native UI evidence.

## Manual-only verification

None. All Phase 17 behavior is automation-addressable. The milestone-wide owner-review stop remains outside this phase and no plan here authorizes implementation, build, device mutation, release, or deployment.

## Wave and ownership validation

| Wave | Plans | Reason | Same-wave file overlap |
|---|---|---|---|
| 1 | 17-01 | Cross-phase conformance plus inactive Running aggregate tracer with local sessions | none |
| 2 | 17-04, 17-05, 17-06, 17-07, 17-09 | Strength producer/editor, impact, starter, exercise, and child Running session route owners | none |
| 3 | 17-02, 17-08, 17-10 | Chooser consumes produced create routes; Running edit consumes produced child routes; remaining variants extend session fields | none |
| 4 | 17-03, 17-11, 17-12 | Owned default route, full lifecycle/portability, and collision UI extend distinct owners | none |
| 5 | 17-13 | Freezes complete evidence ledger, verifier, boundaries, and coverage | one plan |
| 6 | 17-14 | Builds/runs native flows and writes consolidated exact-artifact evidence | one plan |

## Goal-backward reachability

| Observable truth | Required artifact/path | Reachability proof |
|---|---|---|
| Complete remembered Library | app/(tabs)/library.tsx to LibraryScreen to sport-aware snapshot/search ports | Route/component tests plus native return-state journey |
| Neutral inactive creation | Library Create plan to chooser to Strength/Running create routes to commit/read-back | Component, route, integration and native trace |
| Preserved deep routes | direct Expo paths to thin wrappers to existing/new screens/runtime commands | route registry tests and native deep-link walk |
| Structured Running | Running detail/editor to session routes/fields to runtime to Phase 13 commands/repository | all-variant component tests plus SQLite reopen |
| Stable same-day/true-empty recovery | stable session roots/revisions/slot ordinals to successor portability graph | sqlite-host plus backup/restore/merge integration |
| Explicit collision | Running detail to ScheduleConflictSheet to one Phase 13 preview/commit command | component and real-SQLite three-choice/stale/replay tests |

## Multi-source coverage audit

| SOURCE | ID | Feature / constraint | Plan(s) | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Browse/maintain complete Library and create/edit/schedule/activate persistent structured Running plans | 01-14 | COVERED | Tracer through full exact-artifact evidence closure. |
| REQ | LIB-01 | Independent remembered view/search/filter/favorite/detail-return state | 02, 13 | COVERED | Source-backed state matrix. |
| REQ | LIB-02 | Active/My/Starter groups, identities, next item, counts | 02, 13 | COVERED | Concurrent sport collection. |
| REQ | LIB-03 | Per-view search/filter/count/clear and no-match distinction | 02, 13 | COVERED | Query and filters clear independently. |
| REQ | LIB-04 | Favorites/Recent/All exercise facts and favorite toggle | 02, 07, 13 | COVERED | Stable identity across duplicate presentations. |
| REQ | LIB-05 | Actions sheet and inert Import plan/Later | 02, 13 | COVERED | No importer implied. |
| REQ | LIB-06 | Every entry uses neutral chooser | 02, 13 | COVERED | No preselection. |
| REQ | LIB-07 | True no-plan state and chooser CTA | 02, 13 | COVERED | Derived before filters. |
| REQ | LIB-08 | Owned summary before editing | 03, 13 | COVERED | Default row target changes only. |
| REQ | LIB-09 | Edit/schedule/duplicate/archive/reactivate/activation | 03, 08, 13 | COVERED | Explicit lifecycle review. |
| REQ | LIB-10 | Immutable starter preview and editable copy | 06, 13 | COVERED | Fresh inactive identity. |
| REQ | LIB-11 | Actual activation impact, confirm only | 06, 13 | COVERED | Current revisions and dates. |
| REQ | LIB-12 | Template comparison/create-new-copy route | 06, 13 | COVERED | Existing copy/history unchanged. |
| REQ | LIB-13 | Strength name/first-day create and inactive save | 04, 13 | COVERED | Real editor handoff. |
| REQ | LIB-14 | Complete Strength aggregate editor | 04, 13 | COVERED | No feature loss. |
| REQ | LIB-15 | Draft/error/conflict/lifecycle/history guards | 03, 04, 06, 13 | COVERED | Cross-route recovery matrix. |
| REQ | LIB-16 | Future weekday schedule edit | 05, 13 | COVERED | Prospective revision. |
| REQ | LIB-17 | Replacement scope/metric/impact preview | 05, 13 | COVERED | Fresh token before commit. |
| REQ | LIB-18 | Removal impact/effective date/current-workout guard | 05, 13 | COVERED | Earlier facts unchanged. |
| REQ | LIB-19 | Built-in exercise facts/favorite/hide | 07, 13 | COVERED | Bundled facts immutable. |
| REQ | LIB-20 | Custom identity/manual progression/edit/archive | 07, 13 | COVERED | User-owned path. |
| REQ | LIB-21 | Valid local custom create and detail | 07, 13 | COVERED | All metric profiles. |
| REQ | LIB-22 | copy/metric modes and guarded impact | 07, 13 | COVERED | Query modes preserved. |
| REQ | LIB-23 | All loading/empty/error/retry/update states | 02, 03, 06, 07, 08, 13 | COVERED | Root and deep routes. |
| REQ | LIB-24 | Running detail/goal/pacing/schedule/sessions/actions | 08, 12, 13 | COVERED | Factual contextual entry points. |
| REQ | LIB-25 | Chooser Running create, structured sessions, inactive save | 01, 08, 11, 13, 14 | COVERED | Pre-first-commit typed local add/edit/delete/reorder; separate zero and one-or-more/two-same-day atomic inactive cases. |
| REQ | LIB-26 | Goal edit/validation/persistence | 01, 08, 13 | COVERED | Exact source facts. |
| REQ | LIB-27 | Common session fields/type switch/preview/save | 09, 10, 11, 13 | COVERED | Structured common contract. |
| REQ | LIB-28 | Recovery fields | 09, 13 | COVERED | Volume plus typed easy target. |
| REQ | LIB-29 | Long run fields | 09, 13 | COVERED | Volume/effort/finish. |
| REQ | LIB-30 | Progression fields | 09, 13 | COVERED | Volume/stages/start/finish. |
| REQ | LIB-31 | Tempo formats and fields | 10, 13 | COVERED | Continuous versus repeats. |
| REQ | LIB-32 | Intervals fields | 10, 13 | COVERED | Repeats/work/recovery/target. |
| REQ | LIB-33 | Hills fields | 10, 13 | COVERED | Uphill/return remain distinct. |
| REQ | LIB-34 | Fartlek styles and fields | 10, 13 | COVERED | Structured/unstructured union. |
| REQ | LIB-35 | Session lifecycle/order/true empty/error/retry | 11, 13 | COVERED | Restart and portability proof. |
| REQ | LIB-36 | Move run/Move strength/Keep both | 12, 13 | COVERED | Actual dates, one command. |
| CONTEXT | D17-01 | Preserve all Library state/identities/routes | 02-07, 13 | COVERED | In-place evolution. |
| CONTEXT | D17-02 | One neutral chooser including true empty | 02, 13 | COVERED | Equal options. |
| CONTEXT | D17-03 | Inactive create/save/duplicate/import; separate activation | 01, 03, 04, 06, 08, 13 | COVERED | Current impact review. |
| CONTEXT | D17-04 | Complete goal/benchmark/availability inputs; no gender/height | 01, 08, 13 | COVERED | Strict typed draft. |
| CONTEXT | D17-05 | Seven typed contextual sessions | 01, 09, 10, 13 | COVERED | Initial local drafts and post-create routes use the same strict union; no generic blob. |
| CONTEXT | D17-06 | Stable CRUD/order and true empty | 01, 09, 11, 13 | COVERED | Pre-commit draft lifecycle plus committed lifecycle; no fixture recovery. |
| CONTEXT | D17-07 | Multiple same-day slots and prospective revisions | 01, 08, 11, 13 | COVERED | Atomic initial two-slot case plus portability/reopen proof. |
| CONTEXT | D17-08 | Explicit factual collision choices | 12, 13 | COVERED | No coaching inference. |
| RESEARCH | R17-01 | Bind final Phase 13/14 symbols before feature work | 01 | COVERED | Fail-closed precondition. |
| RESEARCH | R17-02 | No new dependency/package | all | COVERED | Existing stack only. |
| RESEARCH | R17-03 | Route wrapper to screen to typed runtime port | 01-12 | COVERED | No UI SQL. |
| RESEARCH | R17-04 | Atomic initial aggregate; direct post-create commands | 01, 09, 11 | COVERED | No fake IDs/partial create. |
| RESEARCH | R17-05 | Strict discriminated session payloads | 01, 09, 10 | COVERED | Pre-commit and post-create selected variant only. |
| RESEARCH | R17-06 | Immutable revision plus prospective binding version | 05, 11, 12 | COVERED | Historical meaning fixed. |
| RESEARCH | R17-07 | Preview-review-one exclusive command | 03, 05, 06, 08, 12 | COVERED | Current revisions/tokens. |
| RESEARCH | R17-08 | Versioned portability before authoring exposure | 01, 11 | COVERED | Upstream gate plus round trip. |
| RESEARCH | R17-09 | Batched/paged reads and stable keys | 02, 08, 11 | COVERED | No N+1/index keys. |
| RESEARCH | R17-10 | Complete state/accessibility/native matrix | 02-14 | COVERED | Semantic/touch/keyboard-D-pad component plus exact APK; no mandatory live assistive-service run. |
| RESEARCH | R17-11 | Privacy-safe diagnostics/evidence | 01-14 | COVERED | Codes/counts/hashes only. |
| RESEARCH | R17-12 | Complete branch coverage for integrity-critical sources | 13 | COVERED | Existing coverage gate. |

Excluded by source contract and not gaps: Running rotation, plan recommendations, Garmin workout push, automatic activation, Garmin authentication/JSON transport/detail, in-app run recording, gender/height, coaching/medical judgment, and Phase 14's already-approved DEV-02 implementation evidence.

The installed decision-coverage checker parses only D-NN identifiers and therefore reports the source's D17-NN format as a parse mismatch. The explicit D17-01 through D17-08 rows above are the authoritative coverage audit; this planner does not renumber or rewrite the approved CONTEXT.md.

## Execution-time host audit

The per-task map above is the executable LIB map: every LIB-01..LIB-36 owner row is `validated_host`. The source audit rows retain `COVERED` as their design/traceability status; they are not being used as runtime evidence.

| Gap / behavior | Real host proof | Result |
|---|---|---|
| Migrations 37-42, catalog instructions, and v8 durable custom-library receipt | `npm run test:integration -- --runInBand tests/integration/phase17-family-a-cleanup-matrix.test.ts` (26 tests, including the schema-42 instruction/receipt probe) | validated_host |
| 25-row Family A matrix and exact cleanup | Same command (25 matrix journeys; 26 tests total) | validated_host |
| A/B/C fixture protocol and bounded 39-case ledger | `npm run test:evidence:phase17` (19 tests) | validated_host |
| Library state, chooser, deep routes, loading/error/retry/update states | Focused component command in the reusable command table (6 suites, 66 tests) | validated_host |
| All seven Running session variants | `src/ui/components/RunningSessionFields.test.tsx` and Running editor suites (included in focused component command) | validated_host |
| Running lifecycle, same-day order/true-empty/replay, portability, and collision choices | Focused Running integration/SQLite commands (36 integration tests; Running SQLite suite 5 tests) | validated_host |
| v8 portability table boundary | `npm run test:integration -- --runInBand tests/integration/multi-plan-portability.test.ts` | validated_host |

### Audit findings

- Iteration 1 of the added schema-42 test used an invalid one-to-one instruction/library row-count assumption (actual: 310 instruction rows and 312 library rows). The assertion was corrected to test non-empty, bounded, source-backed instruction rows; iteration 2 passed.
- The legacy `v27-multi-plan-baseline.sql` upgrade still fails before Phase 17 migration 37 with `no such column: dirty_since_ms` from a stale pre-Phase-17 backup trigger. This is the known pre-phase schema-27 global debt, proven by `tests/sqlite-host/migrations-effects.test.ts`; it is not classified as a Phase 17 gap because the v8→42 Phase 17 path passes.
- No implementation files were changed. No native APK, device, 39-case execution, consolidated evidence JSON, or global host-suite PASS is claimed here.

## Pre-mortem controls

| Likely failure | Earliest detector | Mitigation |
|---|---|---|
| Phase 17 invents names/store/theme before upstream lands | 17-01 compile/boundary/conformance tests | Stop and repair Phase 13/14; one adapter only. |
| Same-day sessions collapse or empty reload seeds fixtures | 17-11 real SQLite restart test | Stable root/revision/slot order and loaded-empty state. |
| Existing deep route disappears during summary/restyle | 17-03/05/06/07 route registry tests | Default navigation changes only; direct route matrix retained. |
| Hidden variant fields or stale drafts overwrite source | 17-09/10 discriminated payload tests | Explicit selected-variant construction and revision conflict review. |
| Collision partially writes two schedules | 17-12 failure-cut integration | One command over both reviewed revisions and one receipt. |
| Native proof is stale or leaks user data | 17-13 verifier mutation tests | Exact artifact binding and recursive privacy rejection. |

## Final validation command sequence

1. npm run typecheck
2. npm run lint
3. npm run check:boundaries
4. npm run test:unit -- --runInBand
5. npm run test:components -- --runInBand
6. npm run test:sqlite:host -- --runInBand
7. npm run test:integration -- --runInBand
8. npm run test:coverage -- --runInBand
9. npm run verify:cng
10. npm run android:devtest:fresh -- --suite phase17
11. npm run test:maestro:phase17 -- --manifest artifacts/native/phase17/build.json
12. test -f .planning/phases/17-library-running-plans/evidence/phase17-library-running.json
13. npm run verify:phase17:evidence -- --manifest artifacts/native/phase17/build.json --all

Set nyquist_compliant and wave_0_complete to true only after the execution-time audit confirms every mapped test/evidence file exists and all commands pass against the same source/APK identity.

## Owner-directed native validation handoff

Plan 17-14 implemented the bounded runner, all three Maestro flow sources, package binding, static flow coverage, and manifest/evidence self-tests. The owner explicitly deferred build, install, device mutation, native execution, the global host suite, and creation of a passed evidence JSON. `nyquist_compliant` and `wave_0_complete` therefore remain false.

Phase 20 must run, against one newly retained exact-source development-test APK, in this order:

1. `npm run test:unit -- --runInBand`
2. `npm run test:components -- --runInBand`
3. `npm run test:sqlite:host -- --runInBand`
4. `npm run test:integration -- --runInBand`
5. `npm run test:coverage -- --runInBand`
6. `npm run verify:cng`
7. `npm run android:devtest:fresh -- --suite phase17`
8. `npm run test:maestro:phase17 -- --manifest artifacts/native/phase17/build.json --all --execute`
9. Create the privacy-safe consolidated evidence only from the retained run artifacts, then run `npm run verify:phase17:evidence -- --manifest artifacts/native/phase17/build.json --all`.

No current artifact hash, device identity, report hash, case PASS, or native/global-suite PASS is claimed by this phase implementation record.
