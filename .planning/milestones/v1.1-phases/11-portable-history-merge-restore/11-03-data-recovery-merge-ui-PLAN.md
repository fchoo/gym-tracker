---
phase: 11-portable-history-merge-restore
plan: 03
type: execute
wave: 3
depends_on: [11-02]
files_modified:
  - app/more/data-and-recovery.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/domains/portability/backupCommands.ts
  - src/domains/portability/backupCommands.test.ts
  - src/domains/portability/mergeCommands.ts
  - src/domains/portability/mergeCommands.test.ts
  - scripts/run-phase11-maestro.mjs
  - scripts/phase11-evidence-scripts.test.mjs
  - maestro/phase11/portable-merge.yaml
  - package.json
autonomous: true
requirements: [DATA-08, DATA-09]
must_haves:
  truths:
    - "D-01: merge review explains and summarizes newest-wins sessions/corrections/void, local-wins settings, and identity-deduped keep-both custom exercises/plans without exposing archive rows."
    - "D-02: the UI describes stable owner-scoped identity as the duplicate boundary and never offers name/content-based dedup controls."
    - "D-03: Settings retains a clearly separate Restore clean action for old/current GTBK archives and adds Import / merge backup without forking the canonical export format."
    - "D-04: no merge mutation occurs before explicit review plus exact confirmation; picker cancel, review cancel/back, unmount, stale token, duplicate press, and any safe error invalidate the token and leave data unchanged."
    - "The owner can export the latest canonical encrypted backup, see when and where it was produced, import it on another device, and distinguish restore-clean from merge-into-existing."
    - "Every new/changed control has an exact accessible name, visible focus, keyboard/D-pad activation, non-color state, and at least a 48dp target across required themes/layouts/200% text/reduced motion."
  artifacts:
    - {path: app/more/data-and-recovery.tsx, provides: manual export, restore-clean, and previewed merge workflow}
    - {path: app/more/__tests__/data-and-recovery.test.tsx, provides: state, safe-error, cancellation, and accessibility matrix}
    - {path: maestro/phase11/portable-merge.yaml, provides: lifecycle-visible manual portability flow}
    - {path: scripts/run-phase11-maestro.mjs, provides: manifest-bound fail-closed native evidence runner}
  key_links:
    - {from: Import / merge backup, to: preflightSecureMerge, via: password submit then bounded review state}
    - {from: merge review confirmation, to: commitSecureMerge, via: exact MERGE plus single-use token and duplicate-press latch}
    - {from: export metadata, to: latest successful GTBK v2 archive, via: backup command result with safe produced-at/location label}
    - {from: route unmount/cancel, to: merge token store, via: explicit invalidation before state reset}
---

<objective>Expose Phase 11 safely in Settings → Data & recovery: one canonical manual export, clearly separated restore-clean and import/merge actions, bounded conflict preview, explicit atomic confirmation, safe cancellation/errors, production accessibility, and initial native evidence.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/design/v1.1-UX-FLOW.md
@.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md
@.planning/phases/11-portable-history-merge-restore/11-RESEARCH.md
@.planning/phases/11-portable-history-merge-restore/11-02-SUMMARY.md

