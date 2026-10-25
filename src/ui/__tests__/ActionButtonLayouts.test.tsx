import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text, type TextStyle } from "react-native";

import { ActionLabel } from "../components/ActionLabel";
import { ActionRow, FocusablePressable, PrimaryAction, SecondaryAction } from "../components";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { WorkoutActionDock } from "../components/WorkoutActionDock";
import { AppearanceProvider, typeScale } from "../theme";

function labelContainer(label: string) {
  return screen.getByText(label).parent!;
}

describe("action labels and related decisions", () => {
  it("keeps related actions in equal cells while retaining targets and full names", async () => {
    const cancel = jest.fn(), save = jest.fn();
    await render(<AppearanceProvider><ActionRow testID="decisions">
      <SecondaryAction label="Return to Workout" visibleLabel="Back" onPress={cancel} />
      <PrimaryAction label="Save committed set edit" visibleLabel="Save edit" onPress={save} />
    </ActionRow></AppearanceProvider>);
    expect(screen.getByTestId("decisions")).toHaveStyle({ flexDirection: "row", flexWrap: "nowrap" });
    const back = screen.getByRole("button", { name: "Return to Workout" });
    const submit = screen.getByRole("button", { name: "Save committed set edit" });
    expect(back.parent).toHaveStyle({ flexGrow: 1, flexBasis: 0, minWidth: 48 });
    expect(submit.parent).toHaveStyle({ flexGrow: 1, flexBasis: 0, minWidth: 48 });
    expect(back).toHaveStyle({ minHeight: 48 });
    expect(submit).toHaveStyle({ minHeight: 56 });
    expect(screen.getByText("Save edit")).toHaveProp("numberOfLines", 1);
    expect(screen.getByText("Save edit")).toHaveStyle(typeScale.sectionTitle as TextStyle);
    expect(screen.getByText("Save edit").props.allowFontScaling).not.toBe(false);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    await fireEvent.press(back);
    await fireEvent.press(submit);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("uses actual native text width to keep a full caption that fits", async () => {
    await render(<ActionLabel label="Add exercise" color="#000000" />);
    const container = labelContainer("Add exercise");
    await fireEvent(container, "layout", { nativeEvent: { layout: { width: 100 } } });
    expect(screen.getByText("Add")).toBeOnTheScreen();
    const measurement = screen.getByText("Add exercise", { includeHiddenElements: true });
    await fireEvent(measurement, "textLayout", { nativeEvent: { lines: [{ width: 96 }] } });
    expect(screen.getByText("Add exercise")).toBeOnTheScreen();
  });

  it("uses a save glyph when scaled text exceeds the cell, without truncating meaning or changing activation", async () => {
    const save = jest.fn();
    await render(<AppearanceProvider><PrimaryAction label="Save set values" onPress={save} /></AppearanceProvider>);
    const container = labelContainer("Save set values");
    await fireEvent(container, "layout", { nativeEvent: { layout: { width: 48 } } });
    const compactMeasurement = screen.getAllByText("Save", { includeHiddenElements: true }).at(-1)!;
    await fireEvent(compactMeasurement, "textLayout", { nativeEvent: { lines: [{ width: 80 }] } });
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.queryByText("Save set values")).toBeNull();
    expect(screen.getByText("Save", { includeHiddenElements: true }).props.allowFontScaling).not.toBe(false);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Save set values" }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps both dock cells proportional without wrapping and preserves the completion identity", async () => {
    await render(<AppearanceProvider><WorkoutActionDock completeLabel="Complete Set 1" onAddExercise={jest.fn()} onComplete={jest.fn()} state="ready" /></AppearanceProvider>);
    expect(screen.getByTestId("workout-action-dock")).toHaveStyle({ flexWrap: "nowrap" });
    const add = screen.getByRole("button", { name: "Add exercise" });
    const complete = screen.getByRole("button", { name: "Complete Set 1" });
    expect(add.parent).toHaveStyle({ flexBasis: 0, flexGrow: 1, minWidth: 128 });
    expect(complete.parent).toHaveStyle({ flexBasis: 0, flexGrow: 1, minWidth: 128 });
  });

  it("flattens conditional fragments into three confirmation actions and disables them during submission", async () => {
    const confirm = jest.fn(), cancel = jest.fn(), discard = jest.fn();
    const tree = (busy = false) => <AppearanceProvider><ConfirmationDialog
      alternateLabel="Discard changes" body="Choose what to do with your edits." cancelLabel="Keep editing"
      confirmBusy={busy} confirmLabel="Save changes" heading="Save changes?" onAlternate={discard} onCancel={cancel} onConfirm={confirm} visible
    /></AppearanceProvider>;
    const result = await render(tree());
    const keep = screen.getByRole("button", { name: "Keep editing" });
    const alternate = screen.getByRole("button", { name: "Discard changes" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(keep.parent?.parent).toHaveStyle({ flexDirection: "row", flexWrap: "nowrap" });
    expect(alternate.parent?.parent).toBe(keep.parent?.parent);
    expect(save.parent?.parent).toBe(keep.parent?.parent);
    await result.rerender(tree(true));
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it("keeps value-bearing date triggers outside the action caption policy", async () => {
    await render(<AppearanceProvider><FocusablePressable accessibilityLabel="Start date" accessibilityRole="button" onPress={jest.fn()}>
      <Text>2026-08-18</Text>
    </FocusablePressable></AppearanceProvider>);
    expect(screen.getByRole("button", { name: "Start date" })).toHaveTextContent("2026-08-18");
    expect(screen.getByText("2026-08-18").props.numberOfLines).toBeUndefined();
  });

  it("applies the same one-line policy to custom caption-only commands", async () => {
    const retry = jest.fn();
    await render(<AppearanceProvider><FocusablePressable accessibilityLabel="Retry loading history" accessibilityRole="button" onPress={retry}>
      <Text style={typeScale.bodyStrong as TextStyle}>Retry loading history</Text>
    </FocusablePressable></AppearanceProvider>);
    expect(screen.getByText("Retry loading history")).toHaveProp("numberOfLines", 1);
    expect(screen.getByText("Retry loading history")).toHaveStyle(typeScale.bodyStrong as TextStyle);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Retry loading history" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
