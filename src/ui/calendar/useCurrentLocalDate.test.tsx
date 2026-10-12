import { act, render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React from "react";
import { Text } from "react-native";

import { FakeClock } from "../../domains/shared/clock";
import { useCurrentLocalDate, type CurrentLocalDateDependencies } from "./useCurrentLocalDate";

function Probe({ dependencies }: Readonly<{ dependencies: CurrentLocalDateDependencies }>) {
  return <Text>{useCurrentLocalDate(dependencies)}</Text>;
}

describe("useCurrentLocalDate", () => {
  it("refreshes at local midnight and whenever the app returns to the foreground", async () => {
    const beforeMidnight = new Date(2026, 9, 13, 23, 59, 59, 900).getTime();
    const clock = new FakeClock(beforeMidnight);
    let scheduled: (() => void) | undefined;
    let foreground: (() => void) | undefined;
    const dependencies: CurrentLocalDateDependencies = {
      clock,
      schedule: (callback) => {
        scheduled = callback;
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

    clock.advanceBy(200);
    await act(async () => scheduled?.());
    expect(screen.getByText("2026-10-14")).toBeOnTheScreen();

    clock.advanceBy(24 * 60 * 60 * 1_000);
    await act(async () => foreground?.());
    expect(screen.getByText("2026-10-15")).toBeOnTheScreen();
  });
});
