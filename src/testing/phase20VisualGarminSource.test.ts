import { describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) => {
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    return createHash("sha256").update(value).digest("hex");
  },
}));

import { createPhase20VisualGarminSource } from "./phase20VisualGarminSource";
import type { Phase20VisualRequest } from "./phase20VisualRequest";

function request(state: Phase20VisualRequest["state"]): Phase20VisualRequest {
  return { nonce: "a".repeat(32), state, configuration: "AP-L-C390-P-F100", appearance: "Light", mode: "capture" };
}

describe("Phase 20 visual Garmin source", () => {
  it("keeps disconnected and connected states deterministic inside the visual gate", async () => {
    await expect(createPhase20VisualGarminSource(request("BW-092")).restoreSession())
      .resolves.toEqual({ kind: "disconnected" });
    await expect(createPhase20VisualGarminSource(request("BW-095")).restoreSession())
      .resolves.toEqual({ kind: "connected", account_namespace: "phase20-visual-account", generation: 1 });
  });

  it("returns valid source envelopes and explicit failure behavior", async () => {
    const source = createPhase20VisualGarminSource(request("BW-097"));
    await expect(source.listRunningSummaries({ limit: 20 })).resolves.toHaveProperty("items", [
      { account_namespace: "phase20-visual-account", external_activity_id: "phase20-outdoor-001" },
      { account_namespace: "phase20-visual-account", external_activity_id: "phase20-treadmill-001" },
    ]);
    await expect(source.readActivity("phase20-outdoor-001")).resolves.toMatchObject({
      source_kind: "garmin_connect_account",
      account_namespace: "phase20-visual-account",
      external_activity_id: "phase20-outdoor-001",
      sample_fidelity: "source_laps",
    });
    await expect(createPhase20VisualGarminSource(request("BW-099")).listRunningSummaries({ limit: 20 }))
      .rejects.toThrow("garmin_rate_limited");
  });

  it("cannot be constructed for a non-Garmin state", () => {
    expect(() => createPhase20VisualGarminSource(request("BW-091")))
      .toThrow("phase20_visual_garmin_state_invalid");
  });
});
