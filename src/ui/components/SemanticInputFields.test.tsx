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

import { SemanticNumberField } from "./SemanticNumberField";
import { TimeDurationField } from "./TimeDurationField";
import { AppearanceProvider } from "../theme";

async function renderField(children: React.ReactNode) {
  await render(<AppearanceProvider>{children}</AppearanceProvider>);
}

function ControlledNumberField(
  props: Omit<React.ComponentProps<typeof SemanticNumberField>, "onChangeText">,
) {
  const [value, setValue] = React.useState(props.value);
  return <SemanticNumberField {...props} onChangeText={setValue} value={value} />;
}

describe("SemanticNumberField", () => {
  it("keeps blank and zero distinct while requesting the integer keypad", async () => {
    const onChangeText = jest.fn();
    await renderField(
      <ControlledNumberField
        kind="integer"
        label="Planned rounds"
        value=""
      />,
    );

    const input = screen.getByLabelText("Planned rounds");
    expect(input).toHaveProp("keyboardType", "number-pad");
    expect(input).toHaveProp("value", "");

    await fireEvent.changeText(input, "0");
    expect(screen.getByLabelText("Planned rounds"))
      .toHaveProp("value", "0");
  });

  it("uses a locale-independent decimal keypad and reports bounded precision errors", async () => {
    await renderField(
      <ControlledNumberField
        kind="decimal"
        label="Load (kg)"
        maximum={250}
        minimum={0}
        precision={1}
        value="20"
      />,
    );

    const input = screen.getByLabelText("Load (kg)");
    expect(input).toHaveProp("keyboardType", "decimal-pad");
    await fireEvent.changeText(input, "20,5");
    await fireEvent(input, "blur");
    expect(screen.getByText("Enter a valid decimal value."))
      .toBeOnTheScreen();

    await fireEvent.changeText(input, "20.55");
    await fireEvent(input, "blur");
    expect(screen.getByText("Use at most 1 decimal place."))
      .toBeOnTheScreen();

    await fireEvent.changeText(input, "251");
    await fireEvent(input, "blur");
    expect(screen.getByText("Enter a value no greater than 250."))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("Load (kg)"))
      .toHaveProp("value", "251");
  });
});

describe("TimeDurationField", () => {
  it("keeps an empty draft blank until confirmed and exposes an accessible 48dp trigger", async () => {
    const onChangeText = jest.fn();
    await renderField(
      <TimeDurationField
        label="Rest (seconds)"
        onChangeText={onChangeText}
        value=""
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Rest (seconds)",
    });
    expect(trigger).toHaveProp("accessibilityHint",
      "Opens a time-style duration selector.");
    expect(trigger).toHaveStyle({ minHeight: 48 });
    expect(screen.getByText("Not set")).toBeOnTheScreen();
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it("commits segmented hours, minutes, and decimal seconds only after confirmation", async () => {
    const onChangeText = jest.fn();
    await renderField(
      <TimeDurationField
        label="Target duration seconds"
        onChangeText={onChangeText}
        value="45.5"
      />,
    );

    await fireEvent.press(screen.getByRole("button", {
      name: "Target duration seconds",
    }));
    expect(screen.getByLabelText("Target duration seconds hours"))
      .toHaveProp("keyboardType", "number-pad");
    expect(screen.getByLabelText("Target duration seconds seconds"))
      .toHaveProp("keyboardType", "decimal-pad");

    await fireEvent.changeText(
      screen.getByLabelText("Target duration seconds minutes"),
      "1",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Target duration seconds seconds"),
      "15.5",
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Confirm target duration seconds",
    }));

    expect(onChangeText).toHaveBeenCalledWith("75.5");
  });

  it("cancels without mutating the draft and restores focus to the trigger", async () => {
    const onChangeText = jest.fn();
    await renderField(
      <TimeDurationField
        label="Default rest seconds"
        onChangeText={onChangeText}
        value="90"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Default rest seconds",
    });
    await fireEvent.press(trigger);
    await fireEvent.changeText(
      screen.getByLabelText("Default rest seconds seconds"),
      "15",
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Cancel default rest seconds",
    }));

    expect(onChangeText).not.toHaveBeenCalled();
    expect(trigger).toHaveProp("accessible", true);
  });
});
