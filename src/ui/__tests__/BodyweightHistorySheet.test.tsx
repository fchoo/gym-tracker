import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { BodyweightHistorySheet, type BodyweightHistoryEntry } from "../components/BodyweightHistorySheet";
import { AppearanceProvider } from "../theme";

const entries: readonly BodyweightHistoryEntry[] = [
  { entryId: "older", revision: 1, localDate: "2026-10-05", grams: 70_000 },
  { entryId: "latest", revision: 2, localDate: "2026-10-07", grams: 69_500 },
];

describe("BodyweightHistorySheet", () => {
  it("uses a row-specific second confirmation and removes only after read-back", async () => {
    const onDelete = jest.fn(async () => [entries[0]!]);
    await render(
      <AppearanceProvider>
        <BodyweightHistorySheet
          entries={entries}
          onAdd={jest.fn()}
          onClose={jest.fn()}
          onDelete={onDelete}
          onEdit={jest.fn()}
          visible
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Latest · 69.5 kg")).toBeOnTheScreen();
    expect(screen.getByText("2 entries")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Delete bodyweight entry for 2026-10-07" }));
    expect(screen.getByText("Delete bodyweight entry?")).toBeOnTheScreen();
    expect(screen.getByText("This removes the 2026-10-07 entry. Strength targets will not change.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Keep bodyweight entry" }));
    expect(screen.queryByText("Delete bodyweight entry?")).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Delete bodyweight entry for 2026-10-07" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete bodyweight entry" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(entries[1]));
    await waitFor(() => expect(screen.getByText("1 entry")).toBeOnTheScreen());
    expect(screen.queryByText("2026-10-07")).not.toBeOnTheScreen();
  });

  it("retains the confirmation with an explicit retry when deletion fails", async () => {
    const onDelete = jest.fn(async () => { throw new Error("delete_failed"); });
    await render(
      <AppearanceProvider>
        <BodyweightHistorySheet
          entries={entries}
          onAdd={jest.fn()}
          onClose={jest.fn()}
          onDelete={onDelete}
          onEdit={jest.fn()}
          visible
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Delete bodyweight entry for 2026-10-07" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete bodyweight entry" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bodyweight entry was not deleted."));
    expect(screen.getByText("Delete bodyweight entry?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry deleting entry" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
  });
});
