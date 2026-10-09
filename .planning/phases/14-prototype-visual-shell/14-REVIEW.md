---
phase: 14-prototype-visual-shell
reviewed: 2026-10-09T00:00:00Z
depth: deep
files_reviewed: 80
files_reviewed_list:
  - DESIGN.md
  - app.config.ts
  - app/(tabs)/__tests__/_layout.test.tsx
  - app/(tabs)/_layout.tsx
  - app/__phase2-attended-preview.tsx
  - app/__tests__/phase2-attended-preview.test.tsx
  - app/__tests__/root-layout.test.tsx
  - app/_layout.tsx
  - app/more/__tests__/automatic-backup-settings.test.tsx
  - app/more/__tests__/index.test.tsx
  - app/more/__tests__/manual-encrypted-backup.test.tsx
  - app/more/__tests__/removed-sessions.test.tsx
  - app/more/automatic-backup-settings.tsx
  - app/more/data-and-recovery.tsx
  - app/more/removed-sessions.tsx
  - assets/fonts/Archivo-VariableFont_wdth,wght.ttf
  - assets/fonts/OFL-Archivo.txt
  - maestro/phase14/accessibility.yaml
  - maestro/phase14/font-axis.yaml
  - maestro/phase14/settings-recovery.yaml
  - maestro/phase14/shell.yaml
  - package.json
  - scripts/build-current-native-test-apk.sh
  - scripts/phase14-evidence-scripts.test.mjs
  - scripts/phase14-font-proof.test.mjs
  - scripts/phase14-native-matrix.mjs
  - scripts/phase14-native-matrix.test.mjs
  - scripts/run-phase14-font-proof.mjs
  - scripts/run-phase14-maestro.mjs
  - scripts/validate-development-test-app-config.mjs
  - scripts/verify-phase14-evidence.mjs
  - src/bootstrap/appConfig.test.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/shared/tooling.test.ts
  - src/platform/preferences/appearancePreferenceStore.test.ts
  - src/platform/preferences/appearancePreferenceStore.ts
  - src/testing/contracts/phase14Shell.contract.ts
  - src/testing/phase14FontProof.test.ts
  - src/testing/phase14FontProof.ts
  - src/testing/phase14RecoveryFixture.test.ts
  - src/testing/phase14RecoveryFixture.ts
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx
  - src/ui/__tests__/LibraryScreen.test.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/RemovedSessionsScreen.test.tsx
  - src/ui/__tests__/RestAlertSettingsSheet.test.tsx
  - src/ui/__tests__/RootFailureState.test.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/ui/__tests__/TodayScreen.test.tsx
  - src/ui/__tests__/WorkoutCompletionScreen.test.tsx
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/components/BottomSheet.test.tsx
  - src/ui/components/BottomSheet.tsx
  - src/ui/components/CalendarField.test.tsx
  - src/ui/components/CalendarField.tsx
  - src/ui/components/ConfirmationDialog.test.tsx
  - src/ui/components/ConfirmationDialog.tsx
  - src/ui/components/M3FilterChip.test.tsx
  - src/ui/components/NavigationRow.test.tsx
  - src/ui/components/NavigationRow.tsx
  - src/ui/components/RestAlertSettingsSheet.tsx
  - src/ui/components/SemanticInputFields.test.tsx
  - src/ui/components/SemanticToast.test.tsx
  - src/ui/components/SemanticToast.tsx
  - src/ui/components/TimeDurationField.tsx
  - src/ui/components/WorkoutStartSheet.tsx
  - src/ui/components/index.ts
  - src/ui/portability/useCsvExportController.test.tsx
  - src/ui/portability/useCsvExportController.ts
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/LibraryScreen.tsx
  - src/ui/screens/RemovedSessionsScreen.tsx
  - src/ui/screens/RootFailureState.tsx
  - src/ui/screens/RootScreens.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/screens/WorkoutCompletionScreen.tsx
  - src/ui/shell/AppRootShell.test.tsx
  - src/ui/shell/AppRootShell.tsx
  - src/ui/theme/index.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-09T00:00:00Z
**Depth:** deep
**Files Reviewed:** 80
**Status:** issues_found

## Summary

The Phase 14 shell has solid static type and boundary coverage, and the reviewed dev-test fixture is appropriately gated away from production. However, the release evidence cannot presently be verified against the submitted head, and the shared confirmation frame permits dismissal of an in-flight destructive command. The production tab integration also leaves the Phase 14 focus-return contract unwired. These defects make the phase incomplete until fixed and re-verified with current native evidence.

## Critical Issues

### CR-01: Retained native evidence is stale for the submitted commit

