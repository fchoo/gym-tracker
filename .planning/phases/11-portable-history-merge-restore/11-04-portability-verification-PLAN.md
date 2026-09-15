---
phase: 11-portable-history-merge-restore
plan: 04
type: execute
wave: 4
depends_on: [11-03]
files_modified:
  - src/domains/portability/portableIdentity.test.ts
  - src/domains/portability/backupContracts.test.ts
  - src/domains/portability/backupFormat.test.ts
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergeCommands.test.ts
  - src/platform/sqlite/repositories/restorePreflightAdapters.test.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/testing/contracts/migrationsEffects.contract.ts
  - src/testing/contracts/portableMerge.contract.ts
  - src/testing/contracts/portableMerge.contract.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/restoreReconciliationRepository.test.ts
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/integration/portable-merge.test.ts
  - scripts/run-coverage-gate.mjs
  - scripts/run-phase11-maestro.mjs
  - scripts/phase11-evidence-scripts.test.mjs
  - maestro/phase11/portable-merge.yaml
  - package.json
autonomous: true
requirements: [DATA-08, DATA-09]
must_haves:
  truths:
    - "D-01: final evidence covers every locked record class and outcome, deterministic equal-timestamp handling, same-name/different-identity keep-both, and complete FK graphs."
    - "D-02: schema-21 migration/backfill, immutable new identities, v2 export/import across fresh and populated devices, and identity-based dedup all pass host plus real Expo SQLite contracts."
    - "D-03: frozen GTBK v1 fixtures restore-clean successfully while v1 merge rejects safely; GTBK v2 restores clean and merges without losing Phase 9/10/11 authoritative facts."
    - "D-04: auth, parse, validation, conflict, cancel, stale plan, insert/update/delete/fixup/trigger/FK/verification/commit failures each leave canonical authoritative DB bytes and schema/trigger metadata unchanged."
    - "Successful merge deterministically rebuilds FTS and every projection/recommendation derivative, with identical source/derivative digests across repeated rebuild and equivalent import order."
    - "The real gate `npm run test:coverage` invokes `scripts/run-coverage-gate.mjs`; every identity/format/merge/migration/writer integrity-critical module is exactly 100% statements/branches/functions/lines."
    - "Phase 11 Maestro and component matrices prove lifecycle-visible behavior and accessibility, while native SQLite contracts—not screenshots—prove persistence safety."
  artifacts:
    - {path: tests/sqlite-host/cleanInstallRestore.test.ts, provides: frozen old-backup clean restore and v2 fresh-device round trips}
    - {path: src/testing/contracts/portableMerge.contract.ts, provides: real Expo populated merge/failure/rebuild matrix}
    - {path: scripts/run-coverage-gate.mjs, provides: exact 100% integrity-critical per-file gate}
    - {path: scripts/phase11-evidence-scripts.test.mjs, provides: fail-closed D-id/DATA-id/roadmap evidence mapping}
  key_links:
    - {from: D-01..D-04 and DATA-08/DATA-09, to: named host/device/component/Maestro evidence, via: phase11 evidence matrix}
    - {from: npm run test:coverage, to: scripts/run-coverage-gate.mjs, via: exact per-file thresholds for all integrity-critical changes}
    - {from: frozen GTBK v1 fixture, to: current clean restore, via: dual-version envelope/logical adapters}
    - {from: successful source merge, to: ready, via: deterministic full-derivative parity verification}
---

<objective>Close Phase 11 with exhaustive fail-closed, compatibility, portability, deterministic-rebuild, accessibility, real Expo SQLite, and lifecycle evidence tied directly to D-01..D-04, DATA-08/DATA-09, and all four roadmap criteria.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md
@.planning/phases/11-portable-history-merge-restore/11-RESEARCH.md
@.planning/phases/11-portable-history-merge-restore/11-03-SUMMARY.md

