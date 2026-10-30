---
phase: 10-advanced-set-timing
plan: 05
type: execute
wave: 5
depends_on: [10-04]
files_modified:
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - tests/integration/advanced-timing.test.ts
autonomous: true
gap_closure: true
requirements: [WORK-26]
estimate:
  tokens: 30000
  raw_tokens: 30000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "D-02: the owner can assign inherit, off, per-rep, or cluster independently to every authored warm-up and working-set target, and those ordinal-specific choices survive owned-plan reload and workout snapshot creation."
    - "D-02: every editable warm-up and working set in an active session exposes its own timing summary and editor; saving one row changes only that row, while completed or skipped rows remain read-only."
    - "D-01: independent row configuration retains the existing haptic, audio, or both channel choices supplied by AdvancedTimingConfigSheet."
    - "D-03 and D-04: the gap closure reuses the separate advanced-timing command/repository boundary and leaves recorded set facts, workout facts, undo facts, between-set rest facts, and cue behavior unchanged."
    - "The existing integrity coverage gate remains green at exact 100% for registered Phase 10 command and repository files."
  artifacts:
    - {path: src/ui/screens/OwnedPlanEditorScreen.tsx, provides: ordinal-specific warm-up and working-target timing authoring}
    - {path: src/ui/screens/ActiveWorkoutScreen.tsx, provides: row-scoped active-session timing controls for editable warm-up and working sets}
    - {path: src/ui/__tests__/OwnedPlanEditor.test.tsx, provides: component proof that plan rows retain distinct timing choices}
    - {path: src/ui/__tests__/ActiveWorkoutScreen.test.tsx, provides: component proof of row targeting and read-only completed or skipped states}
    - {path: tests/integration/advanced-timing.test.ts, provides: durable per-row snapshot and protected-fact integrity matrix}
  key_links:
    - {from: OwnedPlanEditorScreen row timing controls, to: OwnedPlanOccurrenceInput warmups and targets, via: ordinal-preserving TargetDraft collections passed to the existing savePlan aggregate}
    - {from: ActiveWorkoutScreen row timing controls, to: advancedTimingRepository, via: the existing updateSessionSetAdvancedTiming command with selected set ID and expected revisions}
    - {from: owned-plan timing overrides, to: session_sets timing snapshots, via: the existing owned-plan repository and workout-start snapshot resolution}
---

<objective>
Close the single Phase 10 verification gap by making D-02's already-supported per-set timing model reachable for each warm-up and working set in plan authoring and active-session editing.

Purpose: Fulfill WORK-26 without redesigning persistence or broadening the phase: preserve D-01 channel selection, D-03 separation from between-set rest, and D-04's advisory-only integrity boundary.
Output: Row-specific plan and session timing controls plus focused component, persistence, and protected-fact regression coverage.
</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/10-advanced-set-timing/10-CONTEXT.md
@.planning/phases/10-advanced-set-timing/10-RESEARCH.md
@.planning/phases/10-advanced-set-timing/10-VERIFICATION.md
@.planning/phases/10-advanced-set-timing/10-03-SUMMARY.md
@.planning/phases/10-advanced-set-timing/10-04-SUMMARY.md

