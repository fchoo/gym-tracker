const shell = (id, actionIds, postconditionIds) => Object.freeze({
  id,
  action_ids: Object.freeze(actionIds),
  postcondition_ids: Object.freeze(postconditionIds),
});

/** Generated executable projection of PHASE14_SHELL_EVIDENCE_CASES.
 * v12-accessibility-shard.test.mjs checks this projection field-for-field
 * against the TypeScript authority without loading TypeScript in production. */
export const V12_SHELL_REQUIREMENT_REGISTRY = Object.freeze({
  "SHL-01": shell("shell.four-roots", ["root-dpad-workout-to-calendar", "root-enter-calendar", "root-space-library"], ["one-bottom-navigation", "root-switches-in-place", "required-actions-reachable"]),
  "SHL-02": shell("shell.root-state", ["back-from-library"], ["root-state-restored", "focus-restored"]),
  "SHL-03": shell("shell.appearance", ["appearance-dpad-system-to-light"], ["explicit-selection-observed", "rendered-theme-matches", "all-roots-recolor"]),
  "SHL-04": shell("shell.tokens", [], ["token-source-bound", "minimum-targets", "focus-ring-3dp"]),
  "SHL-05": shell("shell.sheets", ["sheet-dpad-heading-to-system", "sheet-escape", "sheet-back", "sheet-scrim"], ["dismissal-observed", "trigger-focus-restored"]),
  "SHL-06": shell("shell.toasts", ["toast-background-enter"], ["toast-below-top-bar", "background-activation-observed", "status-semantic"]),
  "SHL-07": shell("shell.launch", ["cold-launch-to-workout"], ["real-launch-transition", "no-fabricated-content", "root-ready"]),
  "SHL-08": shell("shell.rest-alerts", ["back-from-rest-alerts-sheet"], ["device-cue-settings-reachable", "focus-restored"]),
  "SHL-09": shell("shell.settings-deep-links", ["back-from-data-recovery"], ["no-write-navigation", "origin-restored"]),
  "SHL-10": shell("shell.removed-sessions", ["back-from-removed-sessions"], ["read-only-navigation", "no-source-write"]),
  "SHL-11": shell("shell.data-recovery", ["ime-clearance-restore-field"], ["ime-cleared", "cancel-does-not-write"]),
  "SHL-12": shell("shell.automatic-backup", ["back-from-automatic-backup"], ["no-cloud-write", "origin-restored"]),
  "SHL-13": shell("shell.manual-backup", ["back-from-manual-backup"], ["cancel-does-not-write", "origin-restored"]),
});
