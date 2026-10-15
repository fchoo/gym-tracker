import { PHASE20_VISUAL_STATE_REGISTRY, type Phase20VisualState } from "./phase20VisualStateRegistry.generated";

export const PHASE20_VISUAL_FIXTURE_ID = "v12-synthetic-fixtures-r18";
export const PHASE20_VISUAL_CONFIGURATIONS = [
  "AP-L-C360-P-F100", "AP-L-C360-P-F200", "AP-L-C360-L-F100", "AP-L-C360-L-F200",
  "AP-L-C390-P-F100", "AP-L-C390-P-F200", "AP-L-C390-L-F100", "AP-L-C390-L-F200",
  "AP-L-M600-P-F100", "AP-L-M600-P-F200", "AP-L-M600-L-F100", "AP-L-M600-L-F200",
  "AP-L-X840-P-F100", "AP-L-X840-P-F200", "AP-L-X840-L-F100", "AP-L-X840-L-F200",
  "AP-D-C360-P-F100", "AP-D-C360-P-F200", "AP-D-C360-L-F100", "AP-D-C360-L-F200",
  "AP-D-C390-P-F100", "AP-D-C390-P-F200", "AP-D-C390-L-F100", "AP-D-C390-L-F200",
  "AP-D-M600-P-F100", "AP-D-M600-P-F200", "AP-D-M600-L-F100", "AP-D-M600-L-F200",
  "AP-D-X840-P-F100", "AP-D-X840-P-F200", "AP-D-X840-L-F100", "AP-D-X840-L-F200",
  "AP-SL-C360-P-F100", "AP-SL-C360-P-F200", "AP-SL-C360-L-F100", "AP-SL-C360-L-F200",
  "AP-SL-C390-P-F100", "AP-SL-C390-P-F200", "AP-SL-C390-L-F100", "AP-SL-C390-L-F200",
  "AP-SL-M600-P-F100", "AP-SL-M600-P-F200", "AP-SL-M600-L-F100", "AP-SL-M600-L-F200",
  "AP-SL-X840-P-F100", "AP-SL-X840-P-F200", "AP-SL-X840-L-F100", "AP-SL-X840-L-F200",
  "AP-SD-C360-P-F100", "AP-SD-C360-P-F200", "AP-SD-C360-L-F100", "AP-SD-C360-L-F200",
  "AP-SD-C390-P-F100", "AP-SD-C390-P-F200", "AP-SD-C390-L-F100", "AP-SD-C390-L-F200",
  "AP-SD-M600-P-F100", "AP-SD-M600-P-F200", "AP-SD-M600-L-F100", "AP-SD-M600-L-F200",
  "AP-SD-X840-P-F100", "AP-SD-X840-P-F200", "AP-SD-X840-L-F100", "AP-SD-X840-L-F200",
] as const;
export type Phase20VisualConfiguration = (typeof PHASE20_VISUAL_CONFIGURATIONS)[number];
export type Phase20VisualStateId = Phase20VisualState["id"];

const byId = new Map(PHASE20_VISUAL_STATE_REGISTRY.map((state) => [state.id, state]));

export function phase20VisualState(stateId: string): Phase20VisualState | null {
  return byId.get(stateId as Phase20VisualStateId) ?? null;
}

export function isPhase20VisualConfiguration(value: string): value is Phase20VisualConfiguration {
  return (PHASE20_VISUAL_CONFIGURATIONS as readonly string[]).includes(value);
}

export function validatePhase20VisualStateRegistry(): void {
  if (PHASE20_VISUAL_STATE_REGISTRY.length !== 107 || byId.size !== 107) throw new Error("phase20_visual_registry_coverage_invalid");
  for (const [index, state] of PHASE20_VISUAL_STATE_REGISTRY.entries()) {
    if (state.id !== `BW-${String(index + 1).padStart(3, "0")}` || state.fixture_id !== PHASE20_VISUAL_FIXTURE_ID
      || !state.component || !state.route || state.route.startsWith("/__")
      || !state.fixture_seed || state.scenario !== state.name
      || !state.expected_visible_semantics.length || !state.focus_target
      || !state.readiness.test_id || !state.readiness.semantics.length
      || state.evidence_scope !== (index >= 91 ? "visual_only" : "production_screen")
      || !state.reference || (state.reference.kind === "retained_png" && (!state.reference.light.sha256 || !state.reference.dark.sha256))) {
      throw new Error("phase20_visual_registry_entry_invalid");
    }
  }
  if (PHASE20_VISUAL_CONFIGURATIONS.length !== 64 || new Set(PHASE20_VISUAL_CONFIGURATIONS).size !== 64) throw new Error("phase20_visual_registry_configurations_invalid");
}
