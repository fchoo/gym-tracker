export const PHASE14_SHELL_EVIDENCE_DIRECTORY = ".planning/phases/14-prototype-visual-shell/evidence";

const APP_PACKAGE = "com.fchoo.gymtracker.devtest";
const poll = { timeoutMs: 6_000, intervalMs: 200 } as const;

type NodePredicate = Readonly<{
  label?: string;
  resourceIdEndsWith?: string;
  focused?: boolean;
  selected?: boolean;
  checked?: boolean;
  enabled?: boolean;
}>;

function predicate(input: Readonly<{
  visible?: readonly string[];
  absent?: readonly string[];
  nodes?: readonly NodePredicate[];
  focus?: Readonly<{ equals?: string; allowNull: boolean }>;
  packageForeground?: boolean;
  semanticRequired?: boolean;
  imeVisible?: boolean;
}>) {
  return {
    package: APP_PACKAGE,
    packageForeground: input.packageForeground ?? true,
    semanticRequired: input.semanticRequired ?? true,
    visible: input.visible ?? [],
    absent: input.absent ?? [],
    nodes: input.nodes ?? [],
    focus: input.focus ?? { allowNull: true },
    ...(input.imeVisible === undefined ? {} : { imeVisible: input.imeVisible }),
    rejectLauncher: true,
  } as const;
}

function action(input: Readonly<{
  id: string;
  stage: string;
  input: string;
  transport: "adb-keyevent" | "adb-coordinate" | "adb-launch";
  command: Readonly<Record<string, string | number>>;
  pre: ReturnType<typeof predicate>;
  post: ReturnType<typeof predicate>;
  focusTarget?: string;
  focusKeyCodes?: readonly number[];
}>) {
  return {
    id: input.id,
    input: input.input,
    transport: input.transport,
    command: input.command,
    preparation: { stage: input.stage, action: input.id },
    ...(input.focusTarget === undefined ? {} : {
      focusAcquisition: {
        strategy: "key-sequence-until",
        keyCodes: input.focusKeyCodes ?? [61],
        target: input.focusTarget,
        maxAttempts: 24,
      },
    }),
    pre: input.pre,
    post: input.post,
    poll,
  } as const;
}

const REVISION18_SOURCE = {
  revision: 18,
  approvedJsonSha256: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf",
  approvedHtmlSha256: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96",
} as const;

const workoutRootReference = {
  kind: "revision18-png" as const,
  source: REVISION18_SOURCE,
  referenceId: "revision18-state-clean-workout-root",
  captureState: "workout-root",
  exactConfiguration: { width: 390, height: 844, orientation: "portrait", fontScale: 1 },
  filesByRenderedTheme: {
    light: { file: ".planning/design/v1.2-browser-evidence/light-workout-root.png", sha256: "513173987c6b29d370f5428e3226608a795d48cdf5a9c258a8624dd2bed0ad2d" },
    dark: { file: ".planning/design/v1.2-browser-evidence/dark-workout-root.png", sha256: "ffd8cf979d3ba679cc744e58a91d30d7bd34cda055fc0bff5ae8c09d886de301" },
  },
} as const;

const nativeOnly = (rationale: string) => ({
  kind: "native-only" as const,
  verdict: "N_A_REVIEWED" as const,
  rationale,
});

const fourRootsStage = "phase14-four-roots";
const rootStateStage = "phase14-root-state";
const appearanceStage = "phase14-appearance";
const sheetsStage = "phase14-sheets";
const toastStage = "phase14-toasts";
const launchStage = "phase14-launch";
const restAlertsStage = "phase14-rest-alerts";
const settingsDeepLinksStage = "phase14-settings-deep-links";
const removedSessionsStage = "phase14-removed-sessions";
const dataRecoveryStage = "phase14-data-recovery";
const automaticBackupStage = "phase14-automatic-backup";
const manualBackupStage = "phase14-manual-backup";

