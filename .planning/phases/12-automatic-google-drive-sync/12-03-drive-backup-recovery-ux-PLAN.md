---
phase: 12-automatic-google-drive-sync
plan: 03
type: execute
wave: 3
depends_on: [12-02]
files_modified:
  - app/more/data-and-recovery.tsx
  - app/more/drive-backup-privacy.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - app/more/__tests__/drive-backup-privacy.test.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/domains/backup/automaticBackupPresentation.ts
  - src/domains/backup/automaticBackupPresentation.test.ts
  - src/bootstrap/phase12BackupTestControls.ts
  - src/bootstrap/phase12BackupTestControls.test.ts
  - src/testing/phase12AutomaticBackupFixtures.ts
  - maestro/phase12/automatic-drive-backup.yaml
  - scripts/run-phase12-maestro.mjs
  - scripts/phase12-evidence-scripts.test.mjs
  - package.json
autonomous: true
requirements: [DATA-10]
must_haves:
  truths:
    - "DATA-10: Connecting automatic backup requests only Google One-Tap and drive.file access; the Google flow has no password, recovery phrase, or additional privacy-acknowledgement gate."
    - "DATA-10: First connection is restore-first quarantine: existing cloud artifacts are inspected without upload, promotion, replacement, cleanup, or deletion; no-artifact accounts alone may begin first backup, and no manifest/writer epoch is created until that snapshot is verified."
    - "DATA-10: A valid cloud backup prompts before use; an empty local database restores directly, while a non-empty database uses the Phase 11 bounded preview, exact MERGE confirmation, fresh Google authentication, and one-time owner-namespace-adoption confirmation before one atomic commit."
    - "DATA-10: An unusable latest snapshot never falls back silently: the UI names and dates a verified previous snapshot and asks before restoring it; a valid future-schema snapshot shows Update Gym Tracker and stays quarantined without offering the previous snapshot."
    - "Data & recovery always shows bounded backup status, last successful backup, sanitized Google account, and data-use preference; a 24-hour pending warning is non-blocking and offers Retry."
    - "Data use is exactly wifi_and_cellular or wifi_only, defaulting to wifi_and_cellular. Automatic runs honor wifi_only; Back up now on cellular asks to use cellular for that attempt only, cancel leaves work pending, and confirmation does not change the preference."
    - "Disconnect stops this installation and clears its local Google/writer state while retaining all cloud backups; Delete cloud backup is a separate action gated by fresh Google authentication and exact destructive confirmation."
    - "Help states that automatic Drive data is not end-to-end encrypted, is readable JSON, and is protected by Google-account access; the separate manual GTBK export, Restore clean, and Import / merge backup actions remain available."
    - "Every new control has an exact accessible name, visible focus, keyboard/D-pad activation, a non-color state cue, and at least a 48dp target across System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion."
  artifacts:
    - {path: src/domains/backup/automaticBackupPresentation.ts, provides: bounded AutomaticBackupStatus-to-UI projection, recovery prompts, 24-hour warning, and data-use policy model}
    - {path: app/more/data-and-recovery.tsx, provides: restore-first connection, backup status/actions, guarded handover, disconnect/delete, and retained manual recovery UX}
    - {path: app/more/drive-backup-privacy.tsx, provides: discoverable non-blocking Google Drive privacy explanation}
    - {path: src/bootstrap/phase12BackupTestControls.ts, provides: development-test-only deterministic backup and recovery states}
    - {path: maestro/phase12/automatic-drive-backup.yaml, provides: manifest-bound fake-port recovery and backup lifecycle evidence}
  key_links:
    - {from: Connect Google Drive, to: GoogleAuthPort and AutomaticBackupCoordinator.run startup, via: explicit owner action followed by restore quarantine}
    - {from: empty-local restore choice, to: AutomaticPortableRestorePort, via: a current restore claim with no merge preview}
    - {from: non-empty restore choice, to: Phase 11 AutomaticPortableMergePort behavior, via: preview plus exact MERGE, fresh Google auth, explicit adoption, and one serialized transaction}
    - {from: Back up now or Retry, to: AutomaticBackupScheduler.request, via: synchronous manual/retry request with an attempt-local cellular override}
    - {from: Disconnect, to: local authorization and writer cleanup, via: confirmation that never calls remote delete}