Gap boundary: only the failed truth in `10-VERIFICATION.md` is actionable. The advanced config/state types, migration 21, owned-plan repository, session snapshot resolver, revision-checked session commands, cue adapters, timing indicator, and between-set rest implementation are established and must remain unchanged.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Carry distinct warm-up and working-target timing from plan UI through durable session snapshots</name>
  <files>src/ui/screens/OwnedPlanEditorScreen.tsx, src/ui/__tests__/OwnedPlanEditor.test.tsx, tests/integration/advanced-timing.test.ts</files>
  <read_first>src/ui/screens/OwnedPlanEditorScreen.tsx, src/ui/__tests__/OwnedPlanEditor.test.tsx, src/domains/plans/ownedPlanCommands.ts, src/platform/sqlite/repositories/ownedPlanRepository.ts, src/platform/sqlite/repositories/plansWorkoutRepository.ts, tests/integration/advanced-timing.test.ts, .planning/phases/10-advanced-set-timing/10-VERIFICATION.md</read_first>
  <behavior>
    - "D-02: configuring two warm-ups and multiple working targets with different inherit, off, per-rep, and cluster selections retains each selection at its own ordinal instead of copying one value across the collection."
    - "D-01: each non-inherited row retains its selected haptic, audio, or both channel value through the existing canonical config sheet."
    - "Saving and reloading the owned plan preserves each warm-up/target override, and workout creation copies the distinct resolved configs into the matching session set rows with set-over-exercise precedence."
    - "Changing the requested warm-up or working-set count preserves still-present ordinal drafts, initializes newly added rows to inherit, and removes only truncated ordinal drafts."
  </behavior>
  <action>Replace `TargetDraft.advancedTimingWorkingOverride` with ordinal-preserving warm-up and working-target timing collections, and add the smallest warm-up input surface needed to create valid `OwnedPlanWarmupInput` rows (`count`, nonnegative load, and positive repetitions) instead of always emitting `warmups: []`. Keep the existing shared metric target fields for working sets. When either row count changes, retain overrides for surviving ordinals, append `null` for new rows, and discard only removed tail rows. In `TargetEditor`, render a compact summary and a distinctly named timing action for every generated row (`Warm-up W1 timing`, `Working set 1 timing`, and corresponding stable test IDs), opening the existing `AdvancedTimingConfigSheet` with `scope="set"`; do not fork its mode, validation, channel, focus, or target-size behavior. Build `OwnedPlanOccurrenceInput.warmups` and `.targets` from their matching ordinal entries, including explicit `null` for inherit and never fanning one override across the collection. Per D-02, prove the UI payload with two warm-ups and at least three working targets using different choices. Extend the existing integration fixture through the real owned-plan repository and workout-start path to save, reload, and snapshot distinct per-row overrides/resolved configs. Preserve existing plan identities, revision/idempotency semantics, and all repository/domain APIs; no migration or storage-layer change is needed.</action>
  <verify>
    <automated>npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanEditor.test.tsx -t "stages independent warm-up and working-set timing overrides by ordinal" &amp;&amp; npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts -t "round-trips independent warm-up and working-set timing overrides through owned plan and session snapshots"</automated>
  </verify>
  <acceptance_criteria>D-02 is reachable in plan authoring: every generated warm-up and working target has its own inherit/off/per-rep/cluster control, the save payload preserves row identity and channel choice, and repository reload plus workout creation retain the same ordinal-specific values and precedence.</acceptance_criteria>
  <done>An owner can author one exercise whose warm-ups and working targets use different advanced-timing choices, save it, reload it, and start a workout with those exact per-row snapshots.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expose row-scoped active-session timing and prove protected-fact isolation</name>
  <files>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, tests/integration/advanced-timing.test.ts</files>
  <read_first>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/components/AdvancedTimingConfigSheet.tsx, src/platform/sqlite/repositories/advancedTimingRepository.ts, tests/integration/advanced-timing.test.ts, .planning/phases/10-advanced-set-timing/10-04-SUMMARY.md</read_first>
  <behavior>
    - "D-02: every planned or draft warm-up and working set exposes a uniquely named timing summary/action and opens the sheet seeded from that exact row."
    - "Saving warm-up W1, working set 1, and working set 2 in sequence sends their own set IDs and current expected revisions, then updates only the matching rendered summary."
    - "Completed or skipped warm-up and working-set rows show their effective timing read-only and cannot invoke updateSessionSetAdvancedTiming."
    - "D-03/D-04: multiple row updates change only the selected rows' advanced timing override/resolved JSON plus their required revisions; completed set facts, workout outcome fields, undo state, rest state/revision, rest effects, and other row timing configs remain unchanged."
  </behavior>
  <action>Move the existing active-working-set-only timing summary/action into a reusable row-scoped rendering path owned by `ActiveWorkoutScreen`, adjacent to each mapped warm-up and working `SetRow`. Use unique accessible labels and test IDs that include row kind and ordinal so repeated controls are unambiguous. For `planned` or `draft` rows, open the unchanged `AdvancedTimingConfigSheet` with the exact `{ exercise, set }` selected; for `completed` or `skipped` rows, show the effective summary and read-only explanation without an action. Continue saving exclusively through `updateSessionSetAdvancedTiming` and the existing `saveAdvancedTimingConfig`/`applySetTimingConfig` path; it already maps both warm-up and working arrays, uses expected session/set revisions, and projects only the committed row. Do not add a new command, repository method, timer state, cue path, rest call, or notification behavior. Add component tests that edit at least one warm-up and two working rows with different D-01/D-02 choices, assert exact command inputs and no summary bleed, cover completed/skipped read-only states, and retain the current active-working-set regression. Extend the integration integrity case to update a warm-up plus multiple planned working rows sequentially, assert their independent stored values and monotonic expected revisions, and compare the established protected-fact snapshots so D-03/D-04 remain intact.</action>
  <verify>
    <automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx -t "configures warm-up and working-set timing independently by row|keeps completed and skipped set timing read-only" &amp;&amp; npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts -t "updates independent warm-up and working-set overrides without touching protected facts" &amp;&amp; npm run test:coverage -- --runInBand</automated>
  </verify>
  <acceptance_criteria>D-02 is reachable for every editable active-session row and no save can target a sibling row accidentally; D-01 channel data remains row-specific; D-03/D-04 are proven by byte/value equality for protected workout, completed-set, undo, rest, and rest-effect facts; the existing exact-100% integrity gate passes without changing its registration list.</acceptance_criteria>
  <done>Warm-ups and working sets can be configured independently in the active workout, read-only rows stay protected, and all timing persistence/integrity regressions pass.</done>
