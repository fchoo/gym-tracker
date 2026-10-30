---
phase: 17-library-running-plans
verified: 2026-10-11T04:42:59Z
status: passed_host
lib_score: 36/36
must_have_score: 42/42
implementation_gaps: []
phase20_native_pending: true
native_pass_claimed: false
pending_items:
  - "Build one retained exact-source development-test APK and manifest."
  - "Install on the designated device and execute all 39 Phase 17 Maestro cases."
  - "Create the privacy-safe, identity-bound consolidated native evidence JSON and run the all-ID verifier."
  - "Perform native visual, accessibility, 200% text, landscape, theme, safe-area, and keyboard/D-pad confirmation."
  - "Run the owner-deferred global combined host checkpoint."
global_debt:
  - concern: "Pre-Phase-17 schema-27 backup-trigger debt"
    evidence: "Legacy v27 upgrade fails before migration 37 with `no such column: dirty_since_ms`; migration 0027's last owning commit is 8b3a83de (Phase 10), and Phase 17's v8-to-42 path passes."
    disposition: "Global Phase 20 debt; unchanged by Phase 17 and not an implementation gap."
decision_coverage:
  honored: manual
  total: 8
  warning: "The automated checker cannot parse D17-NN identifiers and reported `could-not-parse`; manual trace found D17-01 through D17-08 represented by the verified Library, Running, lifecycle, and collision artifacts."
test_quality:
  disabled_requirement_tests: 0
  circular_requirement_tests: 0
  fixture_only_product_state: false
  assertion_level: behavioral_and_value
  note: "Fixtures only drive the A/B/C evidence protocol; real product commands, receipts/source probes, cleanup, and baseline-digest comparisons are required."
---

# Phase 17: Library & Running Plans Verification Report

**Phase goal:** The owner can browse and maintain the complete plan/exercise Library and create, edit, schedule, and explicitly activate persistent structured Running plans.

**Verified:** 2026-10-11T04:42:59Z  
**Status:** `passed_host`  
**Verification mode:** Initial independent verification  
**Scope boundary:** Host implementation and focused host evidence are verified. Native APK/device execution, the 39-case native matrix, visual/accessibility observation, and the combined global checkpoint are explicitly deferred to Phase 20 by owner directive. No native PASS is claimed.

## Verdict

The Phase 17 host implementation achieves the phase goal. It is not a presentation-only Library: routes inject source-backed runtime ports; commits go through SQLite repositories; successful mutations return authoritative readback; revisions, receipts, confirmation tokens, and exclusive transactions protect lifecycle and collision changes.

All **36/36 LIB requirements** and **42/42 plan must-haves** have host-side implementation and behavioral evidence. There are **no implementation gaps**. The unresolved native work is deliberately recorded as Phase 20 pending rather than treated as a missing Phase 17 implementation.

## Goal-Backward Observable Truths

| # | Truth | Status | Independent evidence |
|---|---|---|---|
| 1 | Plans and Exercises have independent remembered search/filter/favorite/detail-return state, source-backed groups, truthful loading/empty/no-match/update/failure/retry states. | VERIFIED | `LibraryScreen` loads runtime snapshots, recent/search sources, and retains per-section state; focused Library/route tests passed (71-test root suite plus 100-test preserved-route suite). |
| 2 | Every Create plan entry, including a true-empty Plans state, opens one neutral Strength/Running chooser and creation remains inactive until a separate reviewed activation. | VERIFIED | `app/(tabs)/library.tsx` routes every create callback to `/library/plan/create`; `PlanTypeChooserScreen` is equal/unselected; chooser/Library/create-route component tests passed. |
| 3 | Strength, starter, custom-exercise, schedule, replacement/removal, metric migration, and lifecycle paths preserve drafts, confirmations, revisions, active-workout guards, and immutable history. | VERIFIED | Source-backed deep routes and component suites passed (100 tests); Family A ran 25 schema-42/v8 product journeys with command receipt, probe, exact cleanup, and logical baseline comparison. |
| 4 | A Running plan supports all seven structured session types with stable identity, validation, source-backed readback, session lifecycle, explicit activation, and no Garmin side effect. | VERIFIED | Running runtime/repository use typed commands and post-commit `readAggregate`; focused component, SQLite-host, and integration suites passed (87 focused component tests; 5 SQLite-host; 11 integration). |
| 5 | Empty and same-weekday multi-session Running plans remain exact through reopen and portability; future collision decisions are explicit, review-gated, atomic, and durable. | VERIFIED | `completeMembership` saves current-slot membership; running SQLite/integration tests prove empty/replay/reorder/portability; collision integration covers all three outcomes, stale, replay, rollback, and Strength isolation. |

