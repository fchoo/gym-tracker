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
  afterEach,
} from "@jest/globals";
import React from "react";
import { getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import * as Worklets from "react-native-worklets";
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
  afterEach(() => { jest.restoreAllMocks(); });
  it("publishes React previews only when the dragged row enters a new slot", async () => {
    const onDragPreview = jest.fn();
    const scheduleOnRN = jest.spyOn(Worklets, "scheduleOnRN");
    await render(<AppearanceProvider><PlanEditorReorderableRow count={3} label="Recovery"
      onMoveUp={jest.fn()} onMoveDown={jest.fn()} onDragPreview={onDragPreview} position={0} reorderId="slots">
      <Text>Recovery</Text>
    </PlanEditorReorderableRow></AppearanceProvider>);
    await fireEvent(screen.getByTestId("reorder-row-slots"), "layout", {
      nativeEvent: { layout: { height: 100, width: 320, x: 0, y: 0 } },
    });
    const gesture = getByGestureTestId("reorder-gesture-slots") as unknown as { handlers: {
      onStart(event: { translationY: number }): void;
      onUpdate(event: { translationY: number }): void;
    } };
    await act(() => { gesture.handlers.onStart({ translationY: 0 }); });
    const initialBridgeCalls = scheduleOnRN.mock.calls.length;
    await act(() => {
      for (const translationY of [1, 5, 10, 20, 30, 40, 49]) {
        gesture.handlers.onUpdate({ translationY });
      }
    });
    expect(scheduleOnRN).toHaveBeenCalledTimes(initialBridgeCalls);
    expect(onDragPreview).toHaveBeenCalledTimes(1);
    await act(() => {
      for (const translationY of [51, 60, 80, 99, 120, 149]) {
        gesture.handlers.onUpdate({ translationY });
      }
    });
    expect(scheduleOnRN).toHaveBeenCalledTimes(initialBridgeCalls + 1);
    expect(onDragPreview).toHaveBeenCalledTimes(2);
    expect(onDragPreview).toHaveBeenLastCalledWith(expect.objectContaining({ targetPosition: 1 }));
    scheduleOnRN.mockRestore();
  });

  it("holds the drop and neighbor positions until an async move settles and blocks another drop", async () => {
    let resolveMove!: () => void;
    const pendingMove = new Promise<void>((resolve) => { resolveMove = resolve; });
    const onMoveTo = jest.fn(() => pendingMove);
    function Rows() {
      const [preview, setPreview] = React.useState<import("../components/PlanEditorFields").PlanEditorReorderPreview | null>(null);
      return <AppearanceProvider>{[0, 1].map((position) => <PlanEditorReorderableRow
        key={position} count={2} label={`Row ${position}`} onDragPreview={setPreview}
        onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={onMoveTo} position={position}
        preview={preview} reorderId={`pending-${position}`}><Text>{`Row ${position}`}</Text>
      </PlanEditorReorderableRow>)}</AppearanceProvider>;
    }
    await render(<Rows />);
    await fireEvent(screen.getByTestId("reorder-row-pending-0"), "layout", {
      nativeEvent: { layout: { height: 100, width: 320, x: 0, y: 0 } },
    });
    const gesture = getByGestureTestId("reorder-gesture-pending-0") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => {
      gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 80 });
      gesture.handlers.onEnd({ translationY: 80 }, true); gesture.handlers.onFinalize({ translationY: 80 }, true);
    });
    expect(onMoveTo).toHaveBeenCalledTimes(1);
    expect(onMoveTo).toHaveBeenLastCalledWith(1, "drag");
    expect(screen.getByTestId("reorder-row-pending-0")).toHaveStyle({ transform: [{ translateY: 100 }] });
    expect(screen.getByTestId("reorder-row-pending-1")).toHaveStyle({ transform: [{ translateY: -100 }] });
    await act(() => {
      gesture.handlers.onEnd({ translationY: 80 }, true);
      gesture.handlers.onFinalize({ translationY: 80 }, false);
    });
    expect(onMoveTo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("reorder-row-pending-0")).toHaveStyle({ transform: [{ translateY: 100 }] });
    await act(() => { resolveMove(); });
    expect(screen.getByTestId("reorder-row-pending-0")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("reorder-row-pending-1")).toHaveStyle({ transform: [{ translateY: 0 }] });
  });

  it("restores a failed async drop and lets the row be dragged again", async () => {
    let rejectMove!: (error: Error) => void;
    const pendingMove = new Promise<void>((_resolve, reject) => { rejectMove = reject; });
    const onMoveTo = jest.fn<() => void | Promise<void>>().mockImplementationOnce(() => pendingMove);
    const onDragPreview = jest.fn();
    await render(<AppearanceProvider><PlanEditorReorderableRow count={2} label="Recovery"
      onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={onMoveTo} onDragPreview={onDragPreview}
      position={0} reorderId="failed"><Text>Recovery</Text></PlanEditorReorderableRow></AppearanceProvider>);
    const gesture = getByGestureTestId("reorder-gesture-failed") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => {
      gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 100 });
      gesture.handlers.onEnd({ translationY: 100 }, true); gesture.handlers.onFinalize({ translationY: 100 }, true);
    });
    expect(onDragPreview).not.toHaveBeenLastCalledWith(null);
    await act(() => { rejectMove(new Error("storage_failed")); });
    expect(onDragPreview).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("reorder-row-failed")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("drag-failed")).toHaveProp("accessibilityState", { busy: false, disabled: false });
    await act(() => {
      gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 100 });
      gesture.handlers.onEnd({ translationY: 100 }, true); gesture.handlers.onFinalize({ translationY: 100 }, true);
    });
    expect(onMoveTo).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("reorder-row-failed")).toHaveStyle({ transform: [{ translateY: 0 }] });
  });

  it("keeps a held grip enabled and cancels the drag without moving the item", async () => {
    const onMoveTo = jest.fn<() => void>();
    const onDragPreview = jest.fn();
    await render(<AppearanceProvider><PlanEditorReorderableRow count={3} label="Recovery"
      onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={onMoveTo} onDragPreview={onDragPreview} position={1} reorderId="cancelled">
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
    expect(onDragPreview).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("reorder-row-cancelled")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("drag-cancelled")).toHaveProp("accessibilityState", { busy: false, disabled: false });
  });

  it("cancels a drag with Escape and ignores its later successful end callback", async () => {
    const onMoveTo = jest.fn<() => void>();
    await render(<AppearanceProvider><PlanEditorReorderableRow count={2} label="Recovery"
      onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={onMoveTo} position={0} reorderId="escape">
      <Text>Recovery</Text>
    </PlanEditorReorderableRow></AppearanceProvider>);
    const gesture = getByGestureTestId("reorder-gesture-escape") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => { gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 100 }); });
    await fireEvent(screen.getByTestId("drag-escape"), "keyDown", { nativeEvent: { key: "Escape" } });
    await act(() => { gesture.handlers.onEnd({ translationY: 100 }, true); gesture.handlers.onFinalize({ translationY: 100 }, true); });
    expect(onMoveTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("reorder-row-escape")).toHaveStyle({ transform: [{ translateY: 0 }] });
  });

  it("keeps a labelled drag handle and bounded non-visual movement without visual position controls", async () => {
    const onMoveDown = jest.fn();
    const onMoveTo = jest.fn<() => void>();
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
