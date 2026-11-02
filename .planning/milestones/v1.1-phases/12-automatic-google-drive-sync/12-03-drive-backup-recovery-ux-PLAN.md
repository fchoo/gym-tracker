---
phase: 12-automatic-google-drive-sync
plan: 03
type: execute
wave: 3
depends_on: [12-02]
files_modified:
  - app/more/data-and-recovery.tsx
  - app/more/automatic-backup-settings.tsx
  - app/more/manual-encrypted-backup.tsx
  - app/more/drive-backup-privacy.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - app/more/__tests__/automatic-backup-settings.test.tsx
  - app/more/__tests__/manual-encrypted-backup.test.tsx
  - app/more/__tests__/drive-backup-privacy.test.tsx
  - app/_layout.tsx
  - app/__tests__/root-layout.test.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/ui/components/NavigationRow.tsx
  - src/ui/components/NavigationRow.test.tsx
  - src/ui/portability/useManualBackupController.ts
  - src/ui/portability/useManualBackupController.test.tsx
  - src/ui/portability/useCsvExportController.ts
  - src/ui/portability/useCsvExportController.test.tsx
  - src/ui/portability/BackupPreviewFacts.tsx
  - src/ui/portability/BackupPreviewFacts.test.tsx
  - src/ui/components/index.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/domains/backup/automaticBackupPresentation.ts
  - src/domains/backup/automaticBackupPresentation.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/mergePlan.test.ts
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
    - "DATA-10: An unusable latest snapshot never falls back silently: the UI names and dates a verified previous snapshot and asks before restoring it; a valid future-schema snapshot says a newer Gym Tracker build is required, keeps quarantine, and offers Check again without offering the previous snapshot."
    - "Data & recovery always shows bounded backup status and the last successful backup; Automatic backup settings owns sanitized Google account and data-use preference; a 24-hour pending warning is non-blocking and offers Retry."
    - "Data use is exactly wifi_and_cellular or wifi_only, defaulting to wifi_and_cellular. Automatic runs honor wifi_only; Back up now on cellular asks to use cellular for that attempt only, cancel leaves work pending, and confirmation does not change the preference."
    - "Disconnect stops this installation and clears its local Google/writer state while retaining all cloud backups; Delete cloud backup is a separate action gated by fresh Google authentication and exact destructive confirmation."
    - "Help states that automatic Drive data is not end-to-end encrypted, is readable JSON, and is protected by Google-account access; the separate manual GTBK export, Restore clean, and Import / merge backup actions remain available."
    - "Every new control has an exact accessible name, visible focus, keyboard/D-pad activation, a non-color state cue, and at least a 48dp target across System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion."
  artifacts:
    - {path: src/domains/backup/automaticBackupPresentation.ts, provides: bounded AutomaticBackupStatus-to-UI projection, recovery prompts, 24-hour warning, and data-use policy model}
    - {path: app/more/data-and-recovery.tsx, provides: compact backup proof/action, guided restore mode, and recovery-tool navigation}
    - {path: app/more/automatic-backup-settings.tsx, provides: account, data-use, privacy, disconnect, delete, and restart-after-deletion administration}
    - {path: app/more/manual-encrypted-backup.tsx, provides: extracted Phase 11 create, restore-clean, and merge GTBK workflows}
    - {path: app/more/drive-backup-privacy.tsx, provides: discoverable non-blocking Google Drive privacy explanation}
    - {path: src/bootstrap/phase12BackupTestControls.ts, provides: development-test-only deterministic backup and recovery states}
    - {path: maestro/phase12/automatic-drive-backup.yaml, provides: manifest-bound fake-port recovery and backup lifecycle evidence}
  key_links:
    - {from: Connect Google Drive, to: GoogleAuthPort and AutomaticBackupCoordinator.run startup, via: explicit owner action followed by restore quarantine}
    - {from: empty-local restore choice, to: AutomaticPortableRestorePort, via: a current restore claim with no merge preview}
    - {from: non-empty restore choice, to: Phase 11 AutomaticPortableMergePort behavior, via: preview plus exact MERGE, fresh Google auth, explicit adoption, and one serialized transaction}
    - {from: Back up now or Retry, to: AutomaticBackupScheduler.request, via: synchronous manual/retry request with an attempt-local cellular override}
    - {from: Automatic backup settings row, to: account/data-use/privacy/disconnect/delete controls, via: a separate route that keeps administration out of the everyday status hierarchy}
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

Existing UI anchors are `app/more/data-and-recovery.tsx`, `app/more/__tests__/data-and-recovery.test.tsx`, `app/_layout.tsx`, `src/ui/screens/SettingsScreen.tsx:328-345`, `src/ui/__tests__/SettingsScreen.test.tsx`, `maestro/phase11/portable-merge.yaml`, and `scripts/run-phase11-maestro.mjs`. Preserve all Phase 11 manual GTBK behavior while extracting it intact to the dedicated Manual encrypted backup route. Google connection must never request the manual GTBK password.
</context>

## Artifacts this phase produces

- `AutomaticBackupViewModel`, `AutomaticBackupRecoveryPrompt`, `AutomaticBackupDataUsePolicy`, and `projectAutomaticBackupPresentation` in `src/domains/backup/automaticBackupPresentation.ts`.
- Shared `NavigationRow` in `src/ui/components/NavigationRow.tsx` for titled route rows with optional supporting text and a forward affordance.
- Root-runtime-owned `automaticBackup: AutomaticBackupViewModel`, plus typed façade commands `connectAutomaticBackup`, `continueAutomaticRestore`, `deferAutomaticRestore`, `cancelAutomaticBackupCheck`, `requestAutomaticBackupNow`, `retryAutomaticBackup`, `checkAutomaticBackupAgain`, `finishAutomaticBackupSetup`, `setAutomaticBackupDataUsePolicy`, `takeOverAutomaticBackup`, `disconnectAutomaticBackup`, `deleteAutomaticCloudBackup`, `finishDeletingAutomaticCloudBackup`, and `startNewAutomaticCloudBackup`.
- UI-owned `useManualBackupController` and `useCsvExportController`; these preserve manual behavior without giving either route authority over automatic recovery.
- Development-test-only `Phase12BackupTestControls` and deterministic `phase12AutomaticBackupFixtures`.
- `app/more/drive-backup-privacy.tsx`, `maestro/phase12/automatic-drive-backup.yaml`, `scripts/run-phase12-maestro.mjs`, and the `test:maestro:phase12` package command.