**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/verify-phase14-evidence.mjs:65-73`

**Issue:** The retained manifest is bound to `2ccbd9a8ef4863750a09ad7735184b410fdcff76`, while the submitted head is `5ae9e27609fc193309c87a5ffa7f1d1301c7edb8`. `validatePhase14CurrentArtifacts` accepts a head advance only when *every* changed file is under the evidence directory. The actual range also changes `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/WINDOWS.md`, `.planning/design/v1.2-DEVIATIONS.md`, and Phase summaries. Consequently a verifier with `adb` available will reject the current manifest as `phase14_manifest_stale`; the local verifier could not reach that check only because `adb` is not installed. The claimed native result therefore is not an exact-source proof for the submitted phase.

**Fix:** Rebuild and run the complete Phase 14 native matrix from the final submitted head, retain the resulting APK/reports/screenshots, and regenerate the manifest and evidence records with the new `base_head` and source-tree digest. If documentation-only commits are intentionally allowed after capture, change the verifier to compare a defined source-tree digest (not an ad-hoc path exemption), test that policy with non-evidence documentation changes, and preserve the immutable artifact binding.

### CR-02: Busy destructive confirmations can still be cancelled through system/modal ingress

**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/ConfirmationDialog.tsx:121-149`

**Issue:** `ConfirmationDialog` disables only its visible actions when `confirmBusy` is true; it never passes a corresponding `cancelDisabled` value to `BottomSheet`. `BottomSheet` still calls `onCancel` for Android Back (`onRequestClose`), Escape, the close control, and the scrim at `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/BottomSheet.tsx:153-183`. This affects live destructive operations: the remove-exercise and remove-set sheets pass `confirmBusy` at `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActiveWorkoutScreen.tsx:3051-3104`, but their cancel handlers clear the candidate while the command continues at `:1632-1715` and `:1746-1828`. The user can be returned to an interactive underlying screen even though the removal is still committing, which breaks the command latch and allows navigation/competing actions before the authoritative result is known.

**Fix:** Make the confirmation frame non-dismissible whenever either its local submit latch or `confirmBusy` is true, for example pass `cancelDisabled={confirmBusy || submitting}` to `BottomSheet` and expose that prop through `ConfirmationSheet`. Add tests that invoke `onRequestClose`, scrim/close action, and Escape during each busy destructive flow, asserting that `onCancel` is not called and the sheet remains visible until the command settles.

## Warnings

### WR-01: Root settings focus contract is never connected in the production layout

**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/(tabs)/_layout.tsx:84-106`

**Issue:** The actual tab layout passes only `settingsContent` to `AppRootShell`. It does not supply `settingsTriggerRef`, `activeRoot`, `headingRefs`, or `origin`, even though `AppRootShell` uses those props to restore the settings trigger and coordinate root focus at `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/shell/AppRootShell.tsx:46-58,83-89`. Closing the production settings sheet consequently calls the fallback in `BottomSheet` with no restore target, which requests accessibility focus for node `0` at `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/BottomSheet.tsx:126-151`. The unit test only passes an artificial trigger ref to the shell; it does not exercise the real tab layout.

**Fix:** Keep a ref on the rendered root settings trigger and pass it as `settingsTriggerRef`; wire the real navigation root and heading refs into the shell (or remove the unused coordination API and implement the required behavior at the actual owner). Add an integration test for the tab layout that opens and closes settings and asserts focus returns to the trigger/current root heading.

### WR-02: Successful Removed Sessions restore loses its originating action before focus restoration

**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/RemovedSessionsScreen.tsx:141-147,252-268`

**Issue:** After a successful restore, `dismissConfirmation()` clears `selected` before the confirmation sheet's hidden-state effect restores focus. The `restoreFocusRef` expression then cannot match the selected session and falls back to `headingRef`. This violates the restore-to-origin behavior for the successful path; only cancellation preserves the selected row identity. Existing tests cover outcome text but do not assert focus after a successful restore.

**Fix:** Capture the initiating Restore control in a stable ref (or retain the selected id/ref until the sheet's close transition completes) and pass that immutable ref to `ConfirmationSheet`. Add a successful-restore focus assertion in `RemovedSessionsScreen.test.tsx` in addition to the cancel-path check.

### WR-03: Destructive backup recovery dialogs have no valid focus-return target

**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/more/data-and-recovery.tsx:616-668`

**Issue:** Both the clean-restore and merge confirmation dialogs omit `restoreFocusRef`. Any cancel, Back, Escape, or close action therefore reaches the shared `BottomSheet` fallback and requests accessibility focus for node `0` rather than the action that opened the dialog. These are the two most consequential recovery actions in the app, so the missing focus target makes the native accessibility flow unreliable precisely where the confirmation contract is meant to be strongest.

**Fix:** Store refs for the Restore backup and Merge backup triggers and pass the applicable ref as `restoreFocusRef` to each dialog. Add route-level tests covering cancellation via the shared sheet and verifying focus returns to the initiating recovery action.

## Info

### IN-01: Dead legacy automatic-backup and recovery UI remains embedded in the manual-backup route

**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/more/data-and-recovery.tsx:296-314`

**Issue:** Two literal `false ? … : null` branches retain obsolete Google Drive and recovery navigation UI, including obsolete command paths. The code can never render, but it leaves contradictory backup ownership behavior in the production route and makes future maintenance/error review less reliable.

**Fix:** Delete the unreachable blocks and then remove any imports and runtime fields that become unused. Keep automatic-backup administration only in its dedicated route.

---

_Reviewed: 2026-10-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