</task>

</tasks>

<source_audit>

| SOURCE | ID | Feature / constraint | Plan coverage | Status |
|---|---|---|---|---|
| GOAL | - | Per-rep and cluster timing configurable per exercise/set with advisory cues | 10-01..10-04 plus 10-05 row reachability | COVERED |
| REQ | WORK-26 | Both timing modes, per-exercise/per-set configuration, persistence, lifecycle safety | 10-01..10-05 | COVERED |
| RESEARCH | - | Exercise default plus per-set override, set-over-exercise precedence, immutable session snapshot | 10-03 plus Task 1 | COVERED |
| RESEARCH | - | Separate state/revisions/table and protected-fact equality | 10-01/10-02/10-04 plus Task 2 regression | COVERED |
| RESEARCH | - | Exact integrity-critical coverage and component behavior tests | 10-04 plus Tasks 1-2 | COVERED |
| CONTEXT | D-01 | Existing haptic/audio/both channel choice | 10-03/10-04 plus row-specific retention in Tasks 1-2 | COVERED |
| CONTEXT | D-02 | Independent exercise/set configuration and durable lifecycle | Tasks 1-2 close the verifier gap | COVERED |
| CONTEXT | D-03 | Advanced timing remains separate from between-set rest | 10-01/10-04 plus Task 2 non-regression | COVERED |
| CONTEXT | D-04 | Cue/config behavior never redefines recorded facts | 10-03/10-04 plus Task 2 protected-fact matrix | COVERED |

Deferred eccentric/concentric split cues and automatic rep detection remain excluded exactly as recorded in `10-CONTEXT.md`.
</source_audit>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| Owner input -> plan draft | Repeated row controls produce structured timing configs and warm-up values before the revision-checked aggregate save. |
| Active workout UI -> runtime command | A selected row ID plus expected session/set revisions crosses into the private SQLite writer. |
| SQLite session snapshot -> rendered row | Persisted per-row config is projected back into summaries and the timing sheet. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-10-05-01 | Tampering | OwnedPlanEditorScreen ordinal collections | medium | mitigate | Preserve ordinal-to-config association during count changes and assert distinct serialized warm-up/target values through repository reload and workout snapshot creation. |
| T-10-05-02 | Tampering | ActiveWorkoutScreen row selection | high | mitigate | Bind each action to the exact row ID/revision, keep existing revision-checked updateSessionSetAdvancedTiming, and test sequential edits for no cross-row bleed. |
| T-10-05-03 | Elevation of privilege | Completed/skipped session rows | high | mitigate | Omit edit actions for immutable rows and retain repository status guards; component and integration tests prove rejected mutation paths remain unreachable or fail closed. |
| T-10-05-04 | Tampering | Recorded workout/rest/undo facts | high | mitigate | Reuse the advanced-only repository command and compare protected facts before/after multi-row config changes, allowing only documented timing JSON and revision deltas. |
| T-10-05-SC | Tampering | Package supply chain | low | accept | No package-manager install or dependency change exists in this plan; the lockfile remains outside `files_modified`. |
</threat_model>

<verification>
1. Run the two named component tests and two named integration tests from the task gates.
2. Run `npm run typecheck`, `npm run lint`, and `npm run check:boundaries`.
3. Run the complete `OwnedPlanEditor.test.tsx`, `ActiveWorkoutScreen.test.tsx`, and `advanced-timing.test.ts` suites.
4. Run `npm run test:coverage -- --runInBand` and require the existing Phase 10 integrity-critical registrations to remain exactly 100% for statements, branches, functions, and lines.
5. Confirm the diff is limited to the five declared files and contains no migration, repository, state-machine, cue-port, rest, notification, backup, or unrelated UI changes.
</verification>

<success_criteria>
- The sole failed truth in `10-VERIFICATION.md` is closed: warm-ups and working sets are independently configurable in both owned-plan authoring and active-session editing.
- Distinct inherit/off/per-rep/cluster selections and D-01 channel choices persist per row through save, reload, and workout snapshot resolution.
- Completed/skipped rows remain read-only, while every editable row uses the existing revision-checked command and updates only itself.
- D-03/D-04 protected facts remain unchanged and the established Phase 10 exact-100% integrity gate passes.
</success_criteria>

<output>
Create `.planning/phases/10-advanced-set-timing/10-05-SUMMARY.md` when done.
</output>