**Goal score:** 5/5 observable truths verified on host.

## Plan Must-Haves

Each plan declares three must-haves. The review checked the implemented artifacts and their wiring rather than accepting the summaries.

| Plan | Must-haves | Status | Evidence |
|---|---:|---|---|
| 17-01 | 3/3 | VERIFIED | Create route → `RunningPlanRuntimePort` → SQLite aggregate write → authoritative readback. Real integration covers zero, typed, same-day, inactive/replay paths. |
| 17-02 | 3/3 | VERIFIED | `LibraryScreen` uses runtime snapshots/search; root uses one create callback; chooser has no selection or mutation on entry. |
| 17-03 | 3/3 | VERIFIED | Owned-plan default summary route is source-backed; lifecycle is preview/review/receipt/readback, not direct UI mutation. |
| 17-04 | 3/3 | VERIFIED | Strength create and aggregate editor retain supported metrics/reorder/recovery; focused UI and owned-plan integration coverage passed. |
| 17-05 | 3/3 | VERIFIED | Schedule, replacement, and removal use expected revisions, preview token, confirmation, and current-workout recheck. |
| 17-06 | 3/3 | VERIFIED | Starter source remains immutable; copy is inactive; update/activation use reviewed current source facts. |
| 17-07 | 3/3 | VERIFIED | Bundled instruction facts have migration/import/read path; custom identity, editing, archive, copy, and metric migration use real command paths. |
| 17-08 | 3/3 | VERIFIED | Running detail reads lifecycle from `plans.is_active` plus `running_plans.status`; activate/archive/reactivate use revision-fenced preview and readback. |
| 17-09 | 3/3 | VERIFIED | Recovery/Long run/Progression child routes allocate persisted identities only inside the runtime command and retain common fields on kind changes. |
| 17-10 | 3/3 | VERIFIED | Tempo/Intervals/Hills/Fartlek remain discriminated structured variants; no prose-blob replacement or hidden-field payload was found. |
| 17-11 | 3/3 | VERIFIED | Migration 39 and exact-membership saves keep stable slot roots/revisions, true empty, same-day order, receipts, and portable history. |
| 17-12 | 3/3 | VERIFIED | Collision sheet has equal no-default choices and a second confirmation; repository commits one revision/token-fenced dual-schedule outcome. |
| 17-13 | 3/3 | VERIFIED | Canonical 39-case ledger and verifier reject missing/duplicate/skipped/stale/privacy-unsafe/fixture-only evidence. Static suite passed 19/19. |
| 17-14 | 3/3 | VERIFIED (host tooling) | Runner requires `--execute`, validates fixture IDs, restores device presentation state in `finally`, and never writes consolidated evidence. Native execution is intentionally pending. |

**Must-have score:** 42/42 verified.

## LIB Requirements Coverage

