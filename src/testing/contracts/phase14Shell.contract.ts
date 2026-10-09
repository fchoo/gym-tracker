export const PHASE14_SHELL_EVIDENCE_DIRECTORY = ".planning/phases/14-prototype-visual-shell/evidence";

const REVISION18_SOURCE = {
  revision: 18,
  approvedJsonSha256: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf",
  approvedHtmlSha256: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96",
} as const;

const authoritative = (
  referenceId: string,
  filesByRenderedTheme: Readonly<Record<string, { file: string; sha256: string }>>,
) => ({
  kind: "revision18-png" as const,
  source: REVISION18_SOURCE,
  referenceId,
  exactConfiguration: { width: 390, height: 844, orientation: "portrait", fontScale: 1 },
  filesByRenderedTheme,
});

const nativeOnly = (rationale: string) => ({
  kind: "native-only" as const,
  verdict: "N_A_REVIEWED" as const,
  rationale,
});

export const PHASE14_SHELL_EVIDENCE_CASES = [
  {
    id: "shell.four-roots", requirement: "SHL-01", stage: "phase14-four-roots", flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.four-roots.json`,
    state: { id: "four-roots", fixture: "phase14-deterministic-shell", entry: "Workout" },
    actions: ["dpad-down", "enter", "space"], checkpoints: ["Workout", "Calendar", "Library", "Progress"],
    postconditions: ["one-bottom-navigation", "root-switches-in-place", "required-actions-reachable"],
    componentTests: ["app/(tabs)/__tests__/_layout.test.tsx", "app/(tabs)/__tests__/root-shell.integration.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: authoritative("revision18-full-shell-workout", {
      dark: { file: "full-shell-workout.png", sha256: "6f8cb788265a6531a73f915f776d870696c7a5c097fb3fad12fd9d925819e929" },
    }),
  },
  {
    id: "shell.root-state", requirement: "SHL-02", stage: "phase14-root-state", flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.root-state.json`,
    state: { id: "root-state", fixture: "phase14-deterministic-shell", entry: "Workout" },
    actions: ["back"], checkpoints: ["Workout", "Library", "Workout"],
    postconditions: ["root-state-restored", "focus-restored"],
    componentTests: ["src/ui/shell/AppRootShell.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Root history and focus restoration are native navigation behavior, not a distinct immutable Revision 18 bitmap state."),
  },
  {
    id: "shell.appearance", requirement: "SHL-03", stage: "phase14-appearance", flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.appearance.json`,
    state: { id: "appearance", fixture: "phase14-deterministic-shell", entry: "App Settings" },
    actions: ["dpad-down", "enter"], checkpoints: ["App Settings", "Appearance", "selected-theme"],
    postconditions: ["explicit-selection-observed", "rendered-theme-matches", "all-roots-recolor"],
    componentTests: ["src/ui/__tests__/foundation.test.tsx", "src/ui/__tests__/SettingsScreen.test.tsx"],
    runtimeStatePolicy: "preference-write-reviewed", motionSensitive: false,
    referencePolicy: authoritative("revision18-appearance", {
      light: { file: "approved-hybrid-v2-light-mobile.png", sha256: "679320a09ecf78d0c0e976bdc5bdc8daa4410ce39ba305d18c831e8cdb45f9e1" },
      dark: { file: "approved-hybrid-v2-dark-mobile.png", sha256: "d0261044fc7eb207d6ddd0b74d45aa5c9be29270edf9227559a8c35014f5effc" },
    }),
  },
  {
    id: "shell.tokens", requirement: "SHL-04", stage: "phase14-tokens", flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.tokens.json`,
    state: { id: "tokens", fixture: "phase14-deterministic-shell", entry: "Workout" },
    actions: ["dpad-down", "space"], checkpoints: ["Workout", "shared-token-surface"],
    postconditions: ["token-source-bound", "minimum-targets", "focus-ring-3dp"],
    componentTests: ["src/ui/__tests__/foundation.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: authoritative("revision18-root-tokens", {
      dark: { file: "approved-hybrid-root-mobile.png", sha256: "bdf39ea37d2ab2f934e5c484693578778726ba6ba2b20ced238b601a5f332b0c" },
      light: { file: "approved-hybrid-v2-light-mobile.png", sha256: "679320a09ecf78d0c0e976bdc5bdc8daa4410ce39ba305d18c831e8cdb45f9e1" },
    }),
  },
  {
    id: "shell.sheets", requirement: "SHL-05", stage: "phase14-sheets", flow: "accessibility",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.sheets.json`,
    state: { id: "sheets", fixture: "phase14-deterministic-shell", entry: "Appearance sheet" },
    actions: ["dpad-down", "enter", "space", "escape", "scrim", "back"], checkpoints: ["sheet-heading-focused", "background-inert"],
    postconditions: ["dismissal-observed", "trigger-focus-restored", "ime-cleared"],
    componentTests: ["src/ui/components/BottomSheet.test.tsx", "src/ui/components/ConfirmationDialog.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: true,
    referencePolicy: nativeOnly("Shared sheet dismissal, focus, scrim, and IME behavior requires native semantics; no immutable Revision 18 sheet bitmap is authoritative."),
  },
  {
    id: "shell.toasts", requirement: "SHL-06", stage: "phase14-toasts", flow: "accessibility",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.toasts.json`,
    state: { id: "toasts", fixture: "phase14-toast-proof", entry: "Toast proof" },
    actions: ["dpad-down"], checkpoints: ["semantic-toast", "background-control"],
    postconditions: ["toast-below-top-bar", "background-not-blocked", "status-semantic"],
    componentTests: ["src/ui/components/SemanticToast.test.tsx", "app/__tests__/phase14-toast-proof.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: true,
    referencePolicy: authoritative("revision18-top-toast", {
      dark: { file: "approved-hybrid-v5-top-toast-mobile.png", sha256: "e375fdf44266771940f121065f8af035f476033beae8405171b0d61854eb462e" },
    }),
  },
  {
    id: "shell.launch", requirement: "SHL-07", stage: "phase14-launch", flow: "accessibility",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.launch.json`,
    state: { id: "launch", fixture: "phase14-deterministic-shell", entry: "Cold launch" },
    actions: ["back"], checkpoints: ["factual-loading", "Workout"], postconditions: ["no-fabricated-content", "root-ready"],
    componentTests: ["app/__tests__/root-layout.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: true,
    referencePolicy: nativeOnly("Startup and permission recovery are native-only lifecycle states; N_A_REVIEWED prevents a fabricated prototype baseline."),
  },
  {
    id: "shell.rest-alerts", requirement: "SHL-08", stage: "phase14-rest-alerts", flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.rest-alerts.json`,
    state: { id: "rest-alerts", fixture: "phase14-deterministic-shell", entry: "App Settings" },
    actions: ["dpad-down", "enter", "back"], checkpoints: ["Rest alerts", "App Settings"], postconditions: ["device-cue-settings-reachable", "focus-restored"],
    componentTests: ["src/ui/__tests__/RestAlertSettingsSheet.test.tsx", "src/ui/__tests__/SettingsScreen.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Rest-alert settings preserve native device capability and are not represented by an authoritative Revision 18 bitmap."),
  },
  {
    id: "shell.settings-deep-links", requirement: "SHL-09", stage: "phase14-settings-deep-links", flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.settings-deep-links.json`,
    state: { id: "settings-deep-links", fixture: "phase14-deterministic-shell", entry: "Data and recovery" },
    actions: ["back", "escape"], checkpoints: ["Data and recovery", "Workout"], postconditions: ["no-write-navigation", "origin-restored"],
    componentTests: ["app/more/__tests__/index.test.tsx", "app/more/__tests__/data-and-recovery.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Deep-link Back/Escape recovery is native navigation behavior without an immutable Revision 18 bitmap."),
  },
  {
    id: "shell.removed-sessions", requirement: "SHL-10", stage: "phase14-removed-sessions", flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.removed-sessions.json`,
    state: { id: "removed-sessions", fixture: "phase14-deterministic-shell", entry: "Removed sessions" },
    actions: ["back"], checkpoints: ["Removed sessions", "App Settings"], postconditions: ["read-only-navigation", "no-source-write"],
    componentTests: ["app/more/__tests__/removed-sessions.test.tsx", "src/ui/__tests__/RemovedSessionsScreen.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Removed-session recovery is source-authoritative native functionality not depicted by Revision 18."),
  },
  {
    id: "shell.data-recovery", requirement: "SHL-11", stage: "phase14-data-recovery", flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.data-recovery.json`,
    state: { id: "data-recovery", fixture: "phase14-deterministic-shell", entry: "Manual encrypted backup" },
    actions: ["ime-clearance", "back"], checkpoints: ["Manual encrypted backup", "No backup was selected"], postconditions: ["ime-cleared", "cancel-does-not-write"],
    componentTests: ["app/more/__tests__/data-and-recovery.test.tsx", "app/more/__tests__/manual-encrypted-backup.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Backup cancellation and recovery are native-only source-integrity states; N_A_REVIEWED prevents a fake visual baseline."),
  },
  {
    id: "shell.automatic-backup", requirement: "SHL-12", stage: "phase14-automatic-backup", flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.automatic-backup.json`,
    state: { id: "automatic-backup", fixture: "phase14-deterministic-shell", entry: "Automatic backup settings" },
    actions: ["back", "escape"], checkpoints: ["Automatic backup settings", "Data and recovery"], postconditions: ["no-cloud-write", "origin-restored"],
    componentTests: ["app/more/__tests__/automatic-backup-settings.test.tsx", "app/more/__tests__/drive-backup-privacy.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Automatic-backup navigation and recovery are native-only provider states; N_A_REVIEWED prevents a fake baseline."),
  },
  {
    id: "shell.manual-backup", requirement: "SHL-13", stage: "phase14-manual-backup", flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.manual-backup.json`,
    state: { id: "manual-backup", fixture: "phase14-deterministic-shell", entry: "Manual encrypted backup" },
    actions: ["back", "scrim"], checkpoints: ["Manual encrypted backup", "Data and recovery"], postconditions: ["cancel-does-not-write", "origin-restored"],
    componentTests: ["app/more/__tests__/manual-encrypted-backup.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Manual-backup recovery is native-only source-integrity behavior; N_A_REVIEWED prevents a fake baseline."),
  },
] as const;

export const PHASE14_SHELL_CASE_IDS = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
