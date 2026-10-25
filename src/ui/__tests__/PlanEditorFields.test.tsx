import {
  fireEvent,
  act,
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
import { getByGestureTestId } from "react-native-gesture-handler/jest-utils";
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
  it("keeps a held grip enabled and cancels the drag without moving the item", async () => {
    const onMoveTo = jest.fn();
    await render(<AppearanceProvider><PlanEditorReorderableRow count={3} label="Recovery"
      onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={onMoveTo} position={1} reorderId="cancelled">
      <Text>Recovery</Text>
    </PlanEditorReorderableRow></AppearanceProvider>);
    const gesture = getByGestureTestId("reorder-gesture-cancelled") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => { gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 100 }); });
    expect(screen.getByTestId("drag-cancelled")).toHaveProp("accessibilityState", { busy: true, disabled: false });
    await act(() => { gesture.handlers.onEnd({ translationY: 100 }, false); gesture.handlers.onFinalize({ translationY: 100 }, false); });
    expect(onMoveTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("reorder-row-cancelled")).toHaveStyle({ transform: [{ translateY: 0 }] });
  });

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
      { name: "increment", label: "Move earlier" },
      { name: "decrement", label: "Move later" },
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
    await fireEvent(handle, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    await fireEvent(handle, "keyDown", {
      nativeEvent: { key: " " },
    });

    expect(onMoveUp).not.toHaveBeenCalled();
    expect(onMoveDown).not.toHaveBeenCalled();
    expect(onMoveTo).toHaveBeenNthCalledWith(1, 0, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(2, 2, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(3, 0, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(4, 2, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(5, 2, "fallback");
    expect(onMoveTo).toHaveBeenNthCalledWith(6, 2, "fallback");
  });

});
