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
import {
  Text,
} from "react-native";

import {
  PlanEditorReorderableRow,
} from "../components/PlanEditorFields";
import {
  AppearanceProvider,
} from "../theme";

describe("PlanEditorReorderableRow", () => {
  it("keeps a labelled drag handle and bounded non-visual movement without visual position controls", async () => {
    const onMoveDown = jest.fn();
    const onMoveTo = jest.fn();
    const onMoveUp = jest.fn();

    const rendered = await render(
      <AppearanceProvider>
        <PlanEditorReorderableRow
          count={3}
          label="Recovery"
          onMoveDown={onMoveDown}
          onMoveTo={onMoveTo}
          onMoveUp={onMoveUp}
          position={1}
          reorderId="recovery"
          trailing={<Text testID="replace-slot">Replace</Text>}
        >
          <Text>Recovery</Text>
        </PlanEditorReorderableRow>
      </AppearanceProvider>,
    );

    const handle = rendered.getByTestId("drag-recovery");
    expect(handle).toHaveProp("accessibilityLabel", "Reorder Recovery");
    expect(handle).toHaveProp(
      "accessibilityHint",
      "Touch and hold to drag. Use accessibility actions to move this item.",
    );
    expect(handle).toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(handle).toHaveProp("accessibilityActions", [
      { name: "increment", label: "Move up" },
      { name: "decrement", label: "Move down" },
    ]);
    expect(rendered.getByTestId("replace-slot")).toBeOnTheScreen();
    expect(rendered.queryByText("Position 2 of 3")).not.toBeOnTheScreen();
    expect(rendered.queryByRole("button", { name: "Move Recovery up" }))
      .not.toBeOnTheScreen();
    expect(rendered.queryByRole("button", { name: "Move Recovery down" }))
      .not.toBeOnTheScreen();

    await fireEvent(handle, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    await fireEvent(handle, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    await fireEvent(handle, "keyDown", {
      nativeEvent: { key: "ArrowUp", shiftKey: true },
    });
    await fireEvent(handle, "keyDown", {
      nativeEvent: { key: "ArrowDown", shiftKey: true },
    });

    expect(onMoveUp).not.toHaveBeenCalled();
    expect(onMoveDown).not.toHaveBeenCalled();
    expect(onMoveTo).toHaveBeenNthCalledWith(1, 0, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(2, 2, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(3, 0, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(4, 2, "fallback");
  });

});