---

<objective>Deliver the owner-facing WhatsApp-like backup and replacement-recovery experience in Settings → Data & recovery: Google-only connection, restore-first quarantine, guarded direct restore or Phase 11 merge, explicit latest/previous recovery, honest privacy copy, useful backup health and data-use controls, safe disconnect/delete actions, and deterministic accessible native UI evidence.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/design/v1.1-UX-FLOW.md
@.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md
@.planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md
@.planning/phases/12-automatic-google-drive-sync/12-01-drive-backup-foundation-PLAN.md
@.planning/phases/12-automatic-google-drive-sync/12-02-generation-backup-scheduler-PLAN.md
@.planning/phases/11-portable-history-merge-restore/11-03-SUMMARY.md
@.planning/phases/11-portable-history-merge-restore/11-04-SUMMARY.md

The binding product contract is the 2026-09-26 DATA-10 revision in ROADMAP.md and REQUIREMENTS.md plus this plan. It supersedes older Phase 12 language that described continuous multi-phone replication. At execution, read the actual 12-01/12-02 summaries and preserve their settled production vocabulary: `GoogleAuthPort`, `DriveBackupStorePort`, `DriveBackupSnapshotV1`, `DriveBackupManifestV1`, `AutomaticPortableRestorePort`, `AutomaticPortableMergePort`, `AutomaticBackupCoordinator`, `AutomaticBackupScheduler`, `AutomaticBackupStateRepository`, `automatic_backup_state`, and `automatic_backup_namespace_adoption`. Do not reintroduce the superseded architecture through stale planning prose.

Existing UI anchors are `app/more/data-and-recovery.tsx`, `app/more/__tests__/data-and-recovery.test.tsx`, `src/ui/screens/SettingsScreen.tsx:328-345`, `src/ui/__tests__/SettingsScreen.test.tsx`, `maestro/phase11/portable-merge.yaml`, and `scripts/run-phase11-maestro.mjs`. Preserve all Phase 11 manual GTBK behavior below a distinct `Automatic Google Drive backup` section. Google connection must never request the manual GTBK password.
</context>

## Artifacts this phase produces

- `AutomaticBackupViewModel`, `AutomaticBackupRecoveryPrompt`, `AutomaticBackupDataUsePolicy`, and `projectAutomaticBackupPresentation` in `src/domains/backup/automaticBackupPresentation.ts`.
- Runtime façade commands `connectAutomaticBackup`, `continueAutomaticRestore`, `requestAutomaticBackupNow`, `retryAutomaticBackup`, `setAutomaticBackupDataUsePolicy`, `disconnectAutomaticBackup`, and `deleteAutomaticCloudBackup`.
- Development-test-only `Phase12BackupTestControls` and deterministic `phase12AutomaticBackupFixtures`.
- `app/more/drive-backup-privacy.tsx`, `maestro/phase12/automatic-drive-backup.yaml`, `scripts/run-phase12-maestro.mjs`, and the `test:maestro:phase12` package command.

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Publish a bounded backup, restore, and recovery presentation surface</name>
  <files>src/domains/backup/automaticBackupPresentation.ts, src/domains/backup/automaticBackupPresentation.test.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx</files>
  <read_first>.planning/REQUIREMENTS.md, .planning/design/v1.1-UX-FLOW.md, .planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md, .planning/phases/12-automatic-google-drive-sync/12-02-SUMMARY.md, src/domains/backup/automaticBackupContracts.ts, src/domains/backup/automaticBackupCoordinator.ts, src/domains/backup/automaticBackupScheduler.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/domains/portability/mergeCommands.ts</read_first>
  <action>Create a pure `projectAutomaticBackupPresentation` boundary over the Plan 01/02 state. Preserve public `AutomaticBackupStatus` values exactly as `not_connected | idle | backup_pending | backing_up | restore_pending | restoring | paused`; express finer UI causes as bounded presentation fields rather than adding transport states. The projection contains only a sanitized account label, last successful backup instant, current/pending generation relationship, data-use policy, recovery candidate dates, safe reason codes, retry eligibility, and action availability. It must never expose OAuth tokens, Drive file IDs, raw ETags, claim tokens, writer epochs, object bodies, local row content, or provider exceptions. Derive `Changes not backed up for 24h` only when committed work remains pending continuously for at least 24 hours; clear the warning only after a verified promoted receipt makes `backed_up_generation >= mutation_generation`.

