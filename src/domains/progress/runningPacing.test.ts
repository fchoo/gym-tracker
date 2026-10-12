import { describe, expect, it } from "@jest/globals";

import { deriveRunningPacing } from "./runningPacing";

describe("deriveRunningPacing", () => {
  it("formats the locked 2.4 km 11:00 target exactly", () => {
    expect(deriveRunningPacing({ distanceMeters: 2400, targetDurationSeconds: 660 })).toEqual({
      target: "11:00",
      pacePerKm: "4:35/km",
      per400m: "1:50/400 m",
      per200m: "0:55/200 m",
    });
  });

  it("uses rational whole-second half-up rounding around the exact half-second boundary", () => {
    expect(deriveRunningPacing({ distanceMeters: 2001, targetDurationSeconds: 1 }).pacePerKm).toBe("0:00/km");
    expect(deriveRunningPacing({ distanceMeters: 2000, targetDurationSeconds: 1 }).pacePerKm).toBe("0:01/km");
    expect(deriveRunningPacing({ distanceMeters: 1999, targetDurationSeconds: 1 }).pacePerKm).toBe("0:01/km");
  });
});
