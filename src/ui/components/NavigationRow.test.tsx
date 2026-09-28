import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { describe, expect, it, jest } from "@jest/globals";

import { AppearanceProvider } from "../theme";
import { NavigationRow } from "./NavigationRow";

describe("NavigationRow", () => {
  it("keeps state ownership with its caller while exposing one accessible full-row action", async () => {
    const onPress = jest.fn();
    await render(<AppearanceProvider><NavigationRow title="Export CSV" supportingText="Readable spreadsheet file." accessibilityHint="Creates a readable spreadsheet file" icon="download" onPress={onPress} /></AppearanceProvider>);
    const row = screen.getByRole("button", { name: "Export CSV" });
    expect(row.props.accessibilityHint).toBe("Creates a readable spreadsheet file");
    fireEvent.press(row);
    fireEvent(row, "keyDown", { nativeEvent: { key: "Enter" } });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

});