## Approved information architecture

```text
Settings
  -> Data & recovery
       NORMAL / PENDING / PAUSED
         1. Google Drive backup proof + one primary action
         2. Recovery tools
              - Automatic backup settings -> account, network, privacy, disconnect, delete
              - Manual encrypted backup -> dedicated page with existing GTBK operations
              - Export CSV -> existing export operation
       RESTORE QUARANTINE
         1. Guided cloud recovery decision (temporary page focus)
         2. Manual encrypted backup alternative
```

The main page answers `Am I protected?` before presenting tools. Administrative and
destructive controls never compete with `Back up now` on that page.

`Manual encrypted backup` opens `app/more/manual-encrypted-backup.tsx`. First extract the
existing Create secure backup, Restore clean, and Import / merge backup behavior into one
UI-owned `useManualBackupController`; keep latches, preflight tokens, password clearing,
generation fencing, safe error mapping, rebuild retry, and cleanup in that controller. Share
only pure `BackupPreviewFacts` presentation with automatic recovery. Do not reuse the manual
route's local state machine for automatic recovery, which remains runtime-owned. Port the
complete existing component suite before changing the hub, then give the route one `Manual
encrypted backup` heading and three flat independently scannable operation cards. Do not
place these workflows in a sheet or expandable hub section.

Use one shared render-only `NavigationRow` primitive for the two Recovery tools destinations,
the direct Export CSV action row, and interactive network/privacy rows on Automatic backup
settings. The primitive renders semantics and delegates activation; it owns no CSV, Drive,
navigation, or recovery state. Render the Google account as a noninteractive factual row. Its contract is: required title,
optional supporting text, outlined Lucide `ChevronRight`, full-row activation, default/card
tone, minimum 48dp target, wrapping vertical growth, pressed/disabled/visible-focus states,
exact accessible label and optional hint, Enter/Space/D-pad parity, and decorative icon
hidden from accessibility. It is not a content card and never nests a card. Do not create
route-local pressable-row styling or use `SecondaryAction` plus detached description text.
The Export CSV row is the one action-row variant rather than a navigation destination. A
dedicated UI-owned `useCsvExportController` owns the existing prepare/share lifecycle, handle
disposal, generation fence, and focus requests; `NavigationRow` only renders its projected
state. Use exactly these six identifiers and contracts:

| State | Visible title/supporting text | Accessible action | Announcement / focus |
|---|---|---|---|
| `ready` | `Export CSV`; `Readable spreadsheet file. Not password-protected.`; decorative `Download` | name `Export CSV`; hint `Creates a readable spreadsheet file that is not password-protected`; enabled | No live announcement; normal row focus |
| `preparing` | `Preparing CSV export`; existing privacy support remains visible; bounded activity replaces icon | name `Preparing CSV export`; busy + disabled; no activation hint | Polite announcement once; focus remains on the stable row container |
| `ready_to_share` | `CSV export ready`; decorative `Share2`; action text `Share CSV` | name `Share CSV`; hint `Opens the Android share sheet for the prepared CSV`; enabled | Polite announcement once; focus stays on the changed row |
| `sharing` | `Sharing CSV export`; bounded activity | name `Sharing CSV export`; busy + disabled | Polite announcement once; focus stays on the stable row container |
| `create_failed` | `CSV export could not be created`; `Your saved data was not changed.`; decorative `RotateCcw` | name `Try CSV export again`; hint `Creates a fresh CSV export`; enabled | Assertive announcement; focus moves to retry action |
| `share_failed` | `CSV could not be shared`; `Your saved data was not changed.`; decorative `RotateCcw` | name `Try CSV export again`; hint `Creates a fresh CSV export and opens sharing again`; enabled | Assertive announcement; focus moves to retry action |

When the Android share sheet closes after a successful handoff, return to `ready` and
restore focus to the Export CSV row; do not claim that another app completed sharing.
Keep the row's position stable so state changes do not shift the surrounding hierarchy.
Do not add a CSV route or pre-export confirmation sheet.

Healthy backup proof is visually factual, not celebratory: one outlined Lucide `Check`,
`Backed up` in `bodyStrong`, and the verified date/time in IBM Plex Mono on a neutral
ContentCard. Success color applies only to the semantic icon/text cue. Do not tint the
card, add a status pill, enlarge the status into a metric, or compete with the primary
action. Pending, paused, restore-required, and error states use the same spatial slot
with text plus their approved semantic icon/color; layout does not jump between states.

Responsive structure is intentionally one column at every width. Use AdaptiveScreen with
a centered maximum width of 720dp: 16dp compact inset, 24dp medium, and 32dp expanded.
Do not introduce a tablet side pane or context rail for backup proof, restore progress,
tools, settings, or destructive actions. At 200% text, rows and buttons grow vertically,
supporting text wraps without truncation, actions never share a horizontal row, and the
visual/focus order remains top-to-bottom. Route transitions focus the screen heading;
guided-stage changes politely announce the stage heading; modals focus their heading,
contain focus, dismiss with Android Back, and restore focus to the invoking control.
Register `more/data-and-recovery`, `more/automatic-backup-settings`,
`more/manual-encrypted-backup`, and `more/drive-backup-privacy` explicitly in the root
Stack. Add root-layout and route tests for direct/deep-link entry, Android Back, and
heading focus so all nested destinations have consistent fade/header behavior and no
implicit-route surprise.

