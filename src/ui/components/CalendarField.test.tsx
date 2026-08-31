import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import {
  AccessibilityInfo,
  Dimensions,
  StyleSheet,
} from "react-native";

import {
  calendarFieldMonthDirectionForHorizontalSwipe,
  CalendarField,
} from "./CalendarField";
import {
  AppearanceProvider,
} from "../theme";

async function renderCalendar(
  overrides: Partial<React.ComponentProps<typeof CalendarField>> = {},
) {
  const onChange = jest.fn();
  await render(
    <AppearanceProvider>
      <CalendarField
        label="Effective date"
        onChange={onChange}
        value="2028-02-28"
        {...overrides}
      />
    </AppearanceProvider>,
  );
  return { onChange };
}

async function setWindowDimensions(
  width: number,
  height: number,
  fontScale = 1,
) {
  await act(() => {
    Dimensions.set({
      screen: { fontScale, height, scale: 1, width },
      window: { fontScale, height, scale: 1, width },
    });
  });
}

describe("CalendarField", () => {
  beforeEach(async () => {
    await setWindowDimensions(800, 900);
  });

  it("keeps a LocalDate selection private until explicit confirmation", async () => {
    const { onChange } = await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2028-02-29",
    }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply Date" }))
      .toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Apply Date" }));

    expect(onChange).toHaveBeenCalledWith("2028-02-29");
  });

  it("cancels an in-calendar date without mutating its owner draft", async () => {
    const { onChange } = await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2028-02-29",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Keep Original Date" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("February 2028")).not.toBeOnTheScreen();
    expect(screen.getByText("2028-02-28")).toBeOnTheScreen();
  });

  it("uses a complete bounded adjacent-month grid and applies only its private draft", async () => {
    const { onChange } = await renderCalendar({
      maximumDate: "2028-03-01",
      minimumDate: "2028-02-28",
    });

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    expect(screen.getByRole("header", { name: "Select date" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Monday, 28 February 2028")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^calendar-day-/u)).toHaveLength(42);
    expect(screen.getByRole("button", {
      name: "Select 2028-01-30",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: true,
    }));
    expect(screen.getByRole("button", {
      name: "Select 2028-03-01",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: false,
    }));
    expect(screen.queryByTestId("calendar-grid-scroll")).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2028-03-01",
    }));

    expect(screen.getByText("March 2028")).toBeOnTheScreen();
    expect(screen.getByText("Wednesday, 1 March 2028")).toBeOnTheScreen();
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Apply Date" }));

    expect(onChange).toHaveBeenCalledWith("2028-03-01");
  });

  it("opens an allowed empty value without selecting its default date", async () => {
    const { onChange } = await renderCalendar({
      allowEmpty: true,
      defaultDate: "2028-02-28",
      maximumDate: "2028-02-29",
      minimumDate: "2028-02-28",
      value: "",
    });

    const trigger = screen.getByRole("button", { name: "Choose date" });
    expect(trigger).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: false,
    }));
    expect(screen.getByText("Choose date")).toBeOnTheScreen();

    await fireEvent.press(trigger);

    expect(screen.getByText("February 2028")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Select 2028-02-28" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: false,
        selected: false,
      }));
    expect(screen.getByRole("button", { name: "Select 2028-02-29" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: false,
        selected: false,
      }));
    expect(screen.getByRole("button", { name: "Select 2028-02-27" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    expect(screen.getByRole("button", { name: "Apply Date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2028-02-29",
    }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply Date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: false,
      }));

    await fireEvent.press(screen.getByRole("button", { name: "Apply Date" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2028-02-29");
  });

  it("keeps the empty seam closed without a safe default date", async () => {
    await renderCalendar({
      allowEmpty: true,
      defaultDate: "2028-02-30",
      value: "",
    });

    expect(screen.getByText("Enter a valid default YYYY-MM-DD date."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Choose date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("keeps empty values invalid unless the seam is explicitly enabled", async () => {
    await renderCalendar({
      defaultDate: "2028-02-28",
      value: "",
    });

    expect(screen.getByText("Enter a valid YYYY-MM-DD date."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("rejects an empty seam whose default is outside its bounds", async () => {
    await renderCalendar({
      allowEmpty: true,
      defaultDate: "2028-02-27",
      minimumDate: "2028-02-28",
      value: "",
    });

    expect(screen.getByText("Default date must be within calendar bounds."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Choose date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("allows an in-bounds selection when the initial value is out of bounds", async () => {
    const { onChange } = await renderCalendar({
      defaultDate: "2028-02-28",
      minimumDate: "2028-02-28",
      value: "2028-02-27",
    });

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    expect(screen.getByRole("button", { name: "Apply Date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));

    await fireEvent.press(screen.getByRole("button", {
      name: "Use Default Date",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Apply Date" }));

    expect(onChange).toHaveBeenCalledWith("2028-02-28");
  });

  it("fails closed when an empty seam receives a malformed bound", async () => {
    await renderCalendar({
      allowEmpty: true,
      defaultDate: "2028-02-28",
      minimumDate: "2028-02-30",
      value: "",
    });

    expect(screen.getByText("Calendar date bounds are invalid."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Choose date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("respects date bounds across leap years and month boundaries", async () => {
    await renderCalendar({
      maximumDate: "2028-03-01",
      minimumDate: "2028-02-28",
    });

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    expect(screen.getByRole("button", {
      name: "Select 2028-02-27",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: true,
    }));
    expect(screen.getByRole("button", {
      name: "Select 2028-02-29",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: false,
    }));

    await fireEvent.press(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByRole("button", {
      name: "Select 2028-03-02",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: true,
    }));
  });

  it("disables month traversal at the complete LocalDate civil range", async () => {
    await renderCalendar({ value: "0001-01-01" });

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));
    expect(screen.getByRole("button", { name: "Previous month" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("rejects invalid canonical values rather than coercing a JavaScript Date", async () => {
    await renderCalendar({ value: "2028-02-30" });

    expect(screen.getByText("Enter a valid YYYY-MM-DD date."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("exposes keyboard navigation, modal semantics, 48dp targets, and focus restoration", async () => {
    const setAccessibilityFocus = jest.fn();
    jest.spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation(setAccessibilityFocus);
    const { onChange } = await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    expect(screen.getByLabelText("Calendar dialog"))
      .toHaveProp("accessibilityViewIsModal", true);
    const selectedDay = screen.getByRole("button", {
      name: "Select 2028-02-28",
    });
    expect(selectedDay).toHaveProp("accessibilityState",
      expect.objectContaining({ selected: true }));
    expect(selectedDay).toHaveStyle({
      minHeight: 48,
      minWidth: 48,
    });
    expect(screen.getByTestId("calendar-month-actions"))
      .toHaveStyle({ flexWrap: "wrap" });
    expect(screen.getByTestId("calendar-grid"))
      .toHaveStyle({ flexWrap: "wrap" });
    expect(screen.getByTestId("calendar-confirm-actions"))
      .toHaveStyle({ flexWrap: "wrap" });

    await fireEvent(selectedDay, "keyDown", { nativeEvent: { key: "ArrowRight" } });
    expect(screen.getByLabelText("Calendar grid"))
      .toHaveProp("accessibilityValue", { text: "2028-02-29" });
    await fireEvent(screen.getByRole("button", { name: "Apply Date" }),
      "keyDown", { nativeEvent: { key: "Enter" } });

    expect(onChange).toHaveBeenCalledWith("2028-02-29");
    expect(setAccessibilityFocus).toHaveBeenCalled();
    expect(calendarFieldMonthDirectionForHorizontalSwipe(-96)).toBe(1);
    expect(calendarFieldMonthDirectionForHorizontalSwipe(96)).toBe(-1);
    expect(calendarFieldMonthDirectionForHorizontalSwipe(24)).toBeNull();
  });

  it("keeps every fixed-grid date present without requiring horizontal scrolling at 320dp", async () => {
    await setWindowDimensions(320, 568);
    await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    const grid = screen.getByTestId("calendar-grid");
    const day = screen.getByRole("button", { name: "Select 2028-02-28" });
    expect(grid).toHaveStyle({ alignSelf: "center", width: 336 });
    expect(day).toHaveStyle({
      height: 48,
      minHeight: 48,
      minWidth: 48,
      width: 48,
    });
    expect(screen.getByTestId("calendar-weekday-0"))
      .toHaveStyle({ minWidth: 48, width: 48 });
    expect(screen.getAllByTestId(/^calendar-day-/u)).toHaveLength(42);
    expect(screen.queryByTestId("calendar-grid-scroll")).not.toBeOnTheScreen();
    expect(screen.getByTestId("calendar-dialog"))
      .toHaveStyle({ padding: 8 });
    expect(screen.getByTestId("calendar-modal-scroll"))
      .toHaveProp("horizontal", false);
  });

  it("keeps actions reachable through vertical scrolling in short landscape", async () => {
    await setWindowDimensions(640, 320);
    await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    const modalScroll = screen.getByTestId("calendar-modal-scroll");
    expect(modalScroll).toHaveProp("keyboardShouldPersistTaps", "handled");
    expect(modalScroll).toHaveProp("showsVerticalScrollIndicator", true);
    expect(StyleSheet.flatten(modalScroll.props.contentContainerStyle))
      .toEqual(expect.objectContaining({
        flexGrow: 1,
        justifyContent: "flex-start",
      }));
    expect(screen.getByRole("button", { name: "Apply Date" }))
      .toBeOnTheScreen();
  });

  it("uses scroll-first layout and compact weekday labels at 200 percent text", async () => {
    await setWindowDimensions(360, 640, 2);
    await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    const modalScroll = screen.getByTestId("calendar-modal-scroll");
    expect(StyleSheet.flatten(modalScroll.props.contentContainerStyle))
      .toEqual(expect.objectContaining({ justifyContent: "flex-start" }));
    expect(screen.getByTestId("calendar-weekday-0"))
      .toHaveTextContent("S");
    expect(screen.getByRole("button", { name: "Select 2028-02-28" }))
      .toHaveStyle({ height: 48, minWidth: 48, width: 48 });
    expect(screen.getByRole("button", { name: "Apply Date" }))
      .toBeOnTheScreen();
  });

  it("fits the fixed seven-column grid without horizontal overflow at 360dp", async () => {
    await setWindowDimensions(360, 640);
    await renderCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));

    expect(screen.getByTestId("calendar-grid"))
      .toHaveStyle({ width: 336 });
    expect(screen.queryByTestId("calendar-grid-scroll")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Select 2028-02-28" }))
      .toHaveStyle({ height: 48, minWidth: 48, width: 48 });
  });
});
