import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { View } from "react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { AppearanceProvider, themes } from "../theme";
import { NavigationRow } from "./NavigationRow";

describe("NavigationRow", () => {
  it("keeps state ownership with its caller while exposing one accessible full-row action", async () => {
    const onPress = jest.fn();
    await render(<AppearanceProvider><NavigationRow title="Export CSV" supportingText="Readable spreadsheet file." accessibilityHint="Creates a readable spreadsheet file" icon="download" onPress={onPress} /></AppearanceProvider>);
    const row = screen.getByRole("button", { name: "Export CSV" });
    expect(row.props.accessibilityHint).toBe("Creates a readable spreadsheet file");
    await fireEvent.press(row);
    await fireEvent(row, "keyDown", { nativeEvent: { key: "Enter" } });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("forwards one stable row ref while preserving busy, wrapping, and decorative-chevron semantics", async () => {
    const ref = React.createRef<View>();
    const onPress = jest.fn();
    const rendered = await render(
      <AppearanceProvider>
        <NavigationRow
          ref={ref}
          supportingText="This long supporting copy remains available instead of truncating."
          title="Restore Library filter"
          onPress={onPress}
        />
      </AppearanceProvider>,
    );

    const title = rendered.getByText("Restore Library filter");
    const row = title.parent?.parent;
    expect(ref.current).not.toBeNull();
    expect(row).toHaveStyle({ minHeight: 48 });
    expect(rendered.getByText(/This long supporting copy/).props.numberOfLines).toBeUndefined();
    expect(rendered.queryByLabelText("Chevron right")).not.toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <NavigationRow
          ref={ref}
          busy
          supportingText="Restoring the same retained filter."
          title="Restore Library filter"
          onPress={onPress}
        />
      </AppearanceProvider>,
    );
    expect(ref.current).not.toBeNull();
    expect(rendered.getByText("Restore Library filter").parent?.parent).toBeDisabled();
  });

  it("keeps compact actions at 48dp while exposing Phase 17 collection variants", async () => {
    const rendered = await render(<AppearanceProvider><><NavigationRow density="collection" onPress={jest.fn()} title="Running plan" /><NavigationRow density="activePlan" onPress={jest.fn()} title="Active Running plan" /></></AppearanceProvider>);
    expect(rendered.getByText("Running plan").parent?.parent).toHaveStyle({ minHeight: 88 });
    expect(rendered.getByText("Active Running plan").parent?.parent).toHaveStyle({ minHeight: 120 });
  });

  it("clears the blue border after touch and mouse actions while keeping keyboard focus visible", async () => {
    const onPress = jest.fn();
    await render(<AppearanceProvider><NavigationRow title="Plan settings" onPress={onPress} /></AppearanceProvider>);
    const row = screen.getByRole("button", { name: "Plan settings" });
    await fireEvent(row, "keyDown", { nativeEvent: { key: "Tab" } });
    await fireEvent(row, "focus");
    expect(row).toHaveStyle({ borderColor: themes.light.focusRing });
    await fireEvent(row, "touchStart", { nativeEvent: {} });
    await fireEvent.press(row);
    await fireEvent(row, "focus");
    expect(row).toHaveStyle({ borderColor: themes.light.divider });
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(row, "keyDown", { nativeEvent: { key: "Enter" } });
    expect(row).toHaveStyle({ borderColor: themes.light.focusRing });
    expect(onPress).toHaveBeenCalledTimes(2);
    await fireEvent(row, "pointerDown", { nativeEvent: { pointerType: "mouse" } });
    await fireEvent(row, "focus");
    expect(row).toHaveStyle({ borderColor: themes.light.divider });
  });

});