## Guided recovery journey

```text
STEP  OWNER SEES                    OWNER SHOULD FEEL       DESIGN SUPPORT
1     Backup found + date           Relieved, not alarmed   Verified-copy language; no mutation yet
2     Review / restore choice       In control              One primary action; Not now is honored
3     Checking backup               Reassured               Bounded progress; no protocol jargon
4     Restoring on this phone       Safe                    Local operation; clear failure recovery
5     Finishing backup setup        Nearly done             Explains why cloud backup is still paused
6     Backed up + verified time     Protected               Proof-first normal-state card
```

The route is a projection, not the recovery owner:

```text
coordinator / scheduler / persisted recovery state
                    |
                    v
 root WorkoutAppRuntimeProvider (one AutomaticBackupViewModel)
          | publish only the newest runtime generation
          +----------------------+----------------------+
          v                      v                      v
 Data & recovery       Automatic backup settings   route remount/foreground
```

Load the model in the trusted runtime read, refresh it on foreground, and publish after every
coordinator transition and façade-command completion. A repository/coordinator subscription
may drive those publications, but it must be disposed with runtime services and every callback
must be fenced by runtime generation plus connection/account/claim identity. Route focus may
request a refresh as a safety net; routes must not read the repository independently.

During execution expose exactly three progress stages: `Checking backup`, `Restoring
on this phone`, and `Finishing backup setup`. Supporting copy may name the current user
outcome, but never exposes `writer epoch`, `claim`, `manifest`, `promotion`, ETag, or
other protocol terms. Diagnostics retain those details.

Back, Cancel, and unmount behavior is stage-aware and exact:

| Stage | Android Back | Visible Cancel | Route unmount / process teardown |
|---|---|---|---|
| `Checking backup` | Allowed; abort check and return to persistent Restore required card | Present; identical to Back | Cleanup aborts and invalidates the attempt; re-entry shows Restore required |
| `Restoring on this phone` | Blocked after the serialized transaction starts; announce `Restore is still in progress.` | Absent after transaction start | App navigation must not unmount the route; forced process teardown cannot claim cancellation: pre-commit SQLite rolls back, post-commit reopens durable rebuild-pending state |
| `Finishing backup setup` | Allowed; return to hub and keep persistent finishing card | Absent because local restore is already committed | Allowed; durable claim remains and re-entry resumes finishing without rerunning local restore |

Checking cancellation restores focus to `Continue restore` and politely announces `Backup
check cancelled. No changes were made.` A normal local-restore failure focuses its error
heading and offers `Try restore again`. The finishing card action is exactly `Finish backup
setup`; completing handover replaces it with the normal Backed up proof.

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Publish a bounded backup, restore, and recovery presentation surface</name>
  <files>src/domains/backup/automaticBackupPresentation.ts, src/domains/backup/automaticBackupPresentation.test.ts, src/domains/portability/mergePlan.ts, src/domains/portability/mergePlan.test.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx</files>
  <read_first>.planning/REQUIREMENTS.md, .planning/design/v1.1-UX-FLOW.md, .planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md, .planning/phases/12-automatic-google-drive-sync/12-02-SUMMARY.md, src/domains/backup/automaticBackupContracts.ts, src/domains/backup/automaticBackupCoordinator.ts, src/domains/backup/automaticBackupScheduler.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/domains/portability/mergeCommands.ts</read_first>
  <action>Create a pure `projectAutomaticBackupPresentation` boundary over the Plan 01/02 state. Preserve public `AutomaticBackupStatus` values exactly as `not_connected | idle | backup_pending | backing_up | restore_pending | restoring | paused`; express finer UI causes as bounded presentation fields rather than adding transport states. The projection contains only a sanitized account label, last successful backup instant, current/pending generation relationship, data-use policy, recovery candidate dates, safe reason codes, retry eligibility, and action availability. It must never expose OAuth tokens, Drive file IDs, raw ETags, claim tokens, writer epochs, object bodies, local row content, or provider exceptions. Derive `Changes not backed up for 24h` only when committed work remains pending continuously for at least 24 hours; clear the warning only after a verified promoted receipt makes `backed_up_generation >= mutation_generation`.

Add the complete typed runtime façade named in the artifacts section so no route reaches into
the coordinator, scheduler, repository, or auth adapter. `connectAutomaticBackup` performs
explicit One-Tap/drive.file authorization and starts `AutomaticBackupCoordinator.run("startup")`;
it accepts no extra credential. `checkAutomaticBackupAgain`, `finishAutomaticBackupSetup`,
`takeOverAutomaticBackup`, `finishDeletingAutomaticCloudBackup`, and
`startNewAutomaticCloudBackup` map the remaining visible-state actions to explicit coordinator
events instead of overloading generic retry. The resulting installation remains in restore
quarantine until bounded Drive discovery resolves: no artifacts enters `backup_pending` and
permits the first snapshot attempt, but no remote manifest or writer epoch is created until that
candidate passes round-trip validation; existing invalid artifacts stay paused/quarantined; a
valid backup creates an `AutomaticBackupRecoveryPrompt`. If the automatic portability boundary
reports an active workout, keep `restore_pending` and do not mutate until the workout is finished.
For an empty local database, `continueAutomaticRestore` uses `AutomaticPortableRestorePort` to
apply the selected verified snapshot under the current restore claim without a Phase 11 merge
preview. For a non-empty database, use `AutomaticPortableMergePort` to reuse the Phase 11
preview/token lifecycle and exact `MERGE` confirmation. If namespaces differ, require an explicit
adoption selection and fresh Google authentication immediately before commit; the cloud namespace,
identity change, adoption receipt, and full merge must be applied in the same serialized SQLite
transaction. Cancellation or route unmount may abort and invalidate only `Checking backup`/preflight
before the serialized local transaction begins, leaving namespaces and local facts unchanged. Once
that transaction begins, recovery is runtime/repository-owned: route unmount detaches presentation
only, pre-commit failure rolls back, and post-commit teardown must resume durable rebuild and writer
claim without rerunning restore. Component generation fences suppress stale UI delivery; they never
cancel committed recovery work. Stale claim or authentication failure preserves the durable state
specified by Plan 12-02. Never pre-adopt.