Add runtime façade commands named in the artifacts section. `connectAutomaticBackup` performs explicit One-Tap/drive.file authorization and starts `AutomaticBackupCoordinator.run("startup")`; it accepts no extra credential. The resulting installation remains in restore quarantine until bounded Drive discovery resolves: no artifacts enters `backup_pending` and permits the first snapshot attempt, but no remote manifest or writer epoch is created until that candidate passes round-trip validation; existing invalid artifacts stay paused/quarantined; a valid backup creates an `AutomaticBackupRecoveryPrompt`. If the automatic portability boundary reports an active workout, keep `restore_pending` and do not mutate until the workout is finished. For an empty local database, `continueAutomaticRestore` uses `AutomaticPortableRestorePort` to apply the selected verified snapshot under the current restore claim without a Phase 11 merge preview. For a non-empty database, use `AutomaticPortableMergePort` to reuse the Phase 11 preview/token lifecycle and exact `MERGE` confirmation. If namespaces differ, require an explicit adoption selection and fresh Google authentication immediately before commit; the cloud namespace, identity change, adoption receipt, and full merge must be applied in the same serialized SQLite transaction. Cancellation, stale claim, auth failure, route unmount, or commit failure invalidates the attempt and leaves both namespaces and local facts unchanged. Never pre-adopt.

Model candidate handling exactly: a valid latest candidate is offered with its produced date; an invalid latest plus verified previous produces an explicit previous-candidate prompt and never auto-restores; a valid candidate whose schema is newer than this app produces `restore_pending` with presentation reason `update_required`, disables restore/backup/delete, and exposes only Update Gym Tracker, retry discovery after update, disconnect, and manual GTBK recovery. Add `requestAutomaticBackupNow` so `wifi_and_cellular` runs immediately on available connectivity. Under `wifi_only`, Wi-Fi runs immediately; cellular returns a one-run confirmation state. Cancellation leaves the pending generation unchanged; confirmation schedules only that manual attempt with a cellular override and does not mutate the saved policy. `retryAutomaticBackup` calls `AutomaticBackupScheduler.request("retry")`; all requests return synchronously and all async errors remain scheduler-owned.

`disconnectAutomaticBackup` confirms and disposes the scheduler, clears only this installation's authorization/writer/cache state, and preserves local SQLite plus every Drive object. `deleteAutomaticCloudBackup` is a distinct flow that requires fresh Google authentication and exact case-sensitive `DELETE`; it invokes the Plan 02 contract to promote a metadata-only successor-epoch tombstone and permanently delete only environment-scoped workout snapshot objects, preserves local facts and the tombstone, and cannot be reached from the disconnect confirmation. Latch duplicate actions and reject stale completions after account, claim, route, or component generation changes.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/backup/automaticBackupPresentation.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>`automaticBackupPresentation.test.ts` covers every public status, 23:59:59/24:00:00 warning boundaries, latest/previous/update-required choices, redaction, and both data-use values; runtime tests prove direct empty restore, guarded non-empty merge/adoption rollback, active-workout deferral, manual cellular cancel/confirm semantics, non-awaited requests, disconnect-without-delete, fresh-auth DELETE, duplicate presses, unmount, and stale completion rejection.</acceptance_criteria>
  <done>The UI receives one typed, secret-free backup/recovery model and owner-command surface that cannot bypass quarantine, writer handover, Phase 11 merge, connectivity policy, or remote-retention rules.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build the accessible Data and recovery backup and replacement flow</name>
  <files>app/more/data-and-recovery.tsx, app/more/drive-backup-privacy.tsx, app/more/__tests__/data-and-recovery.test.tsx, app/more/__tests__/drive-backup-privacy.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx</files>
  <read_first>.planning/REQUIREMENTS.md, .planning/design/v1.1-UX-FLOW.md, app/more/data-and-recovery.tsx, app/more/__tests__/data-and-recovery.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx, src/domains/backup/automaticBackupPresentation.ts, .planning/phases/11-portable-history-merge-restore/11-03-SUMMARY.md</read_first>
  <action>Add an `Automatic Google Drive backup` card above the existing `Manual encrypted backup (GTBK)` controls. The disconnected state shows `Not connected`, `Connect Google Drive`, and `How Drive backup privacy works`; pressing Connect launches Google directly and never renders an additional secret field. The privacy route must contain these exact facts in plain language: `Automatic Drive backups are not end-to-end encrypted.` `They are stored as readable JSON in your Google Drive.` `Access to your Google account protects them, so anyone who can access that account may be able to read your workout data.` Also state that Gym Tracker requests `drive.file`, manual GTBK exports remain password-encrypted, and connection requires no extra acknowledgement. Update the Settings card description so automatic Drive backup and manual recovery are both discoverable without presenting a workout-path spinner.

