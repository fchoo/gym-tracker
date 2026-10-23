import { describe, expect, it } from "@jest/globals";

import { fitTabLabelFontSize } from "./tabLabelFit";

describe("plain-native tab label fitting", () => {
  it("keeps the approved base when actual glyph advance fits with end clearance", () => {
    expect(fitTabLabelFontSize(16, 64, 76, 8)).toEqual({ fontSize: 16, fits: true });
    expect(fitTabLabelFontSize(16, 74, 76, 8)).toEqual({ fontSize: 16, fits: true });
  });

  it("estimates a smaller candidate but requires a fresh native measurement", () => {
    expect(fitTabLabelFontSize(16, 120, 76, 8)).toEqual({ fontSize: 9.75, fits: false });
    expect(fitTabLabelFontSize(9.75, 78, 76, 8)).toEqual({ fontSize: 9.25, fits: false });
    expect(fitTabLabelFontSize(9.25, 72, 76, 8)).toEqual({ fontSize: 9.25, fits: true });
    // Native integer font rounding can keep consecutive advances identical.
    expect(fitTabLabelFontSize(16, 74.01, 76, 8)).toEqual({ fontSize: 15.75, fits: false });
  });

  it("bounds retries to quarter-sp steps and never falsely certifies overflow at the floor", () => {
    expect(fitTabLabelFontSize(16, 1000, 76, 8)).toEqual({ fontSize: 8, fits: false });
    expect(fitTabLabelFontSize(8, 80, 76, 8)).toEqual({ fontSize: 8, fits: false });
    expect(fitTabLabelFontSize(8, 70, 76, 8)).toEqual({ fontSize: 8, fits: true });
  });

  it.each([
    [Number.NaN, 64, 76, 8],
    [0, 64, 76, 8],
    [16, Number.POSITIVE_INFINITY, 76, 8],
    [16, 0, 76, 8],
    [16, -1, 76, 8],
    [16, 64, Number.NaN, 8],
    [16, 64, 2, 8],
    [16, 64, 0, 8],
    [16, 64, 76, Number.NaN],
    [16, 64, 76, 0],
    [8, 64, 76, 16],
  ])("waits on invalid/unknown metrics %p", (fontSize, width, column, floor) => {
    expect(fitTabLabelFontSize(fontSize, width, column, floor)).toBeNull();
  });
});
