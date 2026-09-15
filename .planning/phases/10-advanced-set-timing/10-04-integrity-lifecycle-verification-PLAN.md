---
phase: 10-advanced-set-timing
plan: 04
type: execute
wave: 4
depends_on: [10-03]
files_modified:
  - src/domains/advancedTiming/advancedTimingConfig.test.ts
  - src/domains/advancedTiming/advancedTimingState.test.ts
  - src/domains/advancedTiming/advancedTimingCommands.test.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx
  - src/ui/__tests__/AdvancedTimingIndicator.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - tests/integration/advanced-timing.test.ts
  - tests/integration/rest-lifecycle.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - scripts/run-coverage-gate.mjs
  - scripts/run-phase10-maestro.mjs
  - scripts/phase10-evidence-scripts.test.mjs
  - maestro/phase10/advanced-set-timing.yaml
  - package.json
autonomous: true
requirements: [WORK-26]
must_haves:
  truths:
    - "D-01: fail-closed evidence covers haptic, audio, and both for per-rep and cluster cues, including denied/rejected-channel branches."
    - "D-02: evidence covers exercise default, set override/inherit, both modes, background/foreground, force-stop/relaunch, and one-row cluster completion."
    - "D-03: regression tests prove the v1.0 rest machine, RestDock, revisions, notification effects, and lifecycle recovery are behaviorally unchanged and can coexist with advanced timing."
    - "D-04: integrity tests compare recorded set/session/rest facts before and after every cue success/failure and prove cues never create, alter, complete, undo, skip, or delete those facts."
    - "The real `npm run test:coverage` gate invokes `scripts/run-coverage-gate.mjs` and every advanced integrity-critical module, repository, migration 20, and changed portability module is exactly 100% statements/branches/functions/lines."
    - "Phase 10 native evidence is fail-closed and covers lifecycle-visible behavior plus accessible names, focus/D-pad, non-color status, and >=48dp controls."
  artifacts:
    - {path: scripts/run-phase10-maestro.mjs, provides: fail-closed Phase 10 native runner}
    - {path: scripts/phase10-evidence-scripts.test.mjs, provides: D-01..D-04 and WORK-26 evidence contract}
    - {path: tests/integration/advanced-timing.test.ts, provides: lifecycle and advisory-only byte-equality matrix}
    - {path: tests/integration/rest-lifecycle.test.ts, provides: unchanged/coexisting v1.0 rest regression proof}
  key_links:
    - {from: D-01..D-04 and four roadmap criteria, to: source/SQLite/component/Maestro evidence, via: fail-closed evidence IDs}
    - {from: npm run test:coverage, to: scripts/run-coverage-gate.mjs, via: exact per-file 100% integrity threshold}
    - {from: Phase 10 Maestro state, to: schema-20 APK, via: manifest identity and force-stop/relaunch runner checks}
---

<objective>Close Phase 10 with fail-closed proof of lifecycle survival, advisory-only integrity, v1.0 rest non-regression, accessibility, schema-20 portability, and exact 100% integrity-critical coverage.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/10-advanced-set-timing/10-CONTEXT.md
@.planning/phases/10-advanced-set-timing/10-RESEARCH.md
@.planning/phases/10-advanced-set-timing/10-03-SUMMARY.md