For connected idle/current state, render a non-color `Backed up` status, sanitized account, exact last-success value (or `No successful backup yet`), `Back up now`, data-use choice `Any connection`/`Wi-Fi only`, `Disconnect`, and `Delete cloud backup …`. Default persisted policy is `wifi_and_cellular`/`Any connection`. Pending and active states render `Backup pending` or `Backing up` without blocking navigation. If pending reaches 24 hours, render the exact non-color warning `Changes not backed up for 24h` and `Retry`. When Wi-Fi only is saved and the current network is cellular, pressing Back up now opens a modal that says the saved preference will not change, with `Cancel` and `Use cellular this time`; Cancel keeps the pending state, while confirmation applies to that attempt only.

On first connection with a valid cloud candidate, show `Backup found` with its date before any local mutation. Empty local data offers `Restore backup` and `Not now`; Not now leaves the app quarantined and unable to publish. Non-empty local data routes through the existing Phase 11 bounded review, shows `No changes have been made yet`, retains exact `MERGE`, and, only for a namespace mismatch, adds a required control labeled `Adopt this backup identity on this phone`. Explain that adoption is one-time; commit action is `Adopt identity and merge`, performs fresh Google authentication, and remains disabled until both confirmation requirements are satisfied. Any cancel/back/unmount returns to the quarantined prompt. Never run restore/merge while an active workout exists; show `Finish the active workout before restoring this backup` and keep workouts usable.

If latest verification fails and previous is verified, show `Latest backup can't be used`, `Previous backup from {date} is available`, and actions `Restore previous backup`/`Not now`; never select it automatically. If latest requires a newer app schema, show `Update Gym Tracker to restore this backup`, do not label it corrupt, do not offer previous, and keep every cloud mutation disabled. Invalid artifacts with no verified candidate show a safe paused/retry state and remain quarantined.

Disconnect confirmation must say that automatic backup stops on this phone, local workouts remain, and cloud backups remain in Drive. It must not present or call deletion. `Delete cloud backup …` opens a separate danger flow, explains local data is retained, requires fresh Google authentication, requires exact `DELETE`, and explains that workout snapshots are permanently removed while a metadata-only deletion marker with no workout data remains to stop an old phone from recreating them. Latch duplicate submission and report partial/failure outcomes without claiming snapshot removal unless the bounded deletion contract succeeds. A later `Start a new cloud backup` action requires fresh authentication and explicit confirmation before the tombstone may become active. Keep Export backup, Restore clean, Import / merge backup, and CSV controls operational in every automatic-backup state.

