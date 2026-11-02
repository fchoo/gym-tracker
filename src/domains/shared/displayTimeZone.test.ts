import { describe, expect, it } from "@jest/globals";
import { displayDateRange, displayLocalDate, displayLocalDateTime } from "./displayTimeZone";

describe("phone timezone display", () => {
  it("places the same immutable instant on different local days across zones", () => {
    const instant = Date.parse("2026-10-25T01:30:00Z");
    expect(displayLocalDate(instant, "Asia/Singapore")).toBe("2026-10-25");
    expect(displayLocalDate(instant, "America/New_York")).toBe("2026-10-24");
    expect(displayLocalDateTime(instant, "Asia/Singapore")).toBe("2026-10-25 09:30");
    expect(instant).toBe(Date.parse("2026-10-25T01:30:00Z"));
  });
  it("uses Singapore midnight rather than UTC midnight at month boundaries", () => {
    expect(displayDateRange("2026-11-01", "2026-12-01", "Asia/Singapore")).toEqual({
      startMs: Date.parse("2026-10-31T16:00:00Z"), endMs: Date.parse("2026-11-30T16:00:00Z"),
    });
  });
  it("keeps the actual 23-hour and 25-hour local days across DST", () => {
    const spring = displayDateRange("2026-03-08", "2026-03-09", "America/New_York");
    const fall = displayDateRange("2026-11-01", "2026-11-02", "America/New_York");
    expect(spring.endMs - spring.startMs).toBe(23 * 3_600_000);
    expect(fall.endMs - fall.startMs).toBe(25 * 3_600_000);
  });
  it("rejects invalid instants, zones and civil ranges", () => {
    expect(() => displayLocalDate(NaN, "Asia/Singapore")).toThrow();
    expect(() => displayLocalDate(0, "Asia/Invalid")).toThrow();
    expect(() => displayDateRange("2026-02-30", "2026-03-05", "Asia/Singapore")).toThrow();
    expect(() => displayDateRange("2026-10-25", "2026-10-25", "UTC")).toThrow();
  });
});
