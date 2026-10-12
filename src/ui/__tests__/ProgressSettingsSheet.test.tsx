import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { ProgressSettingsSheet } from "../components/ProgressSettingsSheet";
import { AppearanceProvider } from "../theme";

describe("ProgressSettingsSheet", () => {
  it("discloses the factual no-score boundary and opens bodyweight history", async () => {
    const onOpenBodyweightHistory = jest.fn();
    await render(
      <AppearanceProvider>
        <ProgressSettingsSheet
          onClose={jest.fn()}
          onOpenBodyweightHistory={onOpenBodyweightHistory}
          visible
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Personal history is the benchmark. No readiness or composite score is calculated.")).toBeOnTheScreen();
    expect(screen.getByText("Bodyweight is optional, used only for relative strength views, and never changes targets automatically. Gender and height are not collected.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Bodyweight history" }));
    expect(onOpenBodyweightHistory).toHaveBeenCalledTimes(1);
  });
});