Verification anchors that exist at plan time: `tests/sqlite-host/logicalRestoreRepository.test.ts:375-405` for per-stage rollback comparisons; `tests/sqlite-host/cleanInstallRestore.test.ts:345-460` for fresh restore plus derivative rebuild; `src/testing/contracts/migrationsEffects.contract.ts:1-40,122-130` for shared real Expo contracts; `scripts/run-coverage-gate.mjs:16-23,60-101` for exact per-file 100%; `app/more/__tests__/data-and-recovery.test.tsx:273-429`; and `maestro/phase5/data-recovery.yaml:7-27`. At execution, also read all 11-01..11-03 summaries and use the single `artifacts/native/phase11/build.json` produced earlier.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Complete compatibility, fail-closed, and deterministic-rebuild matrices</name>
  <files>src/domains/portability/portableIdentity.test.ts, src/domains/portability/backupContracts.test.ts, src/domains/portability/backupFormat.test.ts, src/domains/portability/restoreCommands.test.ts, src/domains/portability/mergePlan.test.ts, src/domains/portability/mergeCommands.test.ts, src/platform/sqlite/repositories/restorePreflightAdapters.test.ts, src/bootstrap/workoutAppRuntime.test.tsx, src/testing/contracts/migrationsEffects.contract.ts, src/testing/contracts/portableMerge.contract.ts, src/testing/contracts/portableMerge.contract.test.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, tests/sqlite-host/logicalMergeRepository.test.ts, tests/sqlite-host/restoreReconciliationRepository.test.ts, tests/sqlite-host/cleanInstallRestore.test.ts, tests/integration/portable-merge.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md, .planning/phases/11-portable-history-merge-restore/11-RESEARCH.md, scripts/run-coverage-gate.mjs, tests/sqlite-host/logicalRestoreRepository.test.ts, tests/sqlite-host/cleanInstallRestore.test.ts, src/testing/contracts/migrationsEffects.contract.ts, src/testing/contracts/portableMerge.contract.ts</read_first>
  <action>Finish one requirements/decision matrix with no mocked persistence substitute. Freeze representative pre-Phase-11 GTBK v1 encrypted fixtures (within test fixtures, containing no secrets) and prove current code restore-cleans them onto a fresh DB, migrates/backfills identities, preserves source facts, and rebuilds derivatives; prove v1 merge safely rejects before mutation. Prove GTBK v2 restore-clean and merge on schema 21, including all actual Phase 9 v19 and Phase 10 v20 authoritative facts and graph references, while derivatives remain excluded. Cover D-01's full class matrix/ties/order independence; D-02 backfill/new allocation/immutability/reinstall portability; and D-04's complete failures: wrong password/tamper/auth, envelope/logical parse, unsupported version, schema/table/identity/reference/domain validation, conflict/unmappable graph, picker/review cancellation, stale local fingerprint, confirmation/token reuse, every insert/update/delete/cycle fixup/trigger/FK/source verification/state write/commit failure. For every precommit/writer failure compare canonical serialized authoritative rows plus sqlite_schema/trigger SQL/user_version/portability state exactly. On success, rebuild FTS plus every history/schedule/progression/recommendation/Phase-9/10 projection twice and after shuffled archive order; require identical source and derivative digests/parity.

