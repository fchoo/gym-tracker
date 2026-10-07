import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  retireAdvancedTiming,
} from "./advancedTimingCommands";

describe("TIM-01 advanced timing retirement boundary", () => {
  it("turns every new or restored timing snapshot into an inert off snapshot", () => {
    expect(retireAdvancedTiming({
      version: 1,
      mode: "per_rep",
      intervalMs: 1_000,
      cueChannels: "both",
    })).toEqual({ version: 1, mode: "off" });
    expect(retireAdvancedTiming({
      version: 1,
      mode: "cluster",
      groupSizes: [2, 2],
      intraClusterRestMs: 1_000,
      interClusterRestMs: 2_000,
      cueChannels: "haptic",
    })).toEqual({ version: 1, mode: "off" });
    expect(retireAdvancedTiming({ version: 1, mode: "off" })).toEqual({
      version: 1,
      mode: "off",
    });
  });
});