Before automatic merge uses the Phase 11 planner at the supported 100,000-row bound, replace
per-session whole-snapshot filtering with one immutable archive/local index keyed by session,
exercise, and set identity. Feed session operations through `MERGE_DIGEST_CONCURRENCY = 4` rather
than one unbounded `Promise.all`; preserve canonical ordering and byte-identical plan/digest results
for all existing fixtures. This is a behavior-preserving prerequisite, not a second merge engine.

Model candidate handling exactly: a valid latest candidate is offered with its produced date; an invalid latest plus verified previous produces an explicit previous-candidate prompt and never auto-restores; a valid candidate whose schema is newer than this app produces `restore_pending` with presentation reason `update_required`, disables restore/backup/delete, and never claims the app can update itself. Show heading `Newer Gym Tracker version required` and body `This backup was created by a newer version. Install a newer Gym Tracker build, then return here. Your cloud backup won't be changed.` Expose `Check again` as the primary action after the user returns, `Not now` as secondary, and keep manual GTBK recovery available. Do not render an Update button, disabled dead end, app-store assumption, or unconfigured external download link. Add `requestAutomaticBackupNow` so `wifi_and_cellular` runs immediately on available connectivity. Under `wifi_only`, Wi-Fi runs immediately; cellular returns a one-run confirmation state. Cancellation leaves the pending generation unchanged; confirmation schedules only that manual attempt with a cellular override and does not mutate the saved policy. `retryAutomaticBackup` calls `AutomaticBackupScheduler.request("retry")`; all requests return synchronously and all async errors remain scheduler-owned.

Project coordinator progress into only the three approved stage labels. A stage failure keeps the last completed user-visible stage as context and replaces the active action with a specific recovery action (`Try checking again`, `Try restore again`, or `Finish backup setup`) rather than a generic Retry. Never show percentages unless the underlying operation exposes stable measured progress; use bounded activity state plus stage text otherwise.

Project terminal `stale_writer` into a distinct owner-facing state, never generic paused/auth
copy. The main backup card shows `Backup moved to another phone`; supporting copy says
`Your workouts remain on this phone, but this phone no longer updates Google Drive.` Do
not show Retry or Reconnect. Automatic backup settings offers `Use this phone for backup…`;
that action performs fresh Google authentication, returns to restore quarantine, validates
the current cloud backup, and requires the correct direct-restore or merge path before a
successor takeover. It never reuses the stale epoch or uploads local data first.

`disconnectAutomaticBackup` confirms and disposes the scheduler, clears only this installation's authorization/writer/cache state, and preserves local SQLite plus every Drive object. `deleteAutomaticCloudBackup` is a distinct flow that requires fresh Google authentication and exact case-sensitive `DELETE`; it invokes the Plan 02 contract to promote a metadata-only successor-epoch tombstone and permanently delete only environment-scoped workout snapshot objects, preserves local facts and the tombstone, and cannot be reached from the disconnect confirmation. Latch duplicate actions and reject stale completions after account, claim, route, or component generation changes.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/backup/automaticBackupPresentation.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>`automaticBackupPresentation.test.ts` covers every public status, 23:59:59/24:00:00 warning boundaries, latest/previous/update-required choices, redaction, both data-use values, and every stage/action availability projection. `mergePlan.test.ts` proves the indexed/bounded-concurrency planner is byte-for-byte equivalent, deterministic, and never exceeds the configured worker bound. Runtime-provider tests observe `backup_pending -> backing_up -> backed_up` and bounded failure transitions after the initiating command has already returned; prove startup/foreground hydration, both routes receiving one model, connection/account/claim generation rejection, and subscription disposal. A table-driven route/runtime suite owns all nine Checking/Restoring/Finishing x Back/Cancel/unmount cells, remount rehydration, no duplicate restore, and pre-/post-commit teardown outcomes. Runtime tests also prove direct empty restore, guarded non-empty merge/adoption rollback, active-workout deferral, manual cellular cancel/confirm semantics, non-awaited requests, disconnect-without-delete, fresh-auth DELETE, duplicate presses, forced teardown recovery, and stale completion rejection.</acceptance_criteria>
  <done>The UI receives one typed, secret-free backup/recovery model and owner-command surface that cannot bypass quarantine, writer handover, Phase 11 merge, connectivity policy, or remote-retention rules.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build the accessible Data and recovery backup and replacement flow</name>
  <files>app/more/data-and-recovery.tsx, app/more/automatic-backup-settings.tsx, app/more/manual-encrypted-backup.tsx, app/more/drive-backup-privacy.tsx, app/more/__tests__/data-and-recovery.test.tsx, app/more/__tests__/automatic-backup-settings.test.tsx, app/more/__tests__/manual-encrypted-backup.test.tsx, app/more/__tests__/drive-backup-privacy.test.tsx, app/_layout.tsx, app/__tests__/root-layout.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx, src/ui/components/NavigationRow.tsx, src/ui/components/NavigationRow.test.tsx, src/ui/portability/useManualBackupController.ts, src/ui/portability/useManualBackupController.test.tsx, src/ui/portability/useCsvExportController.ts, src/ui/portability/useCsvExportController.test.tsx, src/ui/portability/BackupPreviewFacts.tsx, src/ui/portability/BackupPreviewFacts.test.tsx, src/ui/components/index.ts</files>
  <read_first>.planning/REQUIREMENTS.md, .planning/design/v1.1-UX-FLOW.md, DESIGN.md, app/more/data-and-recovery.tsx, app/more/__tests__/data-and-recovery.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx, src/ui/components/index.ts, src/ui/components/PlanRow.tsx, src/domains/backup/automaticBackupPresentation.ts, .planning/phases/11-portable-history-merge-restore/11-03-SUMMARY.md</read_first>
  <action>Implement the approved `Guided recovery mode` hierarchy. Data & recovery is a compact status/recovery hub, not a long control panel. In normal, pending, or paused use, show one flat Google Drive backup card first with status, last verified success, and exactly one dominant action (`Connect Google Drive`, `Back up now`, `Retry`, or `Reconnect Google Drive`). Below it, render one `Recovery tools` card with three scannable rows in this order: `Automatic backup settings`, `Manual encrypted backup`, and `Export CSV`. Preserve the existing GTBK and CSV operations behind those rows without nesting content cards. Add `app/more/automatic-backup-settings.tsx`; it owns sanitized account, data-use policy, privacy navigation, Disconnect, Delete cloud backup, and the explicit Start a new cloud backup flow after a deletion tombstone. Administrative/destructive actions never appear on the everyday Data & recovery page.