Component tests cover every status/recovery branch, account redaction, timestamp states, first-connect no-artifact/valid/invalid, empty restore, non-empty merge, namespace match/mismatch/adoption rollback, active workout, latest/previous confirmation, update-required behavior, both data-use policies, one-run cellular override, 24-hour warning, disconnect retention, guarded deletion, duplicate press, cancel/back/unmount, and retained manual controls. Assert exact accessible names/roles/states, live-region semantics, focus return, keyboard Enter/Space and D-pad activation, >=48dp targets, non-color icons plus text, System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion. Do not expand the established personal-use scope into a TalkBack or switch-scanning release gate.</action>
  <verify><automated>npm run test:components -- --runInBand app/more/__tests__/data-and-recovery.test.tsx app/more/__tests__/drive-backup-privacy.test.tsx src/ui/__tests__/SettingsScreen.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated></verify>
  <acceptance_criteria>The tested UI contains the exact connection, privacy, restore/fallback/update, status, 24-hour warning, data-use, disconnect, and DELETE behavior above; the Google section contains no extra credential input; manual GTBK/CSV actions remain independently usable; every new control passes the complete accessibility matrix.</acceptance_criteria>
  <done>The owner can connect, recover onto a replacement installation, understand backup health/privacy, control data use, manually back up, disconnect, or deliberately delete cloud data without an unsafe or inaccessible path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add deterministic Phase 12 fake-port Maestro coverage</name>
  <files>src/bootstrap/phase12BackupTestControls.ts, src/bootstrap/phase12BackupTestControls.test.ts, src/testing/phase12AutomaticBackupFixtures.ts, maestro/phase12/automatic-drive-backup.yaml, scripts/run-phase12-maestro.mjs, scripts/phase12-evidence-scripts.test.mjs, package.json</files>
  <read_first>src/bootstrap/workoutMutationTestControls.ts, src/bootstrap/workoutMutationTestControls.test.ts, app/__native-contracts.tsx, scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs, maestro/phase11/portable-merge.yaml, package.json</read_first>
  <action>Add development-test-only `Phase12BackupTestControls` backed by `GoogleAuthPort`, `DriveBackupStorePort`, `AutomaticPortableRestorePort`, `AutomaticPortableMergePort`, coordinator, scheduler, clock, and network fakes. Gate them with the existing native-contract/development-test build identity; production must fail closed if a route, query parameter, deep link, fixture, or environment variable attempts to enable them. Fixtures must contain bounded synthetic workout data and expose no real Google identity, access token, remote object, or production environment marker.

Add `test:maestro:phase12` and a manifest-bound runner for `artifacts/native/phase12/build.json`. Run named scenarios for: disconnected privacy help and Google-only Connect; no-cloud first initialization; valid-backup empty direct restore; populated Phase 11 merge with one-time namespace adoption; cancel/back/unmount quarantine; invalid latest with explicit dated previous fallback; future-schema Update Gym Tracker with no fallback; status/last-success/account; wifi_and_cellular and wifi_only; one-run cellular cancel/confirm; 24-hour warning and Retry; disconnect retaining fake cloud objects; guarded fresh-auth DELETE; and manual GTBK actions retained. At least one paused/pending scenario must open and complete a local workout to prove the UI remains non-blocking. The runner verifies exact source-tree/APK/package/device identity, exact flow and evidence IDs, zero skipped/failed assertions, and rejects stale/missing output. Maestro proves UI/lifecycle behavior only; Plan 04 supplies persistence, crash, transport, and real-Google evidence.</action>
  <verify><automated>npm run test:unit -- --runInBand src/bootstrap/phase12BackupTestControls.test.ts &amp;&amp; node --test scripts/phase12-evidence-scripts.test.mjs &amp;&amp; node --check scripts/run-phase12-maestro.mjs &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated><native>npm run test:maestro:phase12 -- --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>The manifest-bound fake flow exercises every named recovery/status/privacy/data-use/disconnect/delete state with zero skips; production cannot enable test controls; local workout use succeeds while backup is pending/paused; no real Google call or production namespace appears in fixtures or artifacts.</acceptance_criteria>
  <done>The complete user-visible automatic-backup and replacement-recovery lifecycle has reproducible, accessible native UI evidence over deterministic fakes.</done>
</task>
</tasks>

<verification>Run the focused presentation/runtime/component tests, type/lint/boundary checks, evidence-contract self-tests, and the Phase 12 manifest-bound fake-port Maestro suite. Inspect the Data & recovery tree in every state to confirm the privacy link and manual GTBK controls remain present, and inspect test artifacts for absence of real account credentials and production-environment identifiers.</verification>

<success_criteria>DATA-10 is understandable and safely operable from Data & recovery: Google-only connection enters quarantine; recovery is explicit and local-shape-aware; latest/previous/update handling cannot silently downgrade; backup health and connectivity preferences are visible; 24-hour warning, manual backup, disconnect, and deletion behave exactly as documented; manual recovery and offline workouts remain available.</success_criteria>

<output>Create `.planning/phases/12-automatic-google-drive-sync/12-03-SUMMARY.md` when done.</output>
