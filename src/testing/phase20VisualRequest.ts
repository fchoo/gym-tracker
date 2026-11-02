import type { AppearancePreference } from "../ui/theme";
import {
  isPhase20VisualConfiguration,
  PHASE20_VISUAL_FIXTURE_ID,
  phase20VisualState,
  type Phase20VisualConfiguration,
  type Phase20VisualStateId,
} from "./phase20VisualStateRegistry";

export const PHASE20_VISUAL_ROUTE = "/__phase20-visual-probe" as const;

export type Phase20VisualRequest = Readonly<{
  nonce: string;
  state: Phase20VisualStateId;
  configuration: Phase20VisualConfiguration;
  appearance: AppearancePreference;
  mode: "capture" | "reset";
}>;

export function resolvePhase20VisualRequest(
  params: Readonly<Record<string, unknown>>,
): Phase20VisualRequest | null {
  const { nonce, state, configuration, fixture, mode } = params;
  if (
    typeof nonce !== "string"
    || !/^[a-f0-9]{32}$/u.test(nonce)
    || typeof state !== "string"
    || phase20VisualState(state) === null
    || fixture !== PHASE20_VISUAL_FIXTURE_ID
    || typeof configuration !== "string"
    || !isPhase20VisualConfiguration(configuration)
    || (mode !== "capture" && mode !== "reset")
  ) {
    return null;
  }
  const appearanceCode = configuration.split("-")[1];
  return Object.freeze({
    nonce,
    state: state as Phase20VisualStateId,
    configuration,
    mode,
    appearance: mode === "reset" || appearanceCode === "SL" || appearanceCode === "SD"
      ? "System"
      : appearanceCode === "L"
        ? "Light"
        : "Dark",
  });
}

export function phase20VisualGate(input: Readonly<{
  buildProfile: unknown;
  nativeContractsEnabled: unknown;
  nativeContractSuite: unknown;
  pathname: string;
  params: Readonly<Record<string, unknown>>;
}>): Phase20VisualRequest | null {
  if (
    input.pathname !== PHASE20_VISUAL_ROUTE
    || input.buildProfile !== "development-test"
    || input.nativeContractsEnabled !== true
    || input.nativeContractSuite !== "v1.2-acceptance"
  ) {
    return null;
  }
  return resolvePhase20VisualRequest(input.params);
}
