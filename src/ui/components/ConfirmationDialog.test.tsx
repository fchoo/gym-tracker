import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { AppearanceProvider } from "../theme";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ConfirmationDialog>> = {},
) {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { height: 900, width: 800, x: 0, y: 0 },
      insets: { bottom: 16, left: 0, right: 0, top: 24 },
    }}>
      <AppearanceProvider>
        <ConfirmationDialog
          body="This action cannot be undone."
          cancelLabel="Keep workout"
          confirmLabel="Remove workout"
          heading="Remove workout"
          onCancel={onCancel}
          onConfirm={onConfirm}
          visible
          {...overrides}
        />
      </AppearanceProvider>
    </SafeAreaProvider>,
  ).then((result) => ({ ...result, onCancel, onConfirm }));
}

describe("ConfirmationDialog", () => {
  it("names the consequence, focuses its safe action, and dismisses without writing", async () => {
    const safeFocus = jest.fn();
    const restoreFocus = jest.fn();
    const { onCancel, onConfirm } = await renderDialog({
      initialFocusRef: { current: { focus: safeFocus } as unknown as View },
      restoreFocusRef: { current: { focus: restoreFocus } as unknown as View },
    });

    expect(screen.getByRole("header", { name: "Remove workout" }))
      .toBeOnTheScreen();
    expect(safeFocus).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Keep workout" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate submit while busy", async () => {
    const { onConfirm } = await renderDialog({ confirmBusy: true });
    const confirm = screen.getByRole("button", { name: "Remove workout" });

    expect(confirm).toBeDisabled();
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
