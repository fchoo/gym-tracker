import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { View } from "react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { AppearanceProvider } from "../theme";
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

});
