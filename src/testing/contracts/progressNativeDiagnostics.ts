import { parseMetricIdentity, parseMetricObservationJson, parseMetricTargetJson } from "../../domains/metrics";
import type { ProgressRecord } from "../../domains/progress/contracts";

type DiagnosticStage = "identity" | "target" | "observation";
export type ProgressNativeDiagnostic = Readonly<{ stage: DiagnosticStage; status: "passed" | "failed"; code: string }>;
const allowedCodes = new Set([
  "metric_identity_invalid", "metric_json_invalid", "metric_target_invalid", "metric_observation_invalid",
  "progress_all_sources_invalid", "progress_strength_projection_invalid", "progress_snapshot_kernel_required",
]);

/** Never return an exception message, payload, filename, or source row. */
export function progressNativeDiagnosticCode(error: unknown): string {
  if (error instanceof Error) {
    if (allowedCodes.has(error.message)) return error.message;
    if (error.name === "TypeError") return "type_error";
    if (error.name === "ReferenceError") return "reference_error";
  }
  return "unexpected_error";
}

/** Inspect only the synthetic contract evidence; leave acceptance behavior unchanged. */
export function inspectSyntheticStrengthFixture(record: ProgressRecord): readonly ProgressNativeDiagnostic[] {
  const diagnostics: ProgressNativeDiagnostic[] = [];
  let stage: DiagnosticStage = "identity";
  try {
    const identityParts = record.identityKey.split(":");
    if (identityParts.length !== 3) throw new Error("metric_identity_invalid");
    const [profile, contractVersion, exerciseMetricGeneration] = identityParts;
    const identity = parseMetricIdentity({ profile, contractVersion: Number(contractVersion), exerciseMetricGeneration: Number(exerciseMetricGeneration) });
    diagnostics.push(Object.freeze({ stage, status: "passed", code: "validated" }));
    stage = "target";
    parseMetricTargetJson(identity, record.targetJson);
    diagnostics.push(Object.freeze({ stage, status: "passed", code: "validated" }));
    stage = "observation";
    parseMetricObservationJson(identity, record.observationJson);
    diagnostics.push(Object.freeze({ stage, status: "passed", code: "validated" }));
  } catch (error) {
    diagnostics.push(Object.freeze({ stage, status: "failed", code: progressNativeDiagnosticCode(error) }));
  }
  return Object.freeze(diagnostics);
}
