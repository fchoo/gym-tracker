import {
  describe,
  expect,
  it,
} from "@jest/globals";

import { FakeClock } from "../shared/clock";
import {
  addLocalDays,
  compareLocalDates,
  differenceInLocalDays,
  parseLocalDate,
  weekdayForLocalDate,
} from "./localDate";
import {
  localDateAtInstant,
  parseStoredTimeZone,
  resolveStoredCalendarContext,
} from "./timeZone";

describe("Plan 02-03 LocalDate calendar arithmetic", () => {
  it.each([
    ["month boundary", "2026-01-31", 1, "2026-02-01"],
    ["leap day", "2024-02-28", 1, "2024-02-29"],
    ["400-year leap rule", "2000-02-28", 1, "2000-02-29"],
    ["leap month boundary", "2024-02-29", 1, "2024-03-01"],
    ["century non-leap rule", "2100-02-28", 1, "2100-03-01"],
    ["non-leap month boundary", "2025-02-28", 1, "2025-03-01"],
    ["year boundary", "2026-12-31", 1, "2027-01-01"],
    ["negative movement", "2026-03-01", -1, "2026-02-28"],
  ])(
    "advances the %s from calendar components",
    (_caseName, input, amount, expected) => {
      expect(addLocalDays(parseLocalDate(input), amount)).toBe(expected);
    },
  );

  it.each([
    { input: "2024-02-29", expected: "Thursday" },
    { input: "2026-08-17", expected: "Monday" },
    { input: "2027-01-01", expected: "Friday" },
  ] as const)("resolves $input as $expected", ({ input, expected }) => {
    expect(weekdayForLocalDate(parseLocalDate(input))).toBe(expected);
  });

  it("E-53 treats touching dates as adjacent calendar values", () => {
    const earlier = parseLocalDate("2026-03-08");
    const later = parseLocalDate("2026-03-09");

    expect(differenceInLocalDays(earlier, later)).toBe(1);
    expect(differenceInLocalDays(later, earlier)).toBe(-1);
    expect(compareLocalDates(earlier, later)).toBe(-1);
    expect(compareLocalDates(later, earlier)).toBe(1);
    expect(compareLocalDates(earlier, earlier)).toBe(0);
  });

  it("E-56 preserves stable LocalDate ordering independent of input order", () => {
    const values = [
      parseLocalDate("2027-01-01"),
      parseLocalDate("2024-02-29"),
      parseLocalDate("2026-12-31"),
      parseLocalDate("2026-01-01"),
    ];

    expect(values.toSorted(compareLocalDates)).toEqual([
      "2024-02-29",
      "2026-01-01",
      "2026-12-31",
      "2027-01-01",
    ]);
  });

  it.each([
    "",
    "2026-2-01",
    "2026-02-1",
    "2026-02-29",
    "2024-02-30",
    "0000-01-01",
    "10000-01-01",
  ])("rejects invalid LocalDate input %p with a stable code", (input) => {
    expect(() => parseLocalDate(input)).toThrow("local_date_invalid");
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid calendar-day movement %p",
    (amount) => {
      expect(() => addLocalDays(parseLocalDate("2026-01-01"), amount))
        .toThrow("local_date_day_count_invalid");
    },
  );

  it.each([
    { input: "0001-01-01", amount: -1 },
    { input: "9999-12-31", amount: 1 },
  ] as const)(
    "rejects movement beyond the supported LocalDate range from $input",
    ({ input, amount }) => {
      expect(() => addLocalDays(parseLocalDate(input), amount))
        .toThrow("local_date_out_of_range");
    },
  );
});

describe("Plan 02-03 stored-timezone calendar resolution", () => {
  it.each([
    {
      id: "E-53 midnight before",
      timeZone: "America/New_York",
      instant: "2026-03-08T04:59:59.999Z",
      expected: "2026-03-07",
    },
    {
      id: "E-53 midnight after",
      timeZone: "America/New_York",
      instant: "2026-03-08T05:00:00.000Z",
      expected: "2026-03-08",
    },
    {
      id: "D-48 spring-forward before",
      timeZone: "America/New_York",
      instant: "2026-03-08T06:59:59.999Z",
      expected: "2026-03-08",
    },
    {
      id: "D-48 spring-forward after",
      timeZone: "America/New_York",
      instant: "2026-03-08T07:00:00.000Z",
      expected: "2026-03-08",
    },
    {
      id: "D-48 fall-back before",
      timeZone: "America/New_York",
      instant: "2026-11-01T05:59:59.999Z",
      expected: "2026-11-01",
    },
    {
      id: "D-48 fall-back after",
      timeZone: "America/New_York",
      instant: "2026-11-01T06:00:00.000Z",
      expected: "2026-11-01",
    },
    {
      id: "positive-offset year boundary",
      timeZone: "Pacific/Kiritimati",
      instant: "2026-12-31T10:00:00.000Z",
      expected: "2027-01-01",
    },
  ])("$id resolves the intended LocalDate", ({ instant, timeZone, expected }) => {
    expect(localDateAtInstant(
      Date.parse(instant),
      parseStoredTimeZone(timeZone),
    )).toBe(expected);
  });

  it("E-55 preserves validated stored timezone text in calendar context", () => {
    const timeZone = parseStoredTimeZone("Asia/Singapore");
    const context = resolveStoredCalendarContext(
      Date.parse("2026-08-16T16:00:00.000Z"),
      timeZone,
    );

    expect(context).toEqual({
      localDate: "2026-08-17",
      timeZone: "Asia/Singapore",
      weekday: "Monday",
    });
  });

  it("D-47 keeps the session start LocalDate authoritative after midnight", () => {
    const timeZone = parseStoredTimeZone("Asia/Singapore");
    const clock = new FakeClock(Date.parse("2026-08-17T15:59:59.000Z"));
    const sessionCalendar = resolveStoredCalendarContext(
      clock.nowMs(),
      timeZone,
    );

    clock.advanceBy(2_000);

    expect(localDateAtInstant(clock.nowMs(), timeZone)).toBe("2026-08-18");
    expect(sessionCalendar.localDate).toBe("2026-08-17");
    expect(addLocalDays(sessionCalendar.localDate, 1)).toBe("2026-08-18");
  });

  it.each([
    "",
    " ",
    "Mars/Olympus_Mons",
  ])("rejects invalid stored timezone %p with a stable code", (input) => {
    expect(() => parseStoredTimeZone(input))
      .toThrow("schedule_timezone_invalid");
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid instant %p without reflecting it", (instantMs) => {
    const timeZone = parseStoredTimeZone("UTC");
    expect(() => localDateAtInstant(instantMs, timeZone))
      .toThrow("schedule_instant_invalid");
  });
});