Verification anchors: `scripts/run-coverage-gate.mjs:16-101,122-180` is the real exact-100% gate; `maestro/lifecycle/rest-recovery.yaml:84-135` supplies force-stop/relaunch conventions; `src/ui/__tests__/RestDock.test.tsx:31-105` supplies AppState/component conventions; and Phase 9's `09-06-phase-verification-PLAN.md:50-71` supplies the fail-closed evidence/real-Expo pattern.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Complete integrity, lifecycle, rest-regression, and accessibility matrices</name>
  <files>src/domains/advancedTiming/advancedTimingConfig.test.ts, src/domains/advancedTiming/advancedTimingState.test.ts, src/domains/advancedTiming/advancedTimingCommands.test.ts, src/platform/sqlite/repositories/advancedTimingRepository.ts, src/bootstrap/workoutAppRuntime.test.tsx, src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx, src/ui/__tests__/AdvancedTimingIndicator.test.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, tests/integration/advanced-timing.test.ts, tests/integration/rest-lifecycle.test.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, src/testing/contracts/migrationsEffects.contract.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/10-advanced-set-timing/10-CONTEXT.md, .planning/phases/10-advanced-set-timing/10-RESEARCH.md, scripts/run-coverage-gate.mjs, tests/integration/advanced-timing.test.ts, tests/integration/rest-lifecycle.test.ts, src/ui/__tests__/RestDock.test.tsx</read_first>
  <action>Build the final automated decision matrix. For D-01, cover each channel for each mode, audio denied, audio rejected, haptic rejected, and both partially/fully rejected. For D-02, cover exercise default, warm-up/working-set override and inherit, later plan edit isolation, background clock jumps, process reconstruction, no missed-cue replay, and 3+3+3 as one row. For D-03, run unchanged rest lifecycle cases with no advanced timer, simultaneous running advanced/rest displays where allowed, and assertions that advanced commands never alter `session_rest_states`, rest revision, `reconcile_rest_notification` effects, permission requests, or RestDock controls. For D-04, snapshot/compare complete recorded-fact tables and relevant revisions around every cue branch and prove normal set complete/undo/rest still work after failure. Finish host and real Expo v20 migration/backup/restore contracts. Complete component assertions for exact accessible names, visible focus, Enter/Space/D-pad, text/icon non-color cues, >=48dp, System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion. Register `advancedTimingConfig.ts`, `advancedTimingState.ts`, `advancedTimingCommands.ts`, `advancedTimingRepository.ts`, migration 20, and every changed integrity/portability module in `scripts/run-coverage-gate.mjs`; do not substitute a Jest aggregate threshold for the real exact per-file gate.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/advancedTiming &amp;&amp; npm run test:components -- --runInBand src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx src/ui/__tests__/AdvancedTimingIndicator.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts tests/integration/rest-lifecycle.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>D-01..D-04 and WORK-26 each have automated evidence; background/process-death and denied-audio cases are explicit; cluster stays one row; rest remains unchanged; real Expo persistence passes; and every registered integrity-critical file reports exactly 100% in all four metrics.</acceptance_criteria>
  <done>The source, host-SQLite, real-Expo, integrity, accessibility, and coverage matrices are complete.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Finalize fail-closed Phase 10 Maestro evidence</name>
  <files>scripts/run-phase10-maestro.mjs, scripts/phase10-evidence-scripts.test.mjs, maestro/phase10/advanced-set-timing.yaml, package.json</files>
  <read_first>scripts/run-phase7-maestro.mjs, scripts/phase7-evidence-scripts.test.mjs, maestro/phase7, maestro/lifecycle/rest-recovery.yaml, package.json</read_first>
  <action>Finalize `test:maestro:phase10` and its manifest/evidence validator so absent steps or mismatched APK identity fail closed. Model the runner + evidence validator + `package.json` script on the nearest EXISTING convention — `scripts/run-phase7-maestro.mjs` + `scripts/phase7-evidence-scripts.test.mjs` + the `maestro/phase7/` flow dir (do NOT read `run-phase9-maestro.mjs`/`phase9-evidence-scripts.test.mjs` — those are produced by Phase 9 execution and are not present at plan time). Plan 10-01 Task 5 bootstraps `scripts/run-phase10-maestro.mjs`, `scripts/phase10-evidence-scripts.test.mjs`, and `maestro/phase10/advanced-set-timing.yaml`; this task extends/finalizes them (no verify step here invokes a script no prior task created). Map WORK-26, D-01..D-04, and Roadmap criteria 1-4 to named evidence IDs. Native evidence must: configure an exercise per-rep default; create one set override; exercise haptic/audio/both; background/foreground without replay; force-stop/relaunch and show reconciled cadence; configure 3+3+3; force-stop during a gap; relaunch into correct progress; complete exactly one cluster set; deny or force-fail audio and still complete normally; show existing RestDock independently; and activate timing controls with D-pad/focus while text/icon communicates state without color. Use stable test controls for effect denial/failure rather than relying on device prompts. Require the same declared Phase 10 build manifest for SQLite and Maestro. Do not treat physical-device observation as release authority and do not build/publish a release candidate.</action>
  <verify><automated>node --test scripts/phase10-evidence-scripts.test.mjs &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated><native>npm run android:devtest:fresh -- --suite phase10 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase10/build.json &amp;&amp; npm run test:maestro:phase10 -- --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>The runner cannot pass without named native proof for D-01..D-04, all four Roadmap criteria, background and process death, denied audio, one-row cluster completion, independent RestDock, and accessibility interaction on the declared schema-20 artifact.</acceptance_criteria>
  <done>The lifecycle-visible Phase 10 contract has complete fail-closed native evidence.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Run the complete Phase 10 gate</name>
  <files>package.json, scripts/run-coverage-gate.mjs, scripts/run-phase10-maestro.mjs, scripts/phase10-evidence-scripts.test.mjs</files>
  <read_first>package.json, scripts/run-coverage-gate.mjs, scripts/run-phase10-maestro.mjs, scripts/phase10-evidence-scripts.test.mjs, .planning/ROADMAP.md</read_first>
  <action>Run typecheck, lint/boundaries, all Jest projects, then explicitly `npm run test:coverage -- --runInBand` and inspect its success JSON plus `coverage/coverage-summary.json` for exact 100% on every registered advanced/migration/portability integrity file. Run v20 host migration and logical backup suites, build the declared Phase 10 dev-test artifact once, run real Expo migrations-effects against that manifest, and run the Phase 10 Maestro runner against the same manifest. Retain evidence for exercise/set persistence, process death, denied/failed cues, byte-identical set/rest facts, cluster one-row completion, rest non-regression, and accessibility. Do not change requirements status, commit, publish, or start Phase 11.</action>
  <verify><automated>npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; npm run test:all -- --runInBand &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; node --test scripts/phase10-evidence-scripts.test.mjs</automated><native>npm run android:devtest:fresh -- --suite phase10 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase10/build.json &amp;&amp; npm run test:maestro:phase10 -- --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>WORK-26, D-01..D-04, all four Phase 10 Roadmap criteria, schema-20 portability, accessibility, lifecycle survival, advisory-only integrity, rest non-regression, and exact 100% integrity-critical coverage pass together with no release or Phase 11 action.</acceptance_criteria>
  <done>Phase 10 is fully evidenced and ready for orchestrator verification.</done>
</task>
</tasks>

<verification>Execute the exact automated and native commands above and retain the coverage JSON, schema-20 host/device results, backup round-trip result, byte-equality matrix, and Phase 10 manifest-bound Maestro report.</verification>
<success_criteria>All four Phase 10 Roadmap criteria and WORK-26 are proven: both timer modes and scopes persist through lifecycle events, all cues remain advisory, cluster is one set, and v1.0 rest is unchanged.</success_criteria>
<output>Create `.planning/phases/10-advanced-set-timing/10-04-SUMMARY.md` when done.</output>
