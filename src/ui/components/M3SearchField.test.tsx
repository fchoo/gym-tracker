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
import { TextInput } from "react-native";

import { M3SearchField } from "./M3SearchField";
import { AppearanceProvider, createMemoryAppearanceStore } from "../theme";

const stateCases: Array<[
  NonNullable<React.ComponentProps<typeof M3SearchField>["state"]>,
  string,
  string,
]> = [
  ["busy", "Searching Search plans", "Searching"],
  ["empty", "No Search plans results", "No plans match"],
  ["error", "Search plans search failed", "Search failed"],
  ["results", "3 Search plans results", "3 plans"],
];

function ControlledSearchField(
  props: Omit<React.ComponentProps<typeof M3SearchField>, "onChangeText" | "value"> &
    Readonly<{ initialValue?: string }>,
) {
  const [value, setValue] = React.useState(props.initialValue ?? "");

  return <M3SearchField {...props} onChangeText={setValue} value={value} />;
}

async function renderSearchField(
  children: React.ReactNode,
  appearance: "System" | "Light" | "Dark" = "System",
) {
  const store = createMemoryAppearanceStore(
    appearance === "System" ? null : appearance,
  );

  return render(
    <AppearanceProvider reduceMotion store={store}>
      {children}
    </AppearanceProvider>,
  );
}

describe("M3SearchField", () => {
  it("renders one labelled Search input with a hidden leading icon and a 48dp clear target only for a query", async () => {
    await renderSearchField(
      <ControlledSearchField label="Search exercises" initialValue="squat" />,
    );

    expect(screen.getByLabelText("Search exercises"))
      .toHaveProp("returnKeyType", "search");
    expect(screen.getByTestId("m3-search-field-control").children[0])
      .toHaveProp("accessible", false);
    expect(screen.getByRole("button", { name: "Clear search exercises" }))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });

    await fireEvent.changeText(screen.getByLabelText("Search exercises"), "");

    expect(screen.queryByRole("button", { name: "Clear search exercises" }))
      .toBeNull();
  });

  it("runs the owner-provided search action for IME Search and restores focus after clear", async () => {
    const onSearch = jest.fn();
    const focus = jest.spyOn(TextInput.prototype, "focus");
    await renderSearchField(
      <ControlledSearchField
        initialValue="squat"
        label="Search exercises"
        onSearch={onSearch}
      />,
    );

    const input = screen.getByLabelText("Search exercises");
    await fireEvent(input, "submitEditing");
    expect(onSearch).toHaveBeenCalledTimes(1);

    await fireEvent.press(
      screen.getByRole("button", { name: "Clear search exercises" }),
    );

    expect(screen.getByLabelText("Search exercises"))
      .toHaveProp("value", "");
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it.each(stateCases)(
    "exposes the %s slot through explicit accessible semantics",
    async (state, accessibilityLabel, content) => {
      await renderSearchField(
        <ControlledSearchField
          label="Search plans"
          resultCount={3}
          state={state}
          stateSlots={{ [state]: <>{content}</> }}
        />,
      );

      expect(screen.getByLabelText(accessibilityLabel)).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ busy: state === "busy" }),
      );
      expect(screen.getByText(content)).toBeOnTheScreen();
    },
  );

  it.each(["System", "Light", "Dark"] as const)(
    "keeps the controlled field usable in %s appearance at 200 percent text",
    async (appearance) => {
      await renderSearchField(
        <ControlledSearchField
          initialValue="long exercise label"
          label="Search plan exercises"
        />,
        appearance,
      );

      expect(screen.getByLabelText("Search plan exercises"))
        .toHaveProp("value", "long exercise label");
      expect(screen.getByTestId("m3-search-field-control"))
        .toHaveStyle({ minHeight: 48 });
    },
  );
});