The disconnected state shows `Not connected`, `Connect Google Drive`, and a short privacy sentence; pressing Connect launches Google directly and never renders an additional secret field. `How Drive backup privacy works` lives on the Automatic backup settings route and remains discoverable before connection through the disconnected backup card. The privacy route must contain these exact facts in plain language: `Automatic Drive backups are not end-to-end encrypted.` `They are stored as readable JSON in your Google Drive.` `Access to your Google account protects them, so anyone who can access that account may be able to read your workout data.` Also state that Gym Tracker requests `drive.file`, manual GTBK exports remain password-encrypted, and connection requires no extra acknowledgement. Update the Settings card description so automatic Drive backup and manual recovery are both discoverable without presenting a workout-path spinner.

For connected idle/current state, the main-page backup card renders a non-color `Backed up` status, exact last-success value (or `No successful backup yet`), and `Back up now`; account and data-use detail are visible one level deeper in Automatic backup settings. Default persisted policy is `wifi_and_cellular`/`Any connection`. Pending and active states render `Backup pending` or `Backing up` without blocking navigation. If pending reaches 24 hours, the card renders the exact non-color warning `Changes not backed up for 24h`, the last verified backup time, and `Retry`. When Wi-Fi only is saved and the current network is cellular, pressing Back up now opens a modal that says the saved preference will not change, with `Cancel` and `Use cellular this time`; Cancel keeps the pending state, while confirmation applies to that attempt only.

On first connection with a valid cloud candidate, show `Backup found` with its date before any local mutation. Empty local data offers `Restore backup` and `Not now`; Not now leaves the app quarantined and unable to publish. Non-empty local data routes through the existing Phase 11 bounded review, shows `No changes have been made yet`, retains exact `MERGE`, and, only for a namespace mismatch, adds a required control labeled `Adopt this backup identity on this phone`. Explain that adoption is one-time; commit action is `Adopt identity and merge`, performs fresh Google authentication, and remains disabled until both confirmation requirements are satisfied. Any cancel/back/unmount returns to the quarantined prompt. Never run restore/merge while an active workout exists; show `Finish the active workout before restoring this backup` and keep workouts usable.

For the non-empty merge review, lead with six owner-facing outcome rows in this exact
order: `Added from backup`, `Already on this phone`, `Updated from backup`, `Kept from
this phone`, `Kept as separate items`, and `Needs attention`. Each row uses plain-language
supporting text tied to the Phase 11 conflict rule and a monospaced count. Add a collapsed
`Show merge details` disclosure containing the exact engine counters `Records inserted`,
`Duplicates unchanged`, `Archive wins`, `Local wins`, `Kept both`, `Remapped IDs`, and
`Conflicts` for diagnostics/evidence. The disclosure is closed by default, keyboard/D-pad
operable, announced with expanded semantics, and returns to closed when a fresh preflight
token replaces the review. Namespace adoption is not hidden in details: render its one-time
identity consequence as a separate attention notice immediately before the confirmation
field. Keep `No changes have been made yet` and exact `MERGE`.

Choosing `Not now` never dismisses the requirement into a transient toast and never reopens a blocking prompt automatically. Persist quarantine and render a main-page backup card labeled `Backup found` with non-color status `Restore required`, the backup date, concise copy that automatic backup remains paused, and `Continue restore` as the one primary action. Local workouts and all manual recovery tools remain usable. This card replaces the normal backup-proof card until recovery, update-required handling, disconnect, or cloud deletion resolves the state.

## Complete visible-state matrix

| State | Main page first content | Dominant action | Secondary context |
|---|---|---|---|
| Not connected | `Google Drive backup · Not connected` | `Connect Google Drive` | Short privacy sentence; Recovery tools remain |
| First backup pending | `Backup pending · No successful backup yet` | `Back up now` when eligible | Waiting-for-Wi-Fi copy when policy blocks |
| Backing up | `Backing up` in the stable status slot | Disabled busy `Backing up` | Last verified time remains visible |
| Backed up | Check + `Backed up` + monospaced verified time | `Back up now` | No celebratory surface |
| Restore required after Not now | `Backup found · Restore required` + date | `Continue restore` | No automatic prompt reopening |
| Checking backup | Guided recovery stage 1 | Stage-specific cancel/back behavior | No protocol terms |
| Restoring locally | Guided recovery stage 2 | Busy restore action | Local-safe failure copy |
| Finishing setup | Guided recovery stage 3 | Busy finish action | Explains cloud backup is still paused |
| Latest unusable, previous valid | Attention notice + both dates/consequence | `Restore previous backup` | `Why can't I use the latest backup?` |
| Newer app required | Honest newer-build explanation | `Check again` | `Not now`; manual GTBK remains |
| Auth expired | `Google Drive needs attention` | `Reconnect Google Drive` | Last verified backup remains visible |
| Offline/transient failure <24h | `Backup pending` | `Back up now` when eligible | Quiet automatic-retry copy |
| Unprotected for 24h | `Changes not backed up for 24h` | `Retry` | Exact last verified time |
| Backup moved to another phone | Distinct handover copy | None on hub | Settings offers guarded `Use this phone for backup…` |
| Deleted tombstone | `Cloud backup deleted` | None on hub | Settings offers guarded `Start a new cloud backup…` |
| Delete partial | `Cloud deletion incomplete` | `Finish deleting cloud backup` | Local data remains; tombstone protection explained |
| Invalid artifacts, no recovery candidate | `Cloud backup can't be verified` | `Try checking again` | Manual GTBK and Disconnect remain |