| Requirement | Status | Host evidence |
|---|---|---|
| LIB-01 | VERIFIED | Independent Library view/query/filter/favorite/return state in `LibraryScreen`; root/component tests passed. |
| LIB-02 | VERIFIED | Runtime-backed Active/My/Starter groups with sport/source identity and active-pair constraints. |
| LIB-03 | VERIFIED | Separate plan search, retained query on filter clear, and no-match versus true-empty state coverage. |
| LIB-04 | VERIFIED | Runtime-backed Favorites/Recent/All exercises, favorite toggles, and metric/equipment search context. |
| LIB-05 | VERIFIED | Actions sheet routes Create actions; Import is disabled/inert rather than falsely implemented. |
| LIB-06 | VERIFIED | Single neutral chooser route for populated and true-empty Plans states. |
| LIB-07 | VERIFIED | True-empty create copy and same chooser callback are present and tested. |
| LIB-08 | VERIFIED | Owned Strength summary route renders status, schedule, history, source, and training days before actions. |
| LIB-09 | VERIFIED | Explicit edit/schedule/duplicate/archive/reactivate and separate reviewed activation across owned/Running details. |
| LIB-10 | VERIFIED | Immutable starter facts, preview activation, and inactive editable-copy path. |
| LIB-11 | VERIFIED | Current affected-schedule preview and explicit activation confirmation. |
| LIB-12 | VERIFIED | `mode=update` comparison and new-copy path preserve old owned history. |
| LIB-13 | VERIFIED | Strength create captures name/first day, opens real editor, commits inactive readback. |
| LIB-14 | VERIFIED | Supported Strength day/exercise/set/metric add/move/remove editing retained; retired cadence/cluster UI remains absent. |
| LIB-15 | VERIFIED | Draft recovery, retry, conflict, duplicate/archive confirmation, and immutable history paths pass host tests. |
| LIB-16 | VERIFIED | Prospective selected-day/rotation/effective-date schedule save with revisions and sport ownership rules. |
| LIB-17 | VERIFIED | Scoped replacement, compatible metrics, target review, refreshed impact preview, and confirmation. |
| LIB-18 | VERIFIED | Removal impact, binding choice, effective date, active-workout guard, and preserved history. |
| LIB-19 | VERIFIED | Bundled detail reads instruction/source facts from `exercise_instruction_sets`; source import test verifies 310 instruction rows. |
| LIB-20 | VERIFIED | Custom identity/manual progression, real editor, and explicit archive command paths. |
| LIB-21 | VERIFIED | Valid custom name/tracking/equipment creation opens detail and retains supported metric profiles. |
| LIB-22 | VERIFIED | Copy and metric migration retain policy/impact/confirmation/active-workout guards. |
| LIB-23 | VERIFIED | Loading/query failure/refresh retry/missing/update states are represented in Library and deep-route components. |
| LIB-24 | VERIFIED | Running detail reads saved goal/pacing/schedule/ordered sessions; Garmin is contextual only; collision entry is available. |
| LIB-25 | VERIFIED | Inactive Running create supports source-backed structured sessions and optional post-create Garmin context. |
| LIB-26 | VERIFIED | Goal validation and edits persist through readback for detail and downstream Progress consumers. |
| LIB-27 | VERIFIED | Committing session routes expose common fields, preview, save, stable IDs/revisions, and delete behavior. |
| LIB-28 | VERIFIED | Recovery supports volume and pace/HR-zone/RPE Easy target. |
| LIB-29 | VERIFIED | Long run supports volume, effort target, and three finish options. |
| LIB-30 | VERIFIED | Progression supports volume, stages, and distinct start/finish targets. |
| LIB-31 | VERIFIED | Tempo continuous/repeats shapes enforce appropriate repeats/recovery fields. |
| LIB-32 | VERIFIED | Intervals retain repeats, work quantity, recovery, and pace/HR-zone/RPE target. |
| LIB-33 | VERIFIED | Hills retain repeats, uphill quantity, return recovery, and effort target. |
| LIB-34 | VERIFIED | Fartlek structured/unstructured shapes retain distinct cue/recovery fields and effort target. |
| LIB-35 | VERIFIED | CRUD/order persists stable slots; final deletion stays empty after reopen; no fixture defaults are restored. |
| LIB-36 | VERIFIED | Move run, Move strength, and Keep both use actual future dates, no default choice, second confirmation, atomic durable outcome. |

**LIB score:** 36/36 verified on host.

## Critical Artifact and Wiring Trace

| Artifact / link | Levels checked | Status | Evidence |
|---|---|---|---|
| `app/(tabs)/library.tsx` → `LibraryScreen` → runtime browse/search ports | Exists, substantive, wired, flowing | VERIFIED | The tab route injects real runtime callbacks; `LibraryScreen` loads browse snapshot, recent exercises, and search results rather than a static list. |
| Library Create plan → `/library/plan/create` → `PlanTypeChooserScreen` | Exists, substantive, wired | VERIFIED | One `onCreatePlan` callback serves action sheet and true-empty state; chooser only routes after explicit Strength/Running press. |
| Running create/edit/session routes → `RunningPlanRuntimePort` | Exists, substantive, wired | VERIFIED | Route wrappers use the context port; screens do not import SQLite. |
| `RunningPlanRuntimePort` → Running commands/repository → SQLite → `readAggregate` | Exists, substantive, wired, flowing | VERIFIED | Create/save/session/lifecycle return committed source-table readback; code throws on missing readback. Focused real-SQLite tests pass. |
| Running lifecycle | Exists, substantive, wired, behavioral | VERIFIED | Preview token + expected revisions + receipt command; activation replaces only active Running, and test asserts Strength rows unchanged. |
| Collision sheet → collision repository | Exists, substantive, wired, behavioral | VERIFIED | One `commitScheduleCollisionChoice` command is bound to both current revisions and token; integration covers all three choices, stale, hash conflict, replay, rollback. |
| Migrations 37–42 → migration registry → logical v8 graph | Exists, substantive, wired, behavioral | VERIFIED | `migrations/index.ts` registers 0037–0042; schema-42/v8 matrix passed all 26 tests. |
| Source instructions → import → `exercise_instruction_sets` → exercise detail | Exists, substantive, wired, flowing | VERIFIED | Migration 37 table, importer upsert, repository/detail read port, and UI rendering retain provenance. `content-import` test passed 11/11 and asserts 310 rows. |
| Canonical ledger → static runner/flow checks | Exists, substantive, wired | VERIFIED | 39-case contract is consumed by runner and verified by 19 passing fail-closed self-tests. |

