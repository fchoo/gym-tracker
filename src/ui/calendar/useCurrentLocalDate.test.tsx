import { act, render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React from "react";
import { Text } from "react-native";

import { FakeClock } from "../../domains/shared/clock";
import type { LocalDate } from "../../domains/scheduling/localDate";
import { useCurrentLocalDate, type CurrentLocalDateDependencies } from "./useCurrentLocalDate";

function Probe({ dependencies }: Readonly<{ dependencies: CurrentLocalDateDependencies }>) {
  return <Text>{useCurrentLocalDate(dependencies)}</Text>;
}

describe("useCurrentLocalDate", () => {
  it("refreshes at local midnight and whenever the app returns to the foreground", async () => {
    const beforeMidnight = new Date(2026, 9, 13, 23, 59, 59, 900).getTime();
    const clock = new FakeClock(beforeMidnight);
    let scheduled: (() => void) | undefined;
    let scheduledDelayMs: number | undefined;
    let foreground: (() => void) | undefined;
    const dependencies: CurrentLocalDateDependencies = {
      clock,
      schedule: (callback, delayMs) => {
        scheduled = callback;
        scheduledDelayMs = delayMs;
        return 1;
      },
      cancel: () => undefined,
      subscribeForeground: (callback) => {
        foreground = callback;
        return () => { foreground = undefined; };
      },
    };
    await render(<Probe dependencies={dependencies} />);
    expect(screen.getByText("2026-10-13")).toBeOnTheScreen();
    expect(scheduledDelayMs).toBe(100);

    clock.advanceBy(200);
    await act(async () => scheduled?.());
    expect(screen.getByText("2026-10-14")).toBeOnTheScreen();
    expect(scheduledDelayMs).toBe(60_000);

    clock.advanceBy(24 * 60 * 60 * 1_000);
    await act(async () => foreground?.());
    expect(screen.getByText("2026-10-15")).toBeOnTheScreen();
  });

  it("refreshes an active timezone or wall-clock date change within the bounded poll", async () => {
    const clock = new FakeClock(1_000);
    let activeCivilDate = "2026-10-13" as LocalDate;
    let scheduled: (() => void) | undefined;
    let scheduledDelayMs: number | undefined;
    const dependencies: CurrentLocalDateDependencies = {
      clock,
      localDate: () => activeCivilDate,
      schedule: (callback, delayMs) => {
        scheduled = callback;
        scheduledDelayMs = delayMs;
        return 1;
      },
      cancel: () => undefined,
      subscribeForeground: () => () => undefined,
    };
    await render(<Probe dependencies={dependencies} />);
    expect(screen.getByText("2026-10-13")).toBeOnTheScreen();
    expect(scheduledDelayMs).toBe(60_000);

    activeCivilDate = "2026-10-14" as LocalDate;
    await act(async () => scheduled?.());

    expect(screen.getByText("2026-10-14")).toBeOnTheScreen();
    expect(scheduledDelayMs).toBe(60_000);
  });
});
