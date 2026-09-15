---
phase: 11-portable-history-merge-restore
plan: 02
type: execute
wave: 2
depends_on: [11-01]
files_modified:
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergeCommands.ts
  - src/domains/portability/mergeCommands.test.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/restorePreflightAdapters.ts
  - src/platform/sqlite/repositories/restoreReconciliationRepository.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/testing/contracts/portableMerge.contract.ts
  - src/testing/contracts/portableMerge.contract.test.ts
  - app/__native-contracts.tsx
  - scripts/run-native-sqlite-contracts.mjs
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/restoreReconciliationRepository.test.ts
  - tests/integration/portable-merge.test.ts
  - scripts/run-coverage-gate.mjs
  - package.json
autonomous: true
requirements: [DATA-08, DATA-09]
must_haves:
  truths:
    - "D-01: complete FK-closed aggregates implement newest-by-timestamp for sessions/corrections/void, local existing-wins for settings, and keep-both for distinct custom exercises/plans with same-identity dedup."
    - "D-02: all duplicate detection uses owner-scoped portable identity, never names, timestamps, mutable content, or physical IDs; physical-ID collisions are remapped deterministically with every child FK rewritten."
    - "D-03: GTBK v1 remains restore-clean only and GTBK v2 carries every merge-required identity and authoritative Phase 9-11 source fact."
    - "D-04: the full conflict matrix remains one precomputed plan and one private-writer transaction; any unmappable child, conflict, stale preview, cancellation, or injected write failure leaves the existing canonical DB byte-unchanged."
    - "A successful mixed-class merge rebuilds FTS, history projections, recommendation projections, and any Phase 9/10 projections to one deterministic verified digest before ready."
    - "The populated-database merge contract runs against real Expo SQLite, not only the host adapter."
  artifacts:
    - {path: src/domains/portability/mergePlan.ts, provides: pure aggregate classifier, comparator, ID remap, and conflict-plan builder}
    - {path: src/platform/sqlite/repositories/logicalMergeRepository.ts, provides: full-class atomic merge writer}
    - {path: src/testing/contracts/portableMerge.contract.ts, provides: host/device-shared populated merge and rollback cases}
    - {path: tests/sqlite-host/logicalMergeRepository.test.ts, provides: exhaustive conflict/FK/fault matrix}
  key_links:
    - {from: D-01 record class, to: FK-closed source aggregate, via: explicit merge registry and comparator}
    - {from: portable identity map, to: local physical keys, via: deterministic collision remap before writer opens}
    - {from: shared portableMerge contract, to: host and Expo runtimes, via: the same repository implementation and named cases}
    - {from: mixed merge commit, to: ready state, via: verified deterministic reconciliation digest}
---

<objective>Expand the verified session tracer into the full D-01 per-record-class engine, including identity-safe keep-both remapping, settings existing-wins, history corrections/void newest-wins, one atomic writer, and shared real-Expo SQLite proof.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md
@.planning/phases/11-portable-history-merge-restore/11-RESEARCH.md
@.planning/phases/11-portable-history-merge-restore/11-01-SUMMARY.md

