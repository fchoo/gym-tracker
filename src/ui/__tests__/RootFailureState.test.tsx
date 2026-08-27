import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import { RootFailureState } from "../screens/RootFailureState";
import { AppearanceProvider } from "../theme";

describe("Plan 01-06 RootFailureState", () => {
  it("shows exact safe recovery copy and reveals only category plus bounded code", async () => {
    const retry = jest.fn();
    await render(
      <AppearanceProvider>
        <RootFailureState
          failure={{
            category: "migration",
            code: "launch_runMigrations_failed",
            correlationCode: "GT-MIGRATE1",
            retryable: true,
          }}
          onRetry={retry}
        />
      </AppearanceProvider>,
    );

    expect(
      screen.getByRole("header", { name: "Workout data could not be opened" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("Your saved data was not changed. Try again."),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Retry opening workout data" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "View diagnostic code" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/launch_runMigrations_failed/u))
      .not.toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole("button", { name: "View diagnostic code" }),
    );
    expect(screen.getByText("Migration · GT-MIGRATE1")).toBeOnTheScreen();
    for (const leakedText of [
      "SQL",
      "parameter",
      "password",
      "secret",
      "launch_runMigrations_failed",
    ]) {
      expect(screen.queryByText(new RegExp(leakedText, "u")))
        .not.toBeOnTheScreen();
    }

    await fireEvent.press(
      screen.getByRole("button", { name: "Retry opening workout data" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("disables Retry when the typed failure is not retryable", async () => {
    await render(
      <AppearanceProvider>
        <RootFailureState
          failure={{
            category: "storage",
            code: "launch_openWriter_failed",
            correlationCode: "GT-WRITER01",
            retryable: false,
          }}
          onRetry={jest.fn()}
        />
      </AppearanceProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Retry opening workout data" }),
    ).toBeDisabled();
    await fireEvent.press(
      screen.getByRole("button", { name: "View diagnostic code" }),
    );
    expect(screen.getByText("Storage · GT-WRITER01")).toBeOnTheScreen();
  });
});