Every state uses the same backup-card footprint where practical, text plus semantic icon/color,
one dominant action, and a specific next step. No state exposes ETag, epoch, manifest, file ID,
provider exception, or raw account identity.

If latest verification fails and previous is verified, use an attention notice rather
than a destructive error surface. Heading: `Latest backup can't be used`. Body: `A
verified backup from {previous date and time} is available. Changes after that time won't
be restored.` Primary action: `Restore previous backup`. Secondary: `Not now`. Add
`Why can't I use the latest backup?` to open a bounded explanation with no file IDs,
provider exception, or protocol jargon. Never select or restore the previous copy
automatically. If latest requires a newer app schema, use the approved `Newer Gym Tracker
version required` / `Check again` state, do not label it corrupt, do not offer previous,
and keep every cloud mutation disabled. Invalid artifacts with no verified candidate show a safe paused/retry state and
remain quarantined.

On Automatic backup settings, Disconnect is a secondary action and Delete cloud backup is the final destructive action after a divider; neither is a peer of Back up now. Disconnect confirmation must say that automatic backup stops on this phone, local workouts remain, and cloud backups remain in Drive. It must not present or call deletion. `Delete cloud backup …` opens a separate danger flow, explains local data is retained, requires fresh Google authentication, requires exact `DELETE`, and explains that workout snapshots are permanently removed while a metadata-only deletion marker with no workout data remains to stop an old phone from recreating them. Latch duplicate submission and report partial/failure outcomes without claiming snapshot removal unless the bounded deletion contract succeeds. A later `Start a new cloud backup` action requires fresh authentication and explicit confirmation before the tombstone may become active. Keep `Create secure backup`, `Restore clean`, and `Import / merge backup` on the Manual encrypted backup route, plus the direct CSV control on the hub, operational in every automatic-backup state.

Component tests cover every status/recovery branch, account redaction, timestamp states, first-connect no-artifact/valid/invalid, empty restore, non-empty merge, namespace match/mismatch/adoption rollback, active workout, latest/previous confirmation, update-required behavior, both data-use policies, one-run cellular override, 24-hour warning, disconnect retention, guarded deletion, duplicate press, the exact Checking/Restoring/Finishing Back-Cancel-unmount matrix, and retained manual controls. Assert exact accessible names/roles/states, live-region semantics, focus return, keyboard Enter/Space and D-pad activation, >=48dp targets, non-color icons plus text, System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion. Do not expand the established personal-use scope into a TalkBack or switch-scanning release gate.</action>

Implement this task as three gated slices, each green before the next begins. Slice 1 is behavior-preserving structure: add render-only `NavigationRow`, extract `useManualBackupController`, `useCsvExportController`, and pure preview facts, port every existing Phase 11 manual GTBK/CSV test, and explicitly register the four routes. Slice 2 builds the two destination routes and compact hub solely against the typed runtime model/commands. Slice 3 adds the full state matrix, recovery navigation blocking, accessibility/focus behavior, and native evidence wiring. Do not combine route extraction and new automatic behavior in the same unverified edit.

Testing ownership is exact. `manual-encrypted-backup.test.tsx` plus `useManualBackupController.test.tsx` inherit every existing create/restore/merge assertion: token invalidation, late completion, password clearing, exact REPLACE/MERGE, rebuild retry, safe errors, duplicate press, review focus, and unmount cleanup. `data-and-recovery.test.tsx` plus `useCsvExportController.test.tsx` own a six-row table for `ready`, `preparing`, `ready_to_share`, `sharing`, `create_failed`, and `share_failed`, asserting visible copy, accessible label/hint, busy/disabled state, live-region priority, stable focus, retry focus, post-share reset, and handle cleanup. `root-layout.test.tsx` owns a parameterized four-route registration/direct-entry/Back-return matrix; Maestro deep-links each route, verifies heading focus, and returns to the expected parent. Automatic-presentation tests must not import or assert CSV state.</action>
  <verify><automated>npm run test:components -- --runInBand app/__tests__/root-layout.test.tsx src/ui/components/NavigationRow.test.tsx src/ui/portability/useManualBackupController.test.tsx src/ui/portability/useCsvExportController.test.tsx src/ui/portability/BackupPreviewFacts.test.tsx app/more/__tests__/data-and-recovery.test.tsx app/more/__tests__/automatic-backup-settings.test.tsx app/more/__tests__/manual-encrypted-backup.test.tsx app/more/__tests__/drive-backup-privacy.test.tsx src/ui/__tests__/SettingsScreen.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated></verify>
  <acceptance_criteria>The tested UI contains the exact connection, privacy, restore/fallback/update, status, 24-hour warning, data-use, disconnect, and DELETE behavior above; the four-route direct-entry/Back/focus matrix passes; the complete Phase 11 manual regression suite passes after extraction; all six CSV lifecycle/accessibility states pass under their UI controller; the Google section contains no extra credential input; manual GTBK/CSV actions remain independently usable; every new control passes the complete accessibility matrix.</acceptance_criteria>
  <done>The owner can connect, recover onto a replacement installation, understand backup health/privacy, control data use, manually back up, disconnect, or deliberately delete cloud data without an unsafe or inaccessible path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add deterministic Phase 12 fake-port Maestro coverage</name>
  <files>src/bootstrap/phase12BackupTestControls.ts, src/bootstrap/phase12BackupTestControls.test.ts, src/testing/phase12AutomaticBackupFixtures.ts, maestro/phase12/automatic-drive-backup.yaml, scripts/run-phase12-maestro.mjs, scripts/phase12-evidence-scripts.test.mjs, package.json</files>
  <read_first>src/bootstrap/workoutMutationTestControls.ts, src/bootstrap/workoutMutationTestControls.test.ts, app/__native-contracts.tsx, scripts/run-phase11-maestro.mjs, scripts/phase11-evidence-scripts.test.mjs, maestro/phase11/portable-merge.yaml, package.json</read_first>
  <action>Add development-test-only `Phase12BackupTestControls` backed by `GoogleAuthPort`, `DriveBackupStorePort`, `AutomaticPortableRestorePort`, `AutomaticPortableMergePort`, coordinator, scheduler, clock, and network fakes. Gate them with the existing native-contract/development-test build identity; production must fail closed if a route, query parameter, deep link, fixture, or environment variable attempts to enable them. Fixtures must contain bounded synthetic workout data and expose no real Google identity, access token, remote object, or production environment marker. Include the direct Export CSV row's `ready`, `preparing`, `ready_to_share`, `sharing`, `create_failed`, and `share_failed` states in component coverage; it remains local/manual behavior and makes no Google call.