Read the execution-time `11-01-SUMMARY.md` and actual schema-21 table/reference registry first. The locked aggregate map is in `11-RESEARCH.md` under “D-01 conflict engine”: workout session with session children; correction/void overlays/audits with the session aggregate; each setting key; each custom exercise with library/alias/search/taxonomy/preference/baseline children; and each plan with both legacy/owned plan/schedule/policy/source graphs. `logicalRestoreRepository.ts:100-141,292-395` remains the ordering/transaction precedent and `restoreReconciliationRepository.ts:125-331` remains the parity gate.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Define the complete pure conflict and identity-remap plan</name>
  <files>src/domains/portability/mergePlan.ts, src/domains/portability/mergePlan.test.ts, src/domains/portability/mergeCommands.ts, src/domains/portability/mergeCommands.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md, .planning/phases/11-portable-history-merge-restore/11-RESEARCH.md, src/domains/portability/portableIdentity.ts, src/domains/portability/mergeCommands.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts</read_first>
  <action>Extract a pure, exhaustively validated merge-plan builder from the tracer. Declare every source table's aggregate root and D-01 class; fail closed if a table/row is unclassified or a candidate is not FK-closed. Implement: (1) sessions plus correction/void state as one complete aggregate selected by canonical merge-modified timestamp, then a deterministic canonical payload-digest tie-break when the same stable identity has equal timestamps; (2) settings import only missing keys, with every duplicate local row unchanged; (3) custom exercises and plans dedup only on stable identity, keep distinct identities even with identical visible names/content, and retain every child graph. Build the full identity-to-local-physical-ID map before writing. Same identity/different physical ID maps to the existing key; distinct identity/same physical ID gets a deterministic collision-free local ID and all child FKs/cyclic nullable pointers are rewritten. Never merge an orphan child or combine archive/local fragments of one aggregate. Return bounded counts for inserted, duplicate unchanged, local-won, archive-won, kept-both, remapped, and conflicts without row content. Cover every class, comparator/tie, composite FK, nullable cycle, collision, malformed/unclassified row, integer/size bound, determinism, and order independence. Keep `mergePlan.ts` and changed merge commands at exact 100% via the real gate.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts src/domains/portability/mergeCommands.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-01 is implemented exactly per locked record class; D-02 alone drives dedup and safe physical-ID remapping; malformed/incomplete aggregates fail closed before a writer; the plan is deterministic and fully covered.</acceptance_criteria>
  <reversibility rating="costly">D-01 is the Phase 12 reconciliation contract. Do not add user-selectable per-row overrides or alternative winner rules.</reversibility>
  <done>The pure engine produces one deterministic, FK-closed full-class merge plan and bounded preview.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Apply the full conflict matrix in one all-or-nothing writer</name>
  <files>src/domains/portability/mergeCommands.ts, src/domains/portability/mergeCommands.test.ts, src/platform/sqlite/repositories/logicalMergeRepository.ts, src/platform/sqlite/repositories/restorePreflightAdapters.ts, src/platform/sqlite/repositories/restoreReconciliationRepository.ts, src/bootstrap/workoutAppRuntime.tsx, tests/sqlite-host/logicalMergeRepository.test.ts, tests/sqlite-host/restoreReconciliationRepository.test.ts, tests/integration/portable-merge.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/portability/mergePlan.ts, src/platform/sqlite/repositories/logicalMergeRepository.ts, src/platform/sqlite/repositories/logicalRestoreRepository.ts, src/platform/sqlite/repositories/restoreReconciliationRepository.ts, tests/sqlite-host/logicalRestoreRepository.test.ts</read_first>
  <action>Replace the tracer-only plan/application with the complete plan while retaining D-04's single `kernel.write`. Re-read and fingerprint all affected local aggregates under the writer; reject any stale preview. Apply parent-first inserts/updates with rewritten physical keys, resolve nullable cycles only within that transaction, preserve bundled references, verify every stable identity and selected aggregate, triggers/schema, `foreign_key_check`, and exact expected source digest, then mark rebuild pending. Do not delete/update a local-won setting or local-won aggregate; never catch/continue a row error. Extend fault injection across every record class, operation, cycle fixup, trigger, verification, and commit. For every failure assert canonical authoritative rows, schema/trigger SQL, user_version, and portability state are byte-identical. Test same-name/different-identity exercise and plan both survive with valid complete child graphs; same identity dedups; physical collisions remap; settings remain exact; corrections/void choose newest; and a mixed merge is order-independent. Rebuild every derivative and verify repeatable parity/digest before ready.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/mergeCommands.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/restoreReconciliationRepository.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/portable-merge.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-01 all three policies pass on complete aggregates; D-02 handles duplicate and colliding physical IDs without FK violations; D-04 leaves canonical DB bytes unchanged on every failure and commits all classes together; successful rebuild output is deterministic.</acceptance_criteria>
  <done>The full host/integration merge engine safely reconciles all locked classes in one transaction.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Run populated merge and rollback contracts on real Expo SQLite</name>
  <files>src/testing/contracts/portableMerge.contract.ts, src/testing/contracts/portableMerge.contract.test.ts, app/__native-contracts.tsx, scripts/run-native-sqlite-contracts.mjs, tests/sqlite-host/logicalMergeRepository.test.ts, package.json</files>
  <read_first>src/testing/contracts/migrationsEffects.contract.ts, app/__native-contracts.tsx, scripts/run-native-sqlite-contracts.mjs, tests/sqlite-host/migrations-effects.test.ts, src/platform/sqlite/repositories/logicalMergeRepository.ts</read_first>
  <action>Extend the shared portable-merge contract introduced by Plan 11-01 from its session tracer cases to the full matrix. Add named cases for populated mixed-class success, same-name keep-both, same-identity dedup/remap, session/correction/void newest-wins, settings existing-wins, stale preview, conflict/unmappable graph, injected insert/update/verification/commit rollback, and deterministic derivative parity. Each failure case captures and compares canonical authoritative rows plus schema/trigger metadata before/after. Extend the native route/runner case registry and increase/assert the exact case count so missing cases fail closed. Use the Plan 11 manifest built after the tracer in Plan 11-01; do not rebuild inside this test command and do not add Drive/network dependencies.</action>
  <verify><automated>npm run test:unit -- --runInBand src/testing/contracts/portableMerge.contract.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts &amp;&amp; npm run typecheck</automated><native>npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>D-01/D-02/D-04 mixed merge, FK remap, populated success, rollback byte-equality, and deterministic rebuild execute through actual Expo SQLite with a fail-closed named-case count.</acceptance_criteria>
  <done>The full persistence contract passes on both host SQLite and the declared real Expo artifact.</done>
</task>
</tasks>

<verification>Run the pure conflict matrix, host/integration writer suites, exact `npm run test:coverage` gate, and manifest-bound `portable-merge` real Expo contract. Preserve per-class outcomes, collision/FK evidence, every-failure byte equality, and deterministic derivative digests.</verification>
<success_criteria>Roadmap criteria 1-3 and DATA-08 are complete below the UI: all locked classes reconcile by stable identity and D-01, one atomic transaction fails closed, and success deterministically rebuilds all derivatives.</success_criteria>
<output>Create `.planning/phases/11-portable-history-merge-restore/11-02-SUMMARY.md` when done.</output>
