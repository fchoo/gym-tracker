import { describe, expect, it } from "@jest/globals";

import {
  parseImportedActivityLocalId,
  projectImportedActivityDetail,
} from "../../domains/activities/activityDetails";
import { parseGarminSourceEnvelope } from "../../domains/activities/importContracts";
import { parseRunningGoal } from "../../domains/running/contracts";
import {
  assertProgressUpstreamPorts,
  type ProgressUpstreamPorts,
} from "./progressUpstreamPorts.contract";

const sha256 = "a".repeat(64);

describe("Progress upstream port contract", () => {
  it("accepts the landed Phase 13/17/18 factual boundaries without introducing a Progress store", () => {
    const goal = parseRunningGoal({
      version: 1,
      id: "goal-2400",
      planId: "running-plan",
      revision: 2,
      goalDistanceMeters: 2400,
      targetDurationMs: 660_000,
      trainingDays: ["Tuesday"],
      createdAtMs: 1,
    });
    const envelope = parseGarminSourceEnvelope({
      version: 1,
      source_kind: "garmin_connect_account",
      account_namespace: "owner",
      external_activity_id: "source-2400",
      normalization_version: 1,
      normalized_json_sha256: sha256,
      raw_component_sha256: { activity: sha256, splits: sha256, details: sha256 },
      sample_fidelity: "source_summary",
      fidelity_by_channel: {
        summary: "source_summary",
        exact_effort_basis: "source_summary",
      },
      normalized: {
        version: 1,
        started_at_ms: 1,
        sport: "running",
        subtype: "outdoor",
        distance_meters: 2400,
        elapsed_ms: 660_000,
        laps: [],
      },
    });
    const ports: ProgressUpstreamPorts = {
      goal,
      envelope,
      activityId: parseImportedActivityLocalId("activity-source-2400"),
      detail: projectImportedActivityDetail({
        activityId: "activity-source-2400",
        aggregateRevision: 1,
        acceptedNormalizedSha256: sha256,
        removalState: "active",
        aggregateJson: JSON.stringify({
          normalized_json_sha256: sha256,
          sample_fidelity: "source_summary",
          confirmed_local_date: "2026-10-12",
          normalized: envelope.normalized,
        }),
      }),
    };

    expect(assertProgressUpstreamPorts(ports)).toBe(ports);
  });
});
