/** Normalize only the two exact Android CLI status forms. Unknown output never authorizes a radio state. */
export function normalizeV12AirplaneModeStatus(value) {
  switch (value) {
    case "enabled":
    case "Airplane mode is enabled": return "Airplane mode is enabled";
    case "disabled":
    case "Airplane mode is disabled": return "Airplane mode is disabled";
    default: return undefined;
  }
}
