---
phase: 12-automatic-google-drive-sync
plan: 03
type: execute
wave: 3
depends_on: [12-02]
files_modified:
  - app/more/data-and-recovery.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/domains/sync/syncStatus.ts
  - src/domains/sync/syncStatus.test.ts
  - src/bootstrap/phase12SyncTestControls.ts
  - src/bootstrap/phase12SyncTestControls.test.ts
  - maestro/phase12/google-drive-sync.yaml
  - scripts/run-phase12-maestro.mjs
  - package.json
autonomous: true
requirements: [DATA-10]
must_haves:
  truths:
    - "D-03: Settings > Data and recovery exposes exactly the optional states Not connected, Synced, and Paused with Connect Google Drive, Sync now/Retry, and Disconnect sync; manual DATA-09 export/import remains separate and available."
    - "D-01: connection asks for the sync passphrase only in a protected transient form, never echoes or persists it, gives generic wrong-passphrase/decryption guidance, and disconnect clears the account-scoped SecureStore key."
    - "D-02: Connect uses the vetted Google One-Tap adapter and drive.file scope; no UI suggests family sharing, a managed backend, broader Drive access, or Firestore."
    - "D-04: Connect/Sync now/Retry schedule coordinator work without adding a workout-path spinner; status is bounded/non-secret, every failure remains retryable, and Disconnect never deletes or rolls back local workout data or the remote encrypted file."
    - "Every new control has an exact accessible name, visible focus, keyboard/D-pad activation, non-color state cue, and at least a 48dp target across System/Light/Dark, compact/medium/expanded, 200% text, and reduced motion."
  artifacts:
    - {path: app/more/data-and-recovery.tsx, provides: optional connection, passphrase, status, manual sync/retry, and disconnect UX}
    - {path: src/domains/sync/syncStatus.ts, provides: bounded secret-free state projection for UI}
    - {path: maestro/phase12/google-drive-sync.yaml, provides: faked lifecycle-visible Not connected/Synced/Paused/Retry/Disconnect flow}
  key_links:
    - {from: Connect Google Drive, to: GoogleAuthPort plus key initialization, via: explicit owner action and transient passphrase state}
    - {from: Sync now or Retry, to: scheduler, via: synchronous manual request without awaiting network in the screen}
    - {from: Disconnect sync, to: coordinator cleanup, via: confirmation then cancel/delete-key/sign-out while preserving local and remote stores}
---

<objective>Expose the finished sync engine safely in Settings → Data and recovery with optional Connect, concise Synced/Paused status, Sync now/Retry, and explicit Disconnect, while preserving the separate manual backup/merge fallback and keeping workout UI non-blocking.</objective>

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
@.planning/phases/12-automatic-google-drive-sync/12-02-change-log-scheduler-reconcile-PLAN.md
@.planning/phases/11-portable-history-merge-restore/11-03-data-recovery-merge-ui-PLAN.md

Existing plan-time UI anchors are `src/ui/screens/SettingsScreen.tsx:328-345`, `app/more/data-and-recovery.tsx`, `app/more/__tests__/data-and-recovery.test.tsx:273-429`, `.planning/design/v1.1-UX-FLOW.md:129-143`, `maestro/phase5/data-recovery.yaml:7-26`, and `scripts/run-phase5-maestro.mjs:21-49`. At execution preserve the Phase 11 clean-restore/merge/export content and insert Cross-device sync above those manual controls rather than replacing them. OAuth, Drive, and SecureStore remain faked in Maestro; native adapters are covered below the UI seam.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Publish a bounded runtime status and command surface</name>
  <files>src/domains/sync/syncStatus.ts, src/domains/sync/syncStatus.test.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/bootstrap/phase12SyncTestControls.ts, src/bootstrap/phase12SyncTestControls.test.ts</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/design/v1.1-UX-FLOW.md, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx, src/bootstrap/workoutMutationTestControls.ts, src/bootstrap/workoutMutationTestControls.test.ts</read_first>
  <action>Project durable/internal coordinator state into a finite UI model: `not_connected`; `connecting`; `synced` with sanitized account display plus last-success time; `syncing`; and `paused` with one safe reason (`offline`, `auth_expired`, `wrong_passphrase_or_corrupt_store`, `conflict`, `write_failed`, `service_unavailable`) plus retry eligibility. Never surface token, account subject, file ID, revision, path, row content, exception text, key/salt, ciphertext, or provider response. Add runtime commands for explicit connect(passphrase), set-up-first-store/enter-existing-passphrase distinction, manual request, retry, and confirmed disconnect. Keep passphrase only in call-local mutable storage, wipe copied bytes, never place it in React persisted state/test controls/logs, and make cancellation/no account leave `not_connected`. Disconnect cancels scheduler continuation, deletes the account/version SecureStore key and local connection metadata, signs out, and preserves SQLite/Drive. Expose deterministic development-test controls only behind the existing native-contract/test-build gate for Not connected/Synced/Paused/lifecycle transitions; production must fail closed if those controls are requested.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/sync/syncStatus.test.ts src/bootstrap/phase12SyncTestControls.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-01 passphrase/key handling is transient and generic on failure; D-03 supports reversible optional connection/disconnection; D-04 exposes only safe retryable status and non-awaited manual scheduling.</acceptance_criteria>
  <done>The UI receives a typed, secret-free state machine and safe owner-initiated commands with test-only deterministic fakes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build the accessible Data and recovery sync controls</name>
  <files>app/more/data-and-recovery.tsx, app/more/__tests__/data-and-recovery.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/workoutAppRuntime.test.tsx</files>
  <read_first>.planning/design/v1.1-UX-FLOW.md, app/more/data-and-recovery.tsx, app/more/__tests__/data-and-recovery.test.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/__tests__/SettingsScreen.test.tsx</read_first>
  <action>Add a `Cross-device sync` section above manual backup/restore. Not connected explains optional same-Google-account behavior and shows `Connect Google Drive`. The connection sequence calls One-Tap only after the explicit press, then displays a secure passphrase create/confirm form for a new file or enter form for an existing file, with explicit copy that losing/mismatching it prevents decryption; default focus avoids accidental submission and cancellation leaves local usage unchanged. Do not offer passphrase recovery, reveal, Drive deletion, broader scopes, or family sharing.