Add `test:maestro:phase12` and a manifest-bound runner for `artifacts/native/phase12/build.json`. Run named scenarios for: all four routes via direct deep link with heading focus and Android Back return; disconnected privacy help and Google-only Connect; no-cloud first initialization; valid-backup empty direct restore; populated Phase 11 merge with one-time namespace adoption and owner-facing summary/details disclosure; the exact Checking/Restoring/Finishing x Back/Cancel/unmount contract including remount without duplicate restore; Not now persistent restore card without reprompt; invalid latest with explicit dated previous fallback; future-schema Newer Gym Tracker version required with Check again; status/last-success/account; wifi_and_cellular and wifi_only; one-run cellular cancel/confirm; 24-hour warning and Retry; backup moved to another phone plus guarded takeover entry; disconnect retaining fake cloud objects; guarded fresh-auth DELETE/tombstone/partial-delete states; direct Export CSV lifecycle; and manual GTBK page actions retained. At least one paused/pending scenario must open and complete a local workout to prove the UI remains non-blocking. The runner verifies exact source-tree/APK/package/device identity, exact flow and evidence IDs, zero skipped/failed assertions, and rejects stale/missing output. Maestro proves UI/lifecycle behavior only; Plan 04 supplies persistence, crash, transport, and real-Google evidence.</action>
  <verify><automated>npm run test:unit -- --runInBand src/bootstrap/phase12BackupTestControls.test.ts &amp;&amp; node --test scripts/phase12-evidence-scripts.test.mjs &amp;&amp; node --check scripts/run-phase12-maestro.mjs &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated><native>npm run test:maestro:phase12 -- --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>The manifest-bound fake flow exercises every named recovery/status/privacy/data-use/disconnect/delete state with zero skips; production cannot enable test controls; local workout use succeeds while backup is pending/paused; no real Google call or production namespace appears in fixtures or artifacts.</acceptance_criteria>
  <done>The complete user-visible automatic-backup and replacement-recovery lifecycle has reproducible, accessible native UI evidence over deterministic fakes.</done>
</task>
</tasks>

<verification>Run the focused presentation/runtime/component tests, type/lint/boundary checks, evidence-contract self-tests, and the Phase 12 manifest-bound fake-port Maestro suite. Inspect the Data & recovery tree in every state to confirm the privacy link and manual GTBK controls remain present, and inspect test artifacts for absence of real account credentials and production-environment identifiers.</verification>

<success_criteria>DATA-10 is understandable and safely operable from Data & recovery: Google-only connection enters quarantine; recovery is explicit and local-shape-aware; latest/previous/update handling cannot silently downgrade; backup health and connectivity preferences are visible; 24-hour warning, manual backup, disconnect, and deletion behave exactly as documented; manual recovery and offline workouts remain available.</success_criteria>

<output>Create `.planning/phases/12-automatic-google-drive-sync/12-03-SUMMARY.md` when done.</output>

## Focused engineering review amendments

### Scope and implementation gates

The approved Guided recovery UX remains intact. Implement it as three sequential green slices:

1. **Make the change easy:** add render-only `NavigationRow`, extract manual GTBK and CSV
   controllers plus pure preview facts, port parity tests, and register all four routes.
2. **Make the easy change:** publish one runtime-owned `AutomaticBackupViewModel`, complete
   the typed façade, and build the compact hub plus destination routes against that boundary.
3. **Close behavior and evidence:** wire every visible state, lifecycle guard, accessibility/focus
   contract, fake-port control, and Maestro path.

No slice may begin until the previous slice's focused tests, typecheck, lint, and boundary checks
are green. This sequencing contains a 34-file plan without dropping approved behavior.

### Focused coverage map

```text
CODE PATHS                                           USER FLOWS
[+] automaticBackupPresentation                      [+] Data & recovery hub
  +- [★★★ PLANNED] all statuses/reasons/actions        +- [★★★ PLANNED] full visible-state matrix
  +- [★★★ PLANNED] redaction + 24h boundaries          +- [★★★ PLANNED] mounted async state refresh
[+] root runtime publication                         [+] Guided replacement recovery [E2E]
  +- [★★★ PLANNED] startup/foreground hydration        +- [★★★ PLANNED] empty direct restore
  +- [★★★ PLANNED] coordinator transition publish      +- [★★★ PLANNED] merge + adoption
  +- [★★★ PLANNED] stale generation rejection          +- [★★★ PLANNED] exact 3x3 exit/remount matrix
  +- [★★★ PLANNED] teardown unsubscribe                +- [★★★ PLANNED] previous/future-schema paths
[+] manual GTBK controller                           [+] Route system [E2E]
  +- [★★★ REGRESSION] create/restore/merge parity       +- [★★★ PLANNED] four direct links
  +- [★★★ REGRESSION] tokens/latches/late results       +- [★★★ PLANNED] heading focus + Back return
  +- [★★★ REGRESSION] errors/rebuild/unmount            +- [★★★ PLANNED] manual page navigation smoke
[+] CSV controller                                   [+] Destructive/account flows [E2E]
  +- [★★★ PLANNED] exact six-state table                +- [★★★ PLANNED] disconnect retains cloud
  +- [★★★ PLANNED] focus/live-region/cleanup            +- [★★★ PLANNED] fresh-auth DELETE/partial finish
[+] merge planner                                    [+] Large replacement backup
  +- [★★★ PLANNED] indexed equivalent output            +- [★★★ PLANNED] Android time/memory gate
  +- [★★★ PLANNED] concurrency never exceeds four

COVERAGE AFTER AMENDMENT: 22/22 named branches and user-flow groups have an explicit owner.
QUALITY TARGET: ★★★ behavior + boundaries + error/restart paths. No LLM eval applies.
```

