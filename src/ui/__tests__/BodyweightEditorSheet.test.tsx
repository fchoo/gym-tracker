import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { BodyweightEditorSheet } from "../components/BodyweightEditorSheet";
import { AppearanceProvider } from "../theme";

describe("BodyweightEditorSheet", () => {
  it("keeps a local decimal draft and submits canonical grams once", async () => {
    const onSave = jest.fn(async () => undefined);
    await render(
      <AppearanceProvider>
        <BodyweightEditorSheet
          expectedRevision={0}
          mode="add"
          onClose={jest.fn()}
          onSave={onSave}
          todayLocalDate="2026-10-07"
          visible
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Add bodyweight")).toBeOnTheScreen();
    expect(screen.getByText("Optional measurement. It never changes workout targets automatically.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Bodyweight, kg"), "62.5");
    await fireEvent.press(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      expectedRevision: 0,
      grams: 62_500,
      localDate: "2026-10-07",
    });
  });
});