Extend the shared `migrations-effects` and `portable-merge` contracts so critical v21 migration, populated merge rollback, and rebuild cases run through actual Expo SQLite. Register `portableIdentity.ts`, `backupContracts.ts`, `backupFormat.ts`, `restoreCommands.ts`, `mergePlan.ts`, `mergeCommands.ts`, migration 21, logical backup/restore/merge repositories, and any changed reconciliation module in `scripts/run-coverage-gate.mjs`. Run the real command `npm run test:coverage` (which invokes `scripts/run-coverage-gate.mjs`) and require exactly 100% statements/branches/functions/lines per registered file; do not replace it with aggregate Jest thresholds.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability src/testing/contracts/portableMerge.contract.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/restoreReconciliationRepository.test.ts tests/sqlite-host/cleanInstallRestore.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/portable-merge.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase11/build.json &amp;&amp; npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>D-01..D-04 and DATA-08/DATA-09 have explicit host and real Expo persistence evidence; old backup clean restore passes; all failure classes preserve exact canonical DB bytes/metadata; rebuild is deterministic across retries/order; all registered integrity files are exactly 100% in all metrics.</acceptance_criteria>
  <done>The complete portability and integrity matrix passes without a compatibility, partial-write, or derivative-parity gap.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Finalize accessibility and fail-closed Phase 11 native evidence</name>
  <files>app/more/__tests__/data-and-recovery.test.tsx, src/ui/__tests__/SettingsScreen.test.tsx, scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs, maestro/phase11/portable-merge.yaml, package.json</files>
  <read_first>app/more/__tests__/data-and-recovery.test.tsx, src/ui/__tests__/SettingsScreen.test.tsx, scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs, maestro/phase11/portable-merge.yaml, scripts/run-phase5-maestro.mjs</read_first>
  <action>Finalize the component and native evidence matrix. Map D-01..D-04, DATA-08, DATA-09, and Roadmap criteria 1-4 to named evidence IDs; make the validator fail when any ID/assertion/artifact identity is absent. Component tests must cover exact accessible names/roles/states, visible focus, Enter/Space/D-pad, non-color cues, >=48dp, System/Light/Dark, compact/medium/expanded, 200% text, reduced motion, confirmation enablement, duplicate press, focus after review/error/success, token cleanup, and safe copy. Maestro must cover canonical export metadata; separate Restore clean and Import / merge; picker cancel; v1 clean-restore route and v1 merge guidance; populated v2 review with every conflict-rule summary; exact MERGE; review cancellation and relaunch with local data retained; successful mixed merge; rebuild-pending retry if staged; force-stop/relaunch; merged and pre-existing history visible; and keyboard/D-pad/focus/non-color behavior. Require the same Phase 11 manifest used by both native SQLite suites. Explicitly record rollback/byte-equality as native SQLite evidence, not a Maestro claim. Keep the runner Phase-11-only and exclude Google/Drive/network/sync.</action>
  <verify><automated>npm run test:components -- --runInBand app/more/__tests__/data-and-recovery.test.tsx src/ui/__tests__/SettingsScreen.test.tsx &amp;&amp; node --test scripts/phase11-evidence-scripts.test.mjs &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated><native>npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>All decisions, requirements, and roadmap criteria map to fail-closed evidence; lifecycle-visible manual export/clean/merge and accessibility pass; persistence claims link to the real Expo contracts; no Phase 12 behavior appears.</acceptance_criteria>
  <done>The Phase 11 UI/native evidence corpus is complete, accessible, scoped, and manifest-bound.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Run the complete Phase 11 gate</name>
  <files>package.json, scripts/run-coverage-gate.mjs, scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs</files>
  <read_first>package.json, scripts/run-coverage-gate.mjs, scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs, .planning/ROADMAP.md, .planning/REQUIREMENTS.md</read_first>
  <action>Run typecheck, lint/boundaries, every Jest project, and explicitly `npm run test:coverage -- --runInBand`; inspect the coverage gate's success JSON and `coverage/coverage-summary.json` for exact per-file 100% on all registered Phase 11 integrity modules. Run the focused schema/backup/restore/merge host suites. Build the Phase 11 dev-test APK once, then run both `migrations-effects` and `portable-merge` real Expo suites plus Phase 11 Maestro against that exact manifest. Retain frozen-v1 restore-clean, GTBK-v2 restore/merge, populated conflict matrix, every-failure byte equality, deterministic derivative digest, export metadata, accessibility, and relaunch evidence. Do not update requirement checkboxes, commit, publish, create a release candidate, or start Phase 12.</action>
  <verify><automated>npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; npm run test:all -- --runInBand &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; node --test scripts/phase11-evidence-scripts.test.mjs</automated><native>npm run android:devtest:fresh -- --suite phase11 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase11/build.json &amp;&amp; npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json &amp;&amp; npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>DATA-08, DATA-09, D-01..D-04, and all four Phase 11 roadmap criteria pass together across source, host SQLite, real Expo SQLite, component accessibility, coverage, and Maestro using one declared artifact; no Phase 12/release action occurs.</acceptance_criteria>
  <done>Phase 11 is fully evidenced and ready for orchestrator verification.</done>
</task>
</tasks>

<verification>Execute every automated and native command above and retain the exact coverage result, schema-21 migration result, frozen-v1 clean-restore result, v2 clean/merge round trips, populated conflict/failure matrix, canonical byte comparisons, derivative digests, accessibility matrix, and manifest-bound Maestro report.</verification>
<success_criteria>All four roadmap criteria are proven: stable identities recognize records across devices/reinstalls; authenticated previewed merge applies D-01 atomically; every failure leaves the existing database unchanged while success rebuilds deterministically; and manual canonical export/import works on another personal device with no data loss.</success_criteria>
<output>Create `.planning/phases/11-portable-history-merge-restore/11-04-SUMMARY.md` when done.</output>
