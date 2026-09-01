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

import { M3FilterChip } from "./M3FilterChip";
import { AppearanceProvider, createMemoryAppearanceStore } from "../theme";

async function renderChip(
  chip: React.ReactNode,
  appearance: "System" | "Light" | "Dark" = "System",
) {
  const store = createMemoryAppearanceStore(
    appearance === "System" ? null : appearance,
  );

  return render(
    <AppearanceProvider reduceMotion store={store}>
      {chip}
    </AppearanceProvider>,
  );
}

describe("M3FilterChip", () => {
  it("communicates selected state without relying on colour and activates from touch and keyboard", async () => {
    const onPress = jest.fn();
    await renderChip(
      <M3FilterChip label="Strength" onPress={onPress} selected />,
    );

    const chip = screen.getByRole("checkbox", { name: "Strength selected" });
    expect(chip).toHaveProp("accessibilityState", {
      busy: false,
      checked: true,
      disabled: false,
      selected: true,
    });
    expect(screen.getByText("Selected")).toBeOnTheScreen();
    expect(chip.children[0])
      .toHaveProp("accessible", false);
    expect(chip).toHaveStyle({ minHeight: 48 });

    await fireEvent.press(chip);
    await fireEvent(chip, "keyDown", { nativeEvent: { key: "Enter" } });
    await fireEvent(chip, "keyDown", { nativeEvent: { key: " " } });

    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("uses outlined and filled approved-green star cues for Favorite state", async () => {
    const rendered = await renderChip(
      <M3FilterChip favorite label="Favorite" onPress={jest.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: "Favorite" }).children[0])
      .toHaveProp("fill", "none");
    expect(screen.getByRole("checkbox", { name: "Favorite" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        checked: false,
        selected: false,
      }));

    await rendered.rerender(
      <AppearanceProvider>
        <M3FilterChip favorite label="Favorite" onPress={jest.fn()} selected />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("checkbox", { name: "Favorite selected" }).children[0])
      .toHaveProp("fill", "#1F7A4D");
    expect(screen.getByRole("checkbox", { name: "Favorite selected" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        checked: true,
        selected: true,
      }));
    expect(screen.getByText("Selected")).toBeOnTheScreen();
  });

  it("exposes disabled and busy states while retaining a 48dp touch target", async () => {
    await renderChip(
      <M3FilterChip busy label="Equipment" onPress={jest.fn()} />,
    );

    const chip = screen.getByRole("checkbox", { name: "Equipment" });
    expect(chip).toHaveProp("accessibilityState", {
      busy: true,
      checked: false,
      disabled: true,
      selected: false,
    });
    expect(chip).toHaveStyle({ minHeight: 48, minWidth: 48 });
  });

  it.each(["System", "Light", "Dark"] as const)(
    "keeps focusable selected controls usable in %s appearance at 200 percent text",
    async (appearance) => {
      await renderChip(
        <M3FilterChip
          label="Long equipment filter label"
          onPress={jest.fn()}
          selected
        />,
        appearance,
      );

      const chip = screen.getByRole("checkbox", {
        name: "Long equipment filter label selected",
      });
      await fireEvent(chip, "focus");
      expect(chip).toHaveStyle({ outlineWidth: 2 });
      expect(chip).toHaveStyle({ minHeight: 48 });
    },
  );
});
