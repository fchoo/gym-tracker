import type { ImportedActivityDetailProjection } from "../../domains/activities/activityDetails";
import type { BodyweightEntryState } from "../../domains/bodyweight/contracts";
import type { RunningGoal, RunningPlanSession } from "../../domains/running/contracts";

/**
 * Compile-time-only freeze of the Phase 13/17/18 data that Progress may read.
 * It deliberately excludes repositories and SQL handles: projections receive
 * durable, revision-bearing facts from the single upstream read boundary.
 */
export type ProgressUpstreamPorts = Readonly<{
  goal: RunningGoal;
  envelope: ReturnType<typeof import("../../domains/activities/importContracts").parseGarminSourceEnvelope>;
  activityId: string | null;
  detail: ImportedActivityDetailProjection;
  bodyweight?: BodyweightEntryState;
  plannedOccurrence?: RunningPlanSession;
  sourceNavigation?: Readonly<{ activityId: string; aggregateRevision: number }>;
}>;

/**
 * Runtime guard keeps the exported facts narrow and stable without accepting
 * fixture identities, provider payload mutation, or an implicit SQL adapter.
 */
export function assertProgressUpstreamPorts(
  ports: ProgressUpstreamPorts,
): ProgressUpstreamPorts {
  if (ports.activityId === null || ports.activityId.trim() === "") {
    throw new TypeError("progress_upstream_activity_identity_missing");
  }
  if (ports.goal.id.trim() === "" || ports.goal.planId.trim() === "" || ports.goal.revision < 1) {
    throw new TypeError("progress_upstream_goal_invalid");
  }
  if (ports.envelope.source_kind !== "garmin_connect_account"
    || ports.envelope.account_namespace.trim() === ""
    || ports.envelope.external_activity_id.trim() === "") {
    throw new TypeError("progress_upstream_import_identity_invalid");
  }
  if (ports.detail.kind !== "ready") {
    throw new TypeError("progress_upstream_accepted_detail_unavailable");
  }
  if (ports.sourceNavigation !== undefined
    && (!Number.isSafeInteger(ports.sourceNavigation.aggregateRevision)
      || ports.sourceNavigation.aggregateRevision < 1
      || ports.sourceNavigation.activityId !== ports.activityId)) {
    throw new TypeError("progress_upstream_source_navigation_invalid");
  }
  return ports;
}
