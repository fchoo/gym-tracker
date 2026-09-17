import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  ADVANCED_TIMING_MAX_CLUSTER_GROUPS,
  ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS,
  ADVANCED_TIMING_MAX_INTERVAL_MS,
  ADVANCED_TIMING_MIN_INTERVAL_MS,
  AdvancedTimingConfigError,
  parseAdvancedTimingConfig,
} from "./advancedTimingConfig";

describe("AdvancedTimingConfigV1", () => {
  it("parses and canonicalizes each supported mode", () => {
    expect(parseAdvancedTimingConfig({ version: 1, mode: "off" })).toEqual({
      version: 1,
      mode: "off",
    });
    expect(parseAdvancedTimingConfig({
      version: 1,
      mode: "per_rep",
      intervalMs: 1_000,
      cueChannels: "haptic",
    })).toEqual({
      version: 1,
      mode: "per_rep",
      intervalMs: 1_000,
      cueChannels: "haptic",
    });
    expect(parseAdvancedTimingConfig({
      version: 1,
      mode: "cluster",
      groupSizes: [3, 3, 3],
      intraRestMs: 15_000,
      cueChannels: "both",
    })).toEqual({
      version: 1,
      mode: "cluster",
      groupSizes: [3, 3, 3],
      intraRestMs: 15_000,
      cueChannels: "both",
    });
  });

  it("rejects non-canonical object shapes, unknown modes, and invalid cue channels", () => {
    for (const value of [
      null,
      [],
      { version: 2, mode: "off" },
      { version: 1, mode: "off", cueChannels: "haptic" },
      { version: 1, mode: "unknown" },
      { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "visual" },
      { version: 1, mode: "per_rep", intervalMs: 1_000 },
    ]) {
      expect(() => parseAdvancedTimingConfig(value)).toThrow(AdvancedTimingConfigError);
    }
  });

  it("enforces safe bounded per-repetition intervals", () => {
    for (const intervalMs of [
      0,
      -1,
      ADVANCED_TIMING_MIN_INTERVAL_MS - 1,
      ADVANCED_TIMING_MAX_INTERVAL_MS + 1,
      Number.MAX_SAFE_INTEGER + 1,
      1.5,
    ]) {
      expect(() => parseAdvancedTimingConfig({
        version: 1,
        mode: "per_rep",
        intervalMs,
        cueChannels: "audio",
      })).toThrow("advanced_timing_config_invalid");
    }
  });

  it("enforces bounded cluster groups and a positive intra-set rest", () => {
    const valid = {
      version: 1,
      mode: "cluster",
      groupSizes: [2, 2],
      intraRestMs: 5_000,
      cueChannels: "audio",
    };
    for (const value of [
      { ...valid, groupSizes: [2] },
      { ...valid, groupSizes: [] },
      { ...valid, groupSizes: [2, 0] },
      { ...valid, groupSizes: [2, 1.5] },
      { ...valid, groupSizes: Array.from({ length: ADVANCED_TIMING_MAX_CLUSTER_GROUPS + 1 }, () => 1) },
      { ...valid, groupSizes: [ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS, 1] },
      { ...valid, intraRestMs: 0 },
      { ...valid, intraRestMs: ADVANCED_TIMING_MAX_INTERVAL_MS + 1 },
    ]) {
      expect(() => parseAdvancedTimingConfig(value)).toThrow("advanced_timing_config_invalid");
    }
  });
});