export const PHASE14_SHELL_EVIDENCE_CASES = [
  {
    id: "shell.four-roots", requirement: "SHL-01", stage: fourRootsStage, flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.four-roots.json`,
    state: { id: "four-roots", dataPolicy: "installed-user-data-preserved", captureState: "workout-root", capture: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { allowNull: true } }) },
    actions: [
      action({ id: "root-dpad-workout-to-calendar", stage: fourRootsStage, input: "DPAD_RIGHT", transport: "adb-keyevent", command: { keyCode: 22 }, focusTarget: "Workout", focusKeyCodes: [61, 61, 20, 21], pre: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true, focused: true }], focus: { equals: "Workout", allowNull: false } }), post: predicate({ nodes: [{ label: "Workout", selected: true }, { label: "Calendar", selected: false, focused: true }], focus: { equals: "Calendar", allowNull: false } }) }),
      action({ id: "root-enter-calendar", stage: fourRootsStage, input: "ENTER", transport: "adb-keyevent", command: { keyCode: 66 }, focusTarget: "Calendar", focusKeyCodes: [61, 61, 20], pre: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }, { label: "Calendar", selected: false, focused: true }], focus: { equals: "Calendar", allowNull: false } }), post: predicate({ visible: ["Calendar", "Calendar month grid"], nodes: [{ label: "Calendar", selected: true }], focus: { equals: "Calendar", allowNull: false } }) }),
      action({ id: "root-space-library", stage: fourRootsStage, input: "SPACE", transport: "adb-keyevent", command: { keyCode: 62 }, focusTarget: "Library", focusKeyCodes: [61, 61, 20, 22], pre: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }, { label: "Library", selected: false, focused: true }], focus: { equals: "Library", allowNull: false } }), post: predicate({ visible: ["Library", "Library section"], nodes: [{ label: "Library", selected: true }], focus: { equals: "Library", allowNull: false } }) }),
    ],
    checkpoints: ["Workout", "Calendar", "Library", "Progress"],
    postconditions: ["one-bottom-navigation", "root-switches-in-place", "required-actions-reachable"],
    componentTests: ["app/(tabs)/__tests__/_layout.test.tsx", "app/(tabs)/__tests__/root-shell.integration.test.tsx"],
    runtimeStatePolicy: "no-write", motionSensitive: false, referencePolicy: workoutRootReference,
  },
  {
    id: "shell.root-state", requirement: "SHL-02", stage: rootStateStage, flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.root-state.json`,
    state: { id: "root-state", dataPolicy: "installed-user-data-preserved", captureState: "workout-root-after-library-back", capture: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { allowNull: true } }) },
    actions: [action({ id: "back-from-library", stage: rootStateStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, focusTarget: "Library", pre: predicate({ visible: ["Library", "Library section"], nodes: [{ label: "Library", selected: true }], focus: { equals: "Library", allowNull: false } }), post: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { equals: "Workout", allowNull: false } }) })],
    checkpoints: ["Workout", "Library", "Workout"], postconditions: ["root-state-restored", "focus-restored"],
    componentTests: ["src/ui/shell/AppRootShell.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Back-stack and focus restoration are native navigation behavior, not an immutable prototype bitmap."),
  },
  {
    id: "shell.appearance", requirement: "SHL-03", stage: appearanceStage, flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.appearance.json`,
    state: { id: "appearance", dataPolicy: "installed-user-data-preserved", captureState: "progress-after-all-roots-theme-journey", capture: predicate({ visible: ["Progress"], nodes: [{ label: "Progress", selected: true }], focus: { allowNull: true } }) },
    actions: [action({ id: "appearance-dpad-system-to-light", stage: appearanceStage, input: "DPAD_DOWN", transport: "adb-keyevent", command: { keyCode: 20 }, focusTarget: "System", pre: predicate({ visible: ["App Settings", "Appearance"], nodes: [{ label: "System", focused: true }], focus: { equals: "System", allowNull: false } }), post: predicate({ visible: ["App Settings", "Appearance"], nodes: [{ label: "Light", focused: true }], focus: { equals: "Light", allowNull: false } }) })],
    checkpoints: ["App Settings", "Appearance", "selected-theme"], postconditions: ["explicit-selection-observed", "rendered-theme-matches", "all-roots-recolor"],
    componentTests: ["src/ui/__tests__/foundation.test.tsx", "src/ui/__tests__/SettingsScreen.test.tsx"],
    runtimeStatePolicy: "preference-write-reviewed", motionSensitive: false,
    referencePolicy: nativeOnly("The appearance journey ends on non-Workout roots; only state-clean Workout-root captures use the pinned visual references."),
  },
  {
    id: "shell.tokens", requirement: "SHL-04", stage: "phase14-tokens", flow: "shell",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.tokens.json`,
    state: { id: "tokens", dataPolicy: "installed-user-data-preserved", captureState: "shared-token-workout-root", capture: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { allowNull: true } }) }, actions: [],
    checkpoints: ["Workout", "shared-token-surface"], postconditions: ["token-source-bound", "minimum-targets", "focus-ring-3dp"],
    componentTests: ["src/ui/__tests__/foundation.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Token evidence is numeric and semantic; visual comparison is owned by the state-clean Workout-root shell captures."),
  },
  {
    id: "shell.sheets", requirement: "SHL-05", stage: sheetsStage, flow: "accessibility",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.sheets.json`,
    state: { id: "sheets", dataPolicy: "installed-user-data-preserved", captureState: "app-settings-sheet", capture: predicate({ visible: ["App Settings", "Appearance"], nodes: [{ resourceIdEndsWith: "bottom-sheet-frame" }], focus: { allowNull: true } }) },
    actions: [
      action({ id: "sheet-dpad-heading-to-system", stage: sheetsStage, input: "DPAD_DOWN", transport: "adb-keyevent", command: { keyCode: 20 }, focusTarget: "App Settings", pre: predicate({ visible: ["App Settings", "Appearance"], nodes: [{ label: "App Settings", focused: true }, { resourceIdEndsWith: "bottom-sheet-frame" }], focus: { equals: "App Settings", allowNull: false } }), post: predicate({ visible: ["App Settings"], nodes: [{ label: "System", focused: true }], focus: { equals: "System", allowNull: false } }) }),
      action({ id: "sheet-escape", stage: sheetsStage, input: "ESCAPE", transport: "adb-keyevent", command: { keyCode: 111 }, focusTarget: "App Settings", pre: predicate({ visible: ["App Settings"], nodes: [{ resourceIdEndsWith: "bottom-sheet-frame" }], focus: { equals: "App Settings", allowNull: false } }), post: predicate({ absent: ["App Settings"], visible: ["Library"], nodes: [{ label: "Library", selected: true }, { label: "Open App Settings", focused: true }], focus: { equals: "Open App Settings", allowNull: false } }) }),
      action({ id: "sheet-back", stage: sheetsStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, focusTarget: "App Settings", pre: predicate({ visible: ["App Settings"], nodes: [{ resourceIdEndsWith: "bottom-sheet-frame" }], focus: { equals: "App Settings", allowNull: false } }), post: predicate({ absent: ["App Settings"], visible: ["Library"], nodes: [{ label: "Library", selected: true }, { label: "Open App Settings", focused: true }], focus: { equals: "Open App Settings", allowNull: false } }) }),
      action({ id: "sheet-scrim", stage: sheetsStage, input: "SCRIM", transport: "adb-coordinate", command: { target: "outside-sheet" }, focusTarget: "App Settings", pre: predicate({ visible: ["App Settings"], nodes: [{ resourceIdEndsWith: "bottom-sheet-frame" }], focus: { equals: "App Settings", allowNull: false } }), post: predicate({ absent: ["App Settings"], visible: ["Library"], nodes: [{ label: "Library", selected: true }, { label: "Open App Settings", focused: true }], focus: { equals: "Open App Settings", allowNull: false } }) }),
    ],
    checkpoints: ["sheet-heading-focused", "background-inert"], postconditions: ["dismissal-observed", "trigger-focus-restored"],
    componentTests: ["src/ui/components/BottomSheet.test.tsx", "src/ui/components/ConfirmationDialog.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: true,
    referencePolicy: nativeOnly("Sheet semantics, focus, scrim and dismissal have no exact immutable Workout-root reference."),
  },
  {
    id: "shell.toasts", requirement: "SHL-06", stage: toastStage, flow: "accessibility",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.toasts.json`,
    state: { id: "toasts", dataPolicy: "development-test-proof-route", captureState: "toast-background-idle", capture: predicate({ visible: ["Toast host mounted", "Background control idle", "Toast proof active"], absent: ["Background control activated"], focus: { allowNull: true } }) },
    actions: [action({ id: "toast-background-enter", stage: toastStage, input: "ENTER", transport: "adb-keyevent", command: { keyCode: 66 }, focusTarget: "Tap background control", pre: predicate({ visible: ["Toast host mounted", "Background control idle", "Toast proof active"], absent: ["Background control activated"], nodes: [{ label: "Tap background control", focused: true, enabled: true }], focus: { equals: "Tap background control", allowNull: false } }), post: predicate({ visible: ["Toast host mounted", "Background control activated", "Toast proof active"], absent: ["Background control idle"], focus: { equals: "Tap background control", allowNull: false } }) })],
    checkpoints: ["semantic-toast", "background-control-idle"], postconditions: ["toast-below-top-bar", "background-activation-observed", "status-semantic"],
    componentTests: ["src/ui/components/SemanticToast.test.tsx", "app/__tests__/phase14-toast-proof.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: true,
    referencePolicy: nativeOnly("The toast proof route is not the Workout-root reference state."),
  },
  {
    id: "shell.launch", requirement: "SHL-07", stage: launchStage, flow: "accessibility",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.launch.json`,
    state: { id: "launch", dataPolicy: "installed-user-data-preserved", captureState: "workout-root-after-launch", capture: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { allowNull: true } }) },
    actions: [action({ id: "cold-launch-to-workout", stage: launchStage, input: "LAUNCH", transport: "adb-launch", command: { intent: "launcher" }, pre: predicate({ packageForeground: false, semanticRequired: false, focus: { allowNull: true } }), post: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { allowNull: true } }) })],
    checkpoints: ["package-stopped", "factual-loading", "Workout"], postconditions: ["real-launch-transition", "no-fabricated-content", "root-ready"],
    componentTests: ["app/__tests__/root-layout.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: true,
    referencePolicy: nativeOnly("Startup and permission recovery are lifecycle states, not a static visual reference."),
  },
  {
    id: "shell.rest-alerts", requirement: "SHL-08", stage: restAlertsStage, flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.rest-alerts.json`,
    state: { id: "rest-alerts", dataPolicy: "installed-user-data-preserved", captureState: "app-settings-rest-alerts", capture: predicate({ visible: ["App Settings", "Rest alerts"], nodes: [{ resourceIdEndsWith: "bottom-sheet-frame" }], focus: { allowNull: true } }) },
    actions: [action({ id: "back-from-rest-alerts-sheet", stage: restAlertsStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, focusTarget: "App Settings", pre: predicate({ visible: ["App Settings", "Rest alerts"], nodes: [{ resourceIdEndsWith: "bottom-sheet-frame" }], focus: { equals: "App Settings", allowNull: false } }), post: predicate({ absent: ["App Settings"], visible: ["Workout"], nodes: [{ label: "Workout", selected: true }, { label: "Open App Settings", focused: true }], focus: { equals: "Open App Settings", allowNull: false } }) })],
    checkpoints: ["Rest alerts", "App Settings"], postconditions: ["device-cue-settings-reachable", "focus-restored"],
    componentTests: ["src/ui/__tests__/RestAlertSettingsSheet.test.tsx", "src/ui/__tests__/SettingsScreen.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Rest-alert settings are native device capabilities outside the Workout-root reference."),
  },
  {
    id: "shell.settings-deep-links", requirement: "SHL-09", stage: settingsDeepLinksStage, flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.settings-deep-links.json`,
    state: { id: "settings-deep-links", dataPolicy: "installed-user-data-preserved", captureState: "workout-after-data-recovery-back", capture: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { allowNull: true } }) },
    actions: [action({ id: "back-from-data-recovery", stage: settingsDeepLinksStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, pre: predicate({ visible: ["Manual encrypted backup"], focus: { allowNull: true } }), post: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { equals: "Workout", allowNull: false } }) })],
    checkpoints: ["Data and recovery", "Workout"], postconditions: ["no-write-navigation", "origin-restored"],
    componentTests: ["app/more/__tests__/index.test.tsx", "app/more/__tests__/data-and-recovery.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Deep-link Back recovery is native navigation without a matching prototype bitmap."),
  },
  {
    id: "shell.removed-sessions", requirement: "SHL-10", stage: removedSessionsStage, flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.removed-sessions.json`,
    state: { id: "removed-sessions", dataPolicy: "installed-user-data-preserved", captureState: "removed-sessions-route", capture: predicate({ visible: ["Removed sessions"], focus: { allowNull: true } }) },
    actions: [action({ id: "back-from-removed-sessions", stage: removedSessionsStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, focusTarget: "Removed sessions", pre: predicate({ visible: ["Removed sessions"], focus: { equals: "Removed sessions", allowNull: false } }), post: predicate({ visible: ["Workout"], nodes: [{ label: "Workout", selected: true }], focus: { equals: "Workout", allowNull: false } }) })],
    checkpoints: ["Removed sessions", "Workout"], postconditions: ["read-only-navigation", "no-source-write"],
    componentTests: ["app/more/__tests__/removed-sessions.test.tsx", "src/ui/__tests__/RemovedSessionsScreen.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Removed-session recovery is not depicted by the Workout-root reference."),
  },
  {
    id: "shell.data-recovery", requirement: "SHL-11", stage: dataRecoveryStage, flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.data-recovery.json`,
    state: { id: "data-recovery", dataPolicy: "installed-user-data-preserved", captureState: "manual-backup-no-selection", capture: predicate({ visible: ["Restore clean", "No backup was selected"], focus: { allowNull: true } }) },
    actions: [action({ id: "ime-clearance-restore-field", stage: dataRecoveryStage, input: "IME_CLEARANCE", transport: "adb-keyevent", command: { keyCode: 4 }, pre: predicate({ visible: ["Restore clean", "Restore password"], focus: { equals: "Restore password", allowNull: false }, imeVisible: true }), post: predicate({ visible: ["Restore clean", "Restore password"], focus: { equals: "Restore password", allowNull: false }, imeVisible: false }) })],
    checkpoints: ["Manual encrypted backup", "Restore password"], postconditions: ["ime-cleared", "cancel-does-not-write"],
    componentTests: ["app/more/__tests__/data-and-recovery.test.tsx", "app/more/__tests__/manual-encrypted-backup.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Backup and IME recovery are native-only source-integrity states."),
  },
  {
    id: "shell.automatic-backup", requirement: "SHL-12", stage: automaticBackupStage, flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.automatic-backup.json`,
    state: { id: "automatic-backup", dataPolicy: "installed-user-data-preserved", captureState: "automatic-backup-route", capture: predicate({ visible: ["Automatic backup settings"], focus: { allowNull: true } }) },
    actions: [action({ id: "back-from-automatic-backup", stage: automaticBackupStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, focusTarget: "Automatic backup settings", pre: predicate({ visible: ["Automatic backup settings"], focus: { equals: "Automatic backup settings", allowNull: false } }), post: predicate({ visible: ["Data and recovery"], focus: { equals: "Data and recovery", allowNull: false } }) })],
    checkpoints: ["Automatic backup settings", "Data and recovery"], postconditions: ["no-cloud-write", "origin-restored"],
    componentTests: ["app/more/__tests__/automatic-backup-settings.test.tsx", "app/more/__tests__/drive-backup-privacy.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Automatic-backup navigation has no matching Workout-root reference."),
  },
  {
    id: "shell.manual-backup", requirement: "SHL-13", stage: manualBackupStage, flow: "settings-recovery",
    evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.manual-backup.json`,
    state: { id: "manual-backup", dataPolicy: "installed-user-data-preserved", captureState: "manual-backup-route", capture: predicate({ visible: ["Manual encrypted backup"], focus: { allowNull: true } }) },
    actions: [action({ id: "back-from-manual-backup", stage: manualBackupStage, input: "BACK", transport: "adb-keyevent", command: { keyCode: 4 }, focusTarget: "Manual encrypted backup", pre: predicate({ visible: ["Manual encrypted backup"], focus: { equals: "Manual encrypted backup", allowNull: false } }), post: predicate({ visible: ["Data and recovery"], focus: { equals: "Data and recovery", allowNull: false } }) })],
    checkpoints: ["Manual encrypted backup", "Data and recovery"], postconditions: ["cancel-does-not-write", "origin-restored"],
    componentTests: ["app/more/__tests__/manual-encrypted-backup.test.tsx"], runtimeStatePolicy: "no-write", motionSensitive: false,
    referencePolicy: nativeOnly("Manual-backup recovery has no matching Workout-root reference."),
  },
] as const;

export const PHASE14_SHELL_CASE_IDS = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
