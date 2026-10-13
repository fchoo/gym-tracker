import { describe, expect, it } from "@jest/globals";

import {
  V12_GARMIN_ACCEPTANCE_CASES,
  runV12GarminAcceptanceContract,
} from "./v12GarminAcceptance.contract";

describe("v1.2 Garmin native-acceptance contract", () => {
  it("keeps the standalone packaging through matching ledger ordered and evidence-only", () => {
    expect(V12_GARMIN_ACCEPTANCE_CASES.map(({ id }) => id)).toEqual([
      "NV-GAR-01-PACKAGING",
      "NV-GAR-02-BRIDGE-ALLOWLIST",
      "NV-GAR-03-CANONICAL-JSON",
      "NV-GAR-04-SYNC-READ",
      "NV-GAR-05-DEDUPE-REVISION",
      "NV-GAR-06-MATCH-SELECTION",
      "NV-GAR-07-ACCOUNT-LIFECYCLE",
      "NV-GAR-08-RECOVERY",
      "NV-GAR-09-PORTABILITY",
      "NV-GAR-10-PROGRESS-CALENDAR",
      "NV-GAR-11-PROCESS-BOUNDARY",
      "NV-GAR-12-PRIVACY",
    ]);
    expect(V12_GARMIN_ACCEPTANCE_CASES.every(({ disposition }) => disposition === "observe-only")).toBe(true);
  });

  it("requires all four canonical observation documents while retaining native proof as NOT_RUN", () => {
    expect(runV12GarminAcceptanceContract({
      packagingAuth: { source: "bundled-chaquopy", bridgeMethods: ["login", "mfa", "activities", "activity", "splits", "details"], nativeExecution: "NOT_RUN" },
      syncRead: { fixtureManifestSha256: "a".repeat(64), expectedSummaries: 3, nativeExecution: "NOT_RUN" },
      dedupe: { receiptDigest: "b".repeat(64), provenanceDigest: "c".repeat(64), replayIdentityCount: 7, nativeExecution: "NOT_RUN" },
      matching: { matchDigest: "d".repeat(64), selectedOpportunityCount: 1, nativeExecution: "NOT_RUN" },
    })).toEqual({ status: "NOT_RUN", caseCount: 12 });
  });

  it("rejects alternative transports, final verdicts, incomplete bridge allowlists, and private values", () => {
    const valid = {
      packagingAuth: { source: "bundled-chaquopy", bridgeMethods: ["login", "mfa", "activities", "activity", "splits", "details"], nativeExecution: "NOT_RUN" },
      syncRead: { fixtureManifestSha256: "a".repeat(64), expectedSummaries: 3, nativeExecution: "NOT_RUN" },
      dedupe: { receiptDigest: "b".repeat(64), provenanceDigest: "c".repeat(64), replayIdentityCount: 7, nativeExecution: "NOT_RUN" },
      matching: { matchDigest: "d".repeat(64), selectedOpportunityCount: 1, nativeExecution: "NOT_RUN" },
    };
    expect(() => runV12GarminAcceptanceContract({ ...valid, packagingAuth: { ...valid.packagingAuth, source: "local-server" } })).toThrow("garmin_transport_invalid");
    expect(() => runV12GarminAcceptanceContract({ ...valid, packagingAuth: { ...valid.packagingAuth, nativeExecution: "PASS" } })).toThrow("garmin_execution_invalid");
    expect(() => runV12GarminAcceptanceContract({ ...valid, packagingAuth: { ...valid.packagingAuth, bridgeMethods: ["login"] } })).toThrow("garmin_bridge_allowlist_invalid");
    expect(() => runV12GarminAcceptanceContract({ ...valid, matching: { ...valid.matching, accountSubject: "owner@example.test" } })).toThrow("garmin_private_field");
  });
});