Existing UI anchors: `app/more/data-and-recovery.tsx:430-459,470-588,636-688` for token cleanup, secure backup/clean restore, accessible review, exact REPLACE, and rebuild state; `app/more/__tests__/data-and-recovery.test.tsx:273-429` for preview/focus/duplicate-press/safe-error patterns; `src/ui/screens/SettingsScreen.tsx:328-344` for the route; and `maestro/phase5/data-recovery.yaml:7-27` plus `scripts/run-phase5-maestro.mjs:21-49` for the existing native flow. Preserve existing clean restore wording/behavior and CSV behavior. Do not add Google, Drive, sync, accounts, or network status.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Wire runtime merge commands and canonical export metadata</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/domains/portability/backupCommands.ts, src/domains/portability/backupCommands.test.ts, src/domains/portability/mergeCommands.ts, src/domains/portability/mergeCommands.test.ts</files>
  <read_first>src/bootstrap/workoutAppRuntime.tsx, src/domains/portability/backupCommands.ts, src/domains/portability/restoreCommands.ts, src/domains/portability/mergeCommands.ts, src/platform/sqlite/repositories/restoreReconciliationRepository.ts</read_first>
  <action>Add runtime methods/types for `preflightSecureMerge`, invalidation, `commitSecureMerge`, and retrying the shared post-restore/merge rebuild. Keep merge and restore tokens/modes distinct so one action cannot commit the other. Commit returns ready only after verified reconciliation and otherwise returns rebuild_pending without pretending failure rolled back an already-committed source merge. Ensure duplicate calls are latched/single-use and safe errors use stable correlation codes. Extend secure backup results with non-secret metadata sufficient for the UI to show the latest successful canonical GTBK production time and user-safe destination/display location; persist only this metadata after successful archive creation/share, never password/path internals, and do not create a second format or sync store. Cover service-unavailable, cancel, stale token, commit failure, rebuild retry, and metadata update/no-update branches.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/backupCommands.test.ts src/domains/portability/mergeCommands.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-03 has one GTBK export contract and separate clean/merge runtime commands; D-04 keeps tokens mode-specific, single-use, and commit-gated; DATA-09 exposes only safe latest-produced metadata.</acceptance_criteria>
  <done>The UI has a typed runtime surface for canonical export, clean restore, merge preview/commit, and deterministic rebuild retry.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build the accessible restore-clean versus merge review flow</name>
  <files>app/more/data-and-recovery.tsx, app/more/__tests__/data-and-recovery.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx</files>
  <read_first>.planning/design/v1.1-UX-FLOW.md, app/more/data-and-recovery.tsx, app/more/__tests__/data-and-recovery.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx</read_first>
  <action>Under Settings → Data & recovery, retain `Export backup` and the existing replacement path labeled `Restore clean`, and add a separate `Import / merge backup` action. Show the latest successful backup produced-at timestamp and safe location/display label, with an explicit never-exported state. Merge opens the existing document picker/password pattern, then renders an operation-labeled, accessible review list containing bounded per-class inserted/duplicate/local-won/archive-won/kept-both/remapped/conflict counts, plain-language D-01 summaries, and `No changes have been made yet`. Do not show raw names/rows/paths/SQL. Require exact case-sensitive `MERGE`; disable commit until exact input; focus the review heading then confirmation/error/success appropriately; latch duplicate press. Cancel/back/unmount invalidates the token. A legacy v1 merge attempt gives safe actionable `Use Restore clean for this older backup` guidance without mutation. Distinguish source-commit success plus rebuild_pending from precommit failure, and offer retry rebuild without rerunning merge. Add exhaustive component tests for picker cancel, wrong password/tamper-safe copy, validation/conflict/stale token, cancel/back/unmount, exact confirmation, duplicate press, all preview classes, ready/rebuild_pending/retry, old backup guidance, and unchanged restore-clean/export/CSV paths. Assert exact role/name/state, focus, keyboard/Enter/Space/D-pad, non-color copy/icon, >=48dp, System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion.</action>
  <verify><automated>npm run test:components -- --runInBand app/more/__tests__/data-and-recovery.test.tsx src/ui/__tests__/SettingsScreen.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run lint</automated></verify>
  <acceptance_criteria>D-01 and D-02 are accurately communicated without user-selectable rule drift; D-03 clean restore remains available including old archives; D-04 guarantees preview-before-commit and token invalidation on every cancellation lifecycle; all controls satisfy accessibility constraints.</acceptance_criteria>
  <done>The owner can clearly and accessibly choose export, restore clean, or previewed merge without a silent/partial mutation path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add the initial Phase 11 lifecycle-visible native flow</name>
  <files>scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs, maestro/phase11/portable-merge.yaml, package.json</files>
  <read_first>scripts/run-phase5-maestro.mjs, scripts/phase5-evidence-scripts.test.mjs, maestro/phase5/data-recovery.yaml, scripts/run-phase7-maestro.mjs, package.json</read_first>
  <action>Create `test:maestro:phase11`, a fail-closed evidence validator, and `maestro/phase11/portable-merge.yaml` patterned on the existing Phase 5/7 runners. Bind to the declared `artifacts/native/phase11/build.json`; verify package/schema/build identity and reject missing evidence IDs. The initial flow navigates Settings → Data & recovery, sees latest backup metadata, distinguishes Restore clean from Import / merge backup, cancels the picker with no review, stages a deterministic encrypted v2 fixture through the runner's test seam, enters a password, reviews bounded conflict classes and `No changes have been made yet`, verifies commit disabled until exact MERGE, cancels once with unchanged visible local history, repeats and commits, observes ready or rebuild-pending+retry, relaunches, and verifies merged history plus retained local content. Include focus/D-pad activation, exact accessible names, non-color state, and target-size evidence. Do not claim byte-level rollback from Maestro; map that requirement to the native SQLite contract from Plan 11-02. Do not add Drive/sign-in/sync steps.</action>
  <verify><automated>node --test scripts/phase11-evidence-scripts.test.mjs &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated><native>npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>D-01..D-04 and DATA-08/DATA-09 have named lifecycle-visible evidence; cancellation, review, confirmation, relaunch, local retention, and accessibility pass on the declared artifact; persistence rollback remains grounded in real Expo SQLite evidence.</acceptance_criteria>
  <done>The manual canonical backup/merge UX has manifest-bound native evidence without expanding into Phase 12.</done>
</task>
</tasks>

<verification>Run runtime/domain coverage, the complete Data & recovery component/accessibility matrix, evidence-script contract, and manifest-bound Phase 11 Maestro flow. Cross-reference UI outcomes to Plan 11-02's real Expo atomicity cases rather than treating screenshots as database proof.</verification>
<success_criteria>Roadmap criteria 2-4 are user-visible: the owner can export one canonical GTBK, choose restore-clean or previewed merge, understand D-01 outcomes, cancel safely, commit explicitly, recover derivative rebuild, and retain accessible operation across relaunch.</success_criteria>
<output>Create `.planning/phases/11-portable-history-merge-restore/11-03-SUMMARY.md` when done.</output>
