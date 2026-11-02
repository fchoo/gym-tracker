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
import * as Reanimated from "react-native-reanimated";
import {
  Text,
} from "react-native";

import {
  PlanEditorReorderableRow,
} from "../components/PlanEditorFields";
import {
  AppearanceProvider,
  sizes,
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

  it("treats controlled null as cleared even before the move promise settles", async () => {
    let clearPreview!: () => void;
    let resolveMove!: () => void;
    const pendingMove = new Promise<void>((resolve) => { resolveMove = resolve; });
    function Rows() {
      const [preview, setPreview] = React.useState<import("../components/PlanEditorFields").PlanEditorReorderPreview | null>(null);
      clearPreview = () => { setPreview(null); };
      return <AppearanceProvider>{[0, 1].map((position) => <PlanEditorReorderableRow
        key={position} count={2} label={`Row ${position}`} onDragPreview={setPreview}
        onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={() => pendingMove} position={position}
        preview={preview} reorderId={`controlled-${position}`}><Text>{`Row ${position}`}</Text>
      </PlanEditorReorderableRow>)}</AppearanceProvider>;
    }
    await render(<Rows />);
    await fireEvent(screen.getByTestId("reorder-row-controlled-0"), "layout", {
      nativeEvent: { layout: { height: 100, width: 320, x: 0, y: 0 } },
    });
    const gesture = getByGestureTestId("reorder-gesture-controlled-0") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => {
      gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 80 });
      gesture.handlers.onEnd({ translationY: 80 }, true); gesture.handlers.onFinalize({ translationY: 80 }, true);
    });
    expect(screen.getByTestId("reorder-row-controlled-0")).toHaveStyle({ transform: [{ translateY: 100 }] });
    await act(() => { clearPreview(); });
    expect(screen.getByTestId("reorder-row-controlled-0")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("reorder-row-controlled-1")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("drag-controlled-0")).toHaveProp("accessibilityState", { busy: false, disabled: false });
    await act(() => { resolveMove(); });
  });

  it.each(["success", "failure"] as const)("keeps the shared drop offset while the old controlled preview remains rendered after %s", async (outcome) => {
    const sharedValues: Array<{ value: unknown; writes: unknown[] }> = [];
    const originalUseSharedValue = Reanimated.useSharedValue;
    jest.spyOn(Reanimated, "useSharedValue").mockImplementation((initial) => {
      const shared = originalUseSharedValue(initial);
      React.useMemo(() => {
        let value = shared.value;
        const writes: unknown[] = [];
        Object.defineProperty(shared, "value", {
          get: () => value,
          set: (next) => { writes.push(next); value = next; },
          configurable: true,
        });
        sharedValues.push({ get value() { return shared.value; }, writes });
      }, [shared]);
      return shared;
    });
    let commitPreview!: () => void;
    let resolveMove!: () => void;
    let rejectMove!: (error: Error) => void;
    const pendingMove = new Promise<void>((resolve, reject) => { resolveMove = resolve; rejectMove = reject; });
    const onMoveTo = jest.fn(() => pendingMove);
    const onClearPreview = jest.fn();
    function Row() {
      const [preview, setPreview] = React.useState<import("../components/PlanEditorFields").PlanEditorReorderPreview | null>(null);
      commitPreview = () => { setPreview(null); };
      return <AppearanceProvider><PlanEditorReorderableRow count={2} label="Source" position={0}
        onDragPreview={(next) => { if (next !== null) setPreview(next); else onClearPreview(); }}
        onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={onMoveTo}
        preview={preview} reorderId="handoff"><Text>Source</Text></PlanEditorReorderableRow></AppearanceProvider>;
    }
    await render(<Row />);
    await fireEvent(screen.getByTestId("reorder-row-handoff"), "layout", {
      nativeEvent: { layout: { height: 100, width: 320, x: 0, y: 0 } },
    });
    const gesture = getByGestureTestId("reorder-gesture-handoff") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => {
      gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 80 });
      gesture.handlers.onEnd({ translationY: 80 }, true); gesture.handlers.onFinalize({ translationY: 80 }, true);
    });
    const translation = sharedValues[0]!;
    expect(translation.value).toBe(100);
    translation.writes.length = 0;
    await act(() => { if (outcome === "success") resolveMove(); else rejectMove(new Error("storage_failed")); });
    expect(onClearPreview).toHaveBeenCalledTimes(1);
    expect(translation.writes).toEqual([]);
    expect(translation.value).toBe(100);
    expect(screen.getByTestId("drag-handoff")).toHaveProp("accessibilityState", { busy: true, disabled: false });
    expect(screen.getByTestId("reorder-row-handoff")).toHaveStyle({ transform: [{ translateY: 100 }] });
    await act(() => { gesture.handlers.onFinalize({ translationY: 80 }, false); });
    expect(translation.writes).toEqual([]);
    expect(translation.value).toBe(100);
    await act(() => { commitPreview(); });
    expect(translation.writes).toEqual([]);
    expect(translation.value).toBe(100);
    expect(screen.getByTestId("reorder-row-handoff")).toHaveStyle({ transform: [{ translateY: 0 }] });
    await act(() => { gesture.handlers.onStart({ translationY: 0 }); });
    expect(translation.writes).toEqual([0]);
    expect(translation.value).toBe(0);
  });

  it("preserves the focused accessibility handle when a void move callback changes its position", async () => {
    function Rows() {
      const [order, setOrder] = React.useState(["source", "neighbor"]);
      return <AppearanceProvider>{order.map((id, position) => <PlanEditorReorderableRow
        key={id} count={2} label={id} onMoveUp={jest.fn()} onMoveDown={jest.fn()}
        onMoveTo={(target) => {
          const next = [...order];
          next.splice(position, 1); next.splice(target, 0, id);
          setOrder(next);
        }} position={position} reorderId={`focus-${id}`}><Text>{id}</Text>
      </PlanEditorReorderableRow>)}</AppearanceProvider>;
    }
    await render(<Rows />);
    const handle = screen.getByTestId("drag-focus-source");
    await fireEvent(handle, "focus");
    expect(handle).toHaveStyle({ outlineWidth: sizes.focusRing });
    await fireEvent(handle, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(screen.getAllByTestId(/^reorder-row-focus-/u).map(({ props }) => props.testID))
      .toEqual(["reorder-row-focus-neighbor", "reorder-row-focus-source"]);
    expect(screen.getByTestId("drag-focus-source")).toBe(handle);
    expect(screen.getByTestId("drag-focus-source")).toHaveStyle({ outlineWidth: sizes.focusRing });
  });

  it("clears committed offsets while preserving the row, handle and animated owner", async () => {
    const styleMounts: Array<Readonly<{ owner: symbol; initial: unknown }>> = [];
    const detachedStyleOwners: symbol[] = [];
    const mockedUseAnimatedStyle = Reanimated.useAnimatedStyle;
    jest.spyOn(Reanimated, "useAnimatedStyle").mockImplementation((updater, dependencies) => {
      const owner = React.useRef(Symbol("animated-row")).current;
      React.useEffect(() => {
        styleMounts.push({ owner, initial: updater() });
        return () => { detachedStyleOwners.push(owner); };
      }, []);
      return mockedUseAnimatedStyle(updater, dependencies);
    });
    let commitOrder!: () => void;
    let resolveMove!: () => void;
    const pendingMove = new Promise<void>((resolve) => { resolveMove = resolve; });
    function Rows() {
      const [order, setOrder] = React.useState(["source", "neighbor"]);
      const [preview, setPreview] = React.useState<import("../components/PlanEditorFields").PlanEditorReorderPreview | null>(null);
      commitOrder = () => { setOrder(["neighbor", "source"]); setPreview(null); };
      return <AppearanceProvider>{order.map((id, position) => <PlanEditorReorderableRow
        key={id} count={2} label={id} onDragPreview={setPreview}
        onMoveUp={jest.fn()} onMoveDown={jest.fn()} onMoveTo={() => pendingMove} position={position}
        preview={preview} reorderId={`commit-${id}`}><Text>{id}</Text>
      </PlanEditorReorderableRow>)}</AppearanceProvider>;
    }
    await render(<Rows />);
    const originalSourceRow = screen.getByTestId("reorder-row-commit-source");
    const originalNeighborRow = screen.getByTestId("reorder-row-commit-neighbor");
    const originalHandle = screen.getByTestId("drag-commit-source");
    const originalStyleOwners = styleMounts.map(({ owner }) => owner);
    await fireEvent(screen.getByTestId("reorder-row-commit-source"), "layout", {
      nativeEvent: { layout: { height: 100, width: 320, x: 0, y: 0 } },
    });
    const gesture = getByGestureTestId("reorder-gesture-commit-source") as unknown as { handlers: {
      onStart(event: { translationY: number }): void; onUpdate(event: { translationY: number }): void;
      onEnd(event: { translationY: number }, success: boolean): void; onFinalize(event: { translationY: number }, success: boolean): void;
    } };
    await act(() => {
      gesture.handlers.onStart({ translationY: 0 }); gesture.handlers.onUpdate({ translationY: 80 });
      gesture.handlers.onEnd({ translationY: 80 }, true); gesture.handlers.onFinalize({ translationY: 80 }, true);
    });
    expect(screen.getByTestId("reorder-row-commit-source")).toHaveStyle({ transform: [{ translateY: 100 }] });
    expect(screen.getByTestId("reorder-row-commit-neighbor")).toHaveStyle({ transform: [{ translateY: -100 }] });
    expect(screen.getByTestId("reorder-row-commit-source")).toBe(originalSourceRow);
    expect(screen.getByTestId("reorder-row-commit-neighbor")).toBe(originalNeighborRow);
    expect(detachedStyleOwners).toEqual([]);
    const withTiming = jest.spyOn(Reanimated, "withTiming");
    await act(() => { commitOrder(); });
    expect(screen.getAllByTestId(/^reorder-row-commit-/u).map(({ props }) => props.testID))
      .toEqual(["reorder-row-commit-neighbor", "reorder-row-commit-source"]);
    expect(screen.getByTestId("reorder-row-commit-source")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("reorder-row-commit-neighbor")).toHaveStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByTestId("reorder-row-commit-source")).toBe(originalSourceRow);
    expect(screen.getByTestId("reorder-row-commit-neighbor")).toBe(originalNeighborRow);
    expect(screen.getByTestId("drag-commit-source")).toBe(originalHandle);
    expect(detachedStyleOwners).toEqual([]);
    expect(styleMounts.map(({ owner }) => owner)).toEqual(originalStyleOwners);
    expect(withTiming).not.toHaveBeenCalled();
    await act(() => { resolveMove(); });
    expect(withTiming).not.toHaveBeenCalled();
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