### Focused failure modes

| Boundary | Realistic failure | Required proof | Owner-visible result |
|---|---|---|---|
| Runtime publication | Old account callback wins after reconnect | Generation/account/claim rejection test | Both routes keep the current account state. |
| Checking cancellation | Back or unmount races discovery | 3x3 runtime/route table | Restore required returns; no local mutation. |
| Restore transaction | Process dies before or after commit | Host/native crash cut plus remount test | Rollback before commit; durable finishing after commit. |
| Manual extraction | Route split drops token cleanup or exact confirmation | Ported Phase 11 parity suite | Manual encrypted recovery behaves unchanged. |
| CSV row | Share closes/fails while route unmounts | Six-state controller table | Handle is disposed and focus returns safely. |
| Deep link | Nested route starts without a parent history entry | Root matrix plus native deep link | Heading receives focus and Back returns predictably. |
| Large merge | Valid 100,000-row archive causes quadratic scans or digest fan-out | Equivalence/concurrency unit tests plus Android benchmark | Replacement merge is disabled if limits fail; manual GTBK remains. |

No reviewed failure is silent, unhandled, and untested.

### NOT in scope

- Live multi-device reconciliation or a second merge engine; this remains single-active-device replacement recovery.
- Route-local SQLite or coordinator access; routes consume only the root-runtime model and typed façade.
- Shared automatic/manual workflow state; only pure preview presentation is shared.
- Polling for UI freshness; coordinator publications plus startup/foreground refresh are sufficient.
- A CSV route, automatic-backup-owned CSV state, or stateful `NavigationRow`.
- Public/store distribution; the existing personal APK delivery model remains unchanged.

### What already exists

| Existing code | Reuse decision |
|---|---|
| Phase 11 manual backup, restore, and merge behavior in `data-and-recovery.tsx` | Extract behind one UI controller and preserve with a complete regression suite. |
| Phase 11 merge planner and fingerprinted writer | Optimize indexing/concurrency without changing its canonical result; do not fork it. |
| Root `WorkoutAppRuntimeProvider` and `trustedRead` | Own and publish the one automatic-backup view model for every route. |
| Expo Router root Stack | Explicitly register all four recovery routes and prove deep-link/Back behavior. |
| Phase 11 manifest-bound native and Maestro patterns | Extend for Phase 12 identities and exact cases. |
| Existing post-implementation visual QA TODO | Retain; no new TODO is needed from this focused review. |

### Parallelization

Sequential implementation, no safe parallelization inside Plan 12-03. The three slices share
`app/more`, runtime types, and route/component tests. Plan 12-04 follows the merged Plan 12-03
source so evidence cannot bind to stale interfaces or APK bytes.

### Implementation tasks from focused review

- [ ] **T1 (P1, human: ~2h / CC: ~15m)** — Runtime recovery — Make recovery runtime-owned once local restore starts.
  - Surfaced by: Architecture review — lines 185-205 previously contradicted route-unmount semantics.
  - Files: `src/bootstrap/workoutAppRuntime.tsx`, automatic coordinator/repository, route tests.
  - Verify: table-driven 3x3 lifecycle suite plus host/native process-death cuts.
- [ ] **T2 (P1, human: ~3h / CC: ~20m)** — Runtime presentation — Publish one generation-fenced automatic-backup model and exhaustive command façade.
  - Surfaced by: Architecture/code-quality review — background transitions had no shared observable owner.
  - Files: automatic presentation, `workoutAppRuntime.tsx`, runtime tests.
  - Verify: mounted pending/backing-up/success/error transitions, foreground hydration, stale callback rejection, disposal.
- [ ] **T3 (P1 regression, human: ~4h / CC: ~30m)** — Manual portability UI — Extract controllers and pure facts before splitting routes.
  - Surfaced by: Code-quality/test review — moving the 1,055-line route intact would retain duplicate state machinery and risk regressions.
  - Files: `src/ui/portability/*`, manual route, Data & recovery route, component tests.
  - Verify: complete port of existing Phase 11 create/restore/merge and CSV assertions.
- [ ] **T4 (P1, human: ~3h / CC: ~25m)** — Navigation and recovery UI — Prove the route and state matrices.
  - Surfaced by: Test review — direct entry, Back/focus, and 3x3 recovery lifecycle lacked exact test owners.
  - Files: root layout, four routes, route/component tests, Phase 12 Maestro.
  - Verify: parameterized root test and native deep-link/Back/focus/recovery flows.
- [ ] **T5 (P1, human: ~1d / CC: ~1h)** — Merge performance — Remove quadratic session scans and bound digest concurrency at four.
  - Surfaced by: Performance review — valid maximum archives could freeze or exhaust JS memory.
  - Files: `mergePlan.ts`, merge-plan tests, Phase 12 benchmark/evidence scripts.
  - Verify: byte-equivalence, deterministic ordering, concurrency bound, and Android 10s p95/192 MiB growth gates.