Synced shows a non-color success label, sanitized account display, last synced time, `Sync now`, and `Disconnect sync`. Paused shows its safe actionable reason plus `Retry` (or reconnect when auth expired) and `Disconnect sync`; offline copy says workouts remain local and retry automatically. Confirm Disconnect with exact consequences: remove this device's connection/key, keep workouts on this device, keep the encrypted Drive file, and retain manual export/import. Disable/latch duplicate connect/sync/disconnect presses but never block navigation/workout logging. Add only a compact non-interactive status line to an existing Settings summary surface if needed; do not add a blocking indicator/modal to Today or active workout.

Component tests cover every state/transition/cancel/failure, passphrase masking and absence from snapshots/logs, lifecycle unmount, duplicate press, local-data-preserving disconnect copy, retained manual actions, exact accessible names/roles/states, focus return, D-pad/keyboard activation, 48dp targets, non-color cues, themes, responsive widths, 200% text, and reduced motion.</action>
  <verify><automated>npm run test:components -- --runInBand app/more/__tests__/data-and-recovery.test.tsx src/ui/__tests__/SettingsScreen.test.tsx src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run lint</automated></verify>
  <acceptance_criteria>D-01 passphrase UX never persists/reveals secrets; D-02 connects through One-Tap/drive.file only; D-03 exact Connect/Synced/Sync now/Paused/Retry/Disconnect states are optional and reversible with manual fallback retained; D-04 no UI action blocks or mutates the workout path and every failure offers safe retry.</acceptance_criteria>
  <done>The owner can understand, connect, observe, manually request, retry, and disconnect sync accessibly without losing local data or manual portability.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add deterministic lifecycle-visible Phase 12 Maestro coverage</name>
  <files>src/bootstrap/phase12SyncTestControls.ts, src/bootstrap/phase12SyncTestControls.test.ts, maestro/phase12/google-drive-sync.yaml, scripts/run-phase12-maestro.mjs, package.json</files>
  <read_first>maestro/phase5/data-recovery.yaml, scripts/run-phase5-maestro.mjs, scripts/run-phase7-maestro.mjs, src/bootstrap/workoutMutationTestControls.ts</read_first>
  <action>Add `test:maestro:phase12` and a manifest-bound, fail-closed runner using the Phase 12 development-test APK. Through gated fake ports, exercise Not connected → Connect Google Drive → masked passphrase → Synced; background/foreground causes a visible last-sync refresh; a fake offline/auth failure becomes Paused while local screens remain usable; Retry returns Synced; Disconnect confirmation returns Not connected while manual backup/merge controls remain. Assert exact labels/test IDs and that the workout can still be opened/completed while fake sync is paused. Never invoke real OAuth/network or encode credentials/passphrases in YAML, environment, screenshots, or artifacts. Runner validates expected app/package/build identity and rejects stale/missing results.</action>
  <verify><automated>npm run test:unit -- --runInBand src/bootstrap/phase12SyncTestControls.test.ts &amp;&amp; node --check scripts/run-phase12-maestro.mjs &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase12 -- --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>D-03 optional Connect/Synced/Paused/Retry/Disconnect behavior and D-04 lifecycle-trigger visibility/local workout availability are proven in Maestro using deterministic faked ports without secret egress.</acceptance_criteria>
  <done>The complete owner-facing optional sync lifecycle has reproducible native UI evidence.</done>
</task>
</tasks>

<verification>Run status/runtime unit tests, full component/accessibility matrix, and the manifest-bound fake-port Maestro flow. Inspect artifacts for absence of credentials/passphrases and confirm manual DATA-09 controls remain present in every sync state.</verification>

<success_criteria>Roadmap criteria 1 and 2 are owner-visible and reversible, criterion 3 has no secret-bearing UI/log state, and criterion 4 remains non-blocking: the app is usable offline before connection, during paused sync, and after disconnect.</success_criteria>
