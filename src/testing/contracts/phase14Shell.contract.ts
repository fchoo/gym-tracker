export const PHASE14_SHELL_EVIDENCE_DIRECTORY = ".planning/phases/14-prototype-visual-shell/evidence";

export const PHASE14_SHELL_EVIDENCE_CASES = [
  { id: "shell.four-roots", requirement: "SHL-01", stage: "phase14-four-roots", flow: "shell", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.four-roots.json` },
  { id: "shell.root-state", requirement: "SHL-02", stage: "phase14-root-state", flow: "shell", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.root-state.json` },
  { id: "shell.appearance", requirement: "SHL-03", stage: "phase14-appearance", flow: "shell", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.appearance.json` },
  { id: "shell.tokens", requirement: "SHL-04", stage: "phase14-tokens", flow: "shell", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.tokens.json` },
  { id: "shell.sheets", requirement: "SHL-05", stage: "phase14-sheets", flow: "accessibility", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.sheets.json` },
  { id: "shell.toasts", requirement: "SHL-06", stage: "phase14-toasts", flow: "accessibility", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.toasts.json` },
  { id: "shell.launch", requirement: "SHL-07", stage: "phase14-launch", flow: "accessibility", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.launch.json` },
  { id: "shell.rest-alerts", requirement: "SHL-08", stage: "phase14-rest-alerts", flow: "settings-recovery", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.rest-alerts.json` },
  { id: "shell.settings-deep-links", requirement: "SHL-09", stage: "phase14-settings-deep-links", flow: "settings-recovery", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.settings-deep-links.json` },
  { id: "shell.removed-sessions", requirement: "SHL-10", stage: "phase14-removed-sessions", flow: "settings-recovery", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.removed-sessions.json` },
  { id: "shell.data-recovery", requirement: "SHL-11", stage: "phase14-data-recovery", flow: "settings-recovery", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.data-recovery.json` },
  { id: "shell.automatic-backup", requirement: "SHL-12", stage: "phase14-automatic-backup", flow: "settings-recovery", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.automatic-backup.json` },
  { id: "shell.manual-backup", requirement: "SHL-13", stage: "phase14-manual-backup", flow: "settings-recovery", evidencePath: `${PHASE14_SHELL_EVIDENCE_DIRECTORY}/shell.manual-backup.json` },
] as const;

export const PHASE14_SHELL_CASE_IDS = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