## High-Risk Behavioral Evidence

| Behavior | Independent command | Result |
|---|---|---|
| Schema 42, logical v8, instruction/receipt path, and Family A real product commands | `npm run test:integration -- --runInBand tests/integration/phase17-family-a-cleanup-matrix.test.ts` | PASS — 26 tests; 25 matrix journeys; post-cleanup digest equals baseline. |
| 39-case fixture ledger rejects fake or partial proof | `npm run test:evidence:phase17` | PASS — 19 tests, including missing/mismatched lifecycle, payload leakage, wrong receipt, skipped/unmapped case, fixture leak, and duplicate-guard rejection. |
| Running empty/same-day/replay/lifecycle boundary | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/running-plans.test.ts` | PASS — 5 real SQLite tests. |
| Running authoring, portability, and collision outcomes | `npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts tests/integration/multi-plan-portability.test.ts tests/integration/running-schedule-collision.test.ts` | PASS — 11 tests. |
| Library, chooser, all session variants, lifecycle, collision UI | Focused `test:components` invocation over 7 suites | PASS — 71 tests. |
| Preserved Strength/starter/custom/deep routes | Focused `test:components` invocation over 9 suites | PASS — 100 tests. |
| Source-backed catalog import | `npm run test:integration -- --runInBand tests/integration/content-import.test.ts` | PASS — 11 tests; atomic/idempotent import and 310 instruction entries verified. |
| Type and boundary conformance | `npm run typecheck`, `npm run lint`, `npm run check:boundaries` | PASS — boundary check reports 374 files. |

## Test Quality and Anti-Pattern Audit

- No `TBD`, `FIXME`, or `XXX` marker was found in the core Phase 17 Running/Library runtime, repository, component, or migration artifacts examined.
- No disabled/skipped/todo test was found among the requirement-linked test files inspected.
- The critical tests make behavioral/value assertions: source readback equals committed aggregate, inactive flags remain false, same-day ordinals remain `[0, 1]`, Strength stays unchanged when Running activates, receipts replay exactly, stale/failure paths reject without partial state, and cleanup returns to the original logical digest.
- This is not fixture-only product state. The fixtures establish isolated preconditions, but every high-risk matrix case invokes a labelled production command and then checks its durable receipt/result before token-bound cleanup. The evidence suite explicitly fails when a case uses setup state as proof.
- Two non-failing React `act(...)` test-environment warnings and one Expo Go notifications warning were emitted during component tests. The corresponding suites completed successfully and the warnings did not identify a Phase 17 user-visible or state-integrity failure.

## Security and Source Ownership

The Phase 17 security register reports 45 threats: 43 mitigated with implementation/test evidence and 2 owner-approved low-risk accepts (disabled import affordance and bounded missing-detail copy). No open high-severity threat remains. The review confirms no Phase 17 table/repository/preference-store/theme namespace substitutes for the established authorities; the one new instruction data model is a registered SQLite migration with importer and source-provenance reads.

## Native and Global Validation Deferred to Phase 20

`artifacts/native/phase17/build.json` and `.planning/phases/17-library-running-plans/evidence/phase17-library-running.json` do not exist. This is expected: the owner prohibited exact-source APK build/install, device mutation, native execution, a fabricated evidence PASS, and the global combined checkpoint in Phase 17.

The checked runner is intentionally fail-closed:

- `--execute` is required before it can contact a device.
- It plans the bounded canonical 39-case ledger.
- It never writes consolidated evidence itself.
- It restores device size, density, font scale, night mode, and animation settings in `finally`.

These items remain pending Phase 20 validation, not implementation gaps.

## Global Debt and Decision Gate

- **Schema-27 debt:** The legacy v27 baseline fails before migration 37 because an old backup trigger references `dirty_since_ms`. This belongs to migration 0027 / Phase 10 (`8b3a83de`), not the Phase 17 change set. The independently tested v8→42 route passes, so this is correctly recorded as global Phase 20 debt.
- **Decision-coverage tool warning:** The tool returned `could-not-parse` because it only parses `D-NN` while this phase uses `D17-NN`. Manual verification traced all eight decisions: Library state and neutral chooser (D17-01/02), inactive creation/lifecycle (D17-03), goal inputs (D17-04), typed fields (D17-05), session lifecycle/true empty (D17-06), same-day/recovery order (D17-07), and collision choice (D17-08). The parser warning does not affect this host verdict.

---

_Verifier: TRAE (independent goal-backward verification)_  
_No implementation files, commits, APKs, native runs, global runs, or Phase 14 files were changed._
