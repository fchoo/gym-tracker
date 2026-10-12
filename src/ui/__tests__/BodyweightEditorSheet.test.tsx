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

  it("retains its draft with a persistent retry after an authoritative save failure", async () => {
    const onSave = jest.fn(async () => { throw new Error("write_failed"); });
    await render(
      <AppearanceProvider>
        <BodyweightEditorSheet
          expectedRevision={1}
          mode="edit"
          initialGrams={62_500}
          initialLocalDate="2026-10-06"
          onClose={jest.fn()}
          onSave={onSave}
          todayLocalDate="2026-10-07"
          visible
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bodyweight entry was not saved."));
    expect(screen.getByLabelText("Bodyweight, kg")).toHaveProp("value", "62.5");
    await fireEvent.press(screen.getByRole("button", { name: "Retry saving entry" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it("keeps an invalid draft local and explains the reviewed bounds", async () => {
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

    await fireEvent.changeText(screen.getByLabelText("Bodyweight, kg"), "19.9");
    await fireEvent.press(screen.getByRole("button", { name: "Save entry" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid date and bodyweight from 20.0 to 400.0 kg.");
    expect(onSave).not.toHaveBeenCalled();
  });
});
