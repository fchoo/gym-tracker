import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import {
  RestAlertSettingsSheet,
} from "../components/RestAlertSettingsSheet";
import {
  AppearanceProvider,
} from "../theme";

describe("RestAlertSettingsSheet preference loading", () => {
  it("keeps switch-row geometry inert while loading and restores ready behavior", async () => {
    type SheetProps = React.ComponentProps<typeof RestAlertSettingsSheet>;
    const onChange = jest.fn<SheetProps["onChange"]>();
    const onClose = jest.fn<SheetProps["onClose"]>();
    const onOpenAppearance = jest.fn<SheetProps["onOpenAppearance"]>();
    const props = {
      notificationPermission: "granted" as const,
      onChange,
      onClose,
      onOpenAppearance,
      onOpenNotificationSettings:
        jest.fn<SheetProps["onOpenNotificationSettings"]>(),
      preferences: { soundEnabled: true, vibrationEnabled: false },
      visible: true,
    } satisfies React.ComponentProps<typeof RestAlertSettingsSheet>;
    const rendered = await render(
      <AppearanceProvider>
        <RestAlertSettingsSheet {...props} loading />
      </AppearanceProvider>,
    );

    const loadingStatus = screen.getByRole("progressbar", {
      name: "Loading rest alert settings",
    });
    expect(loadingStatus).toHaveProp("accessibilityLiveRegion", "polite");
    expect(loadingStatus).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ busy: true, disabled: true }),
    );
    for (const setting of ["sound", "vibration"]) {
      expect(screen.getByTestId(`rest-alert-${setting}-loading-row`, {
        includeHiddenElements: true,
      }))
        .toHaveStyle({ flexDirection: "row", minHeight: 48 });
      expect(screen.getByTestId(`rest-alert-${setting}-loading-switch`, {
        includeHiddenElements: true,
      })).toHaveStyle({ height: 32, width: 52 });
    }
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Appearance" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true }),
      );
    expect(screen.getByRole("button", { name: "Close rest alerts" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true }),
      );

    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    await fireEvent.press(screen.getByRole("button", { name: "Close rest alerts" }));
    expect(onOpenAppearance).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    await rendered.rerender(
      <AppearanceProvider>
        <RestAlertSettingsSheet {...props} loading={false} />
      </AppearanceProvider>,
    );

    expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ checked: true }),
      );
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ checked: false }),
      );
    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));
    expect(onChange).toHaveBeenCalledWith({
      soundEnabled: false,
      vibrationEnabled: false,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    await fireEvent.press(screen.getByRole("button", { name: "Close rest alerts" }));
    expect(onOpenAppearance).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears a failed save when a retry starts and remains clear after persistence", async () => {
    type SheetProps = React.ComponentProps<typeof RestAlertSettingsSheet>;
    let resolveRetry: ((result: {
      status: "persisted";
      preferences: { soundEnabled: boolean; vibrationEnabled: boolean };
    }) => void) | undefined;
    let attempt = 0;
    const onChange = jest.fn<SheetProps["onChange"]>(async () => {
      attempt += 1;
      if (attempt === 1) {
        return {
          status: "not_persisted" as const,
          preferences: { soundEnabled: true, vibrationEnabled: false },
        };
      }
      return new Promise((resolve) => {
        resolveRetry = resolve;
      });
    });
    const props = {
      notificationPermission: "granted" as const,
      onChange,
      onClose: jest.fn<SheetProps["onClose"]>(),
      onOpenAppearance: jest.fn<SheetProps["onOpenAppearance"]>(),
      onOpenNotificationSettings:
        jest.fn<SheetProps["onOpenNotificationSettings"]>(),
      preferences: { soundEnabled: true, vibrationEnabled: false },
      visible: true,
    } satisfies SheetProps;
    await render(
      <AppearanceProvider>
        <RestAlertSettingsSheet {...props} />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole("switch", { name: "Rest vibration" }));
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();

    resolveRetry?.({
      status: "persisted",
      preferences: { soundEnabled: true, vibrationEnabled: true },
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
    });
  });

  it("clears a stale save failure when the sheet cleanly reopens", async () => {
    type SheetProps = React.ComponentProps<typeof RestAlertSettingsSheet>;
    const props = {
      notificationPermission: "granted" as const,
      onChange: jest.fn<SheetProps["onChange"]>(async () => {
        throw new Error("preference_write_failed");
      }),
      onClose: jest.fn<SheetProps["onClose"]>(),
      onOpenAppearance: jest.fn<SheetProps["onOpenAppearance"]>(),
      onOpenNotificationSettings:
        jest.fn<SheetProps["onOpenNotificationSettings"]>(),
      preferences: { soundEnabled: true, vibrationEnabled: false },
      visible: true,
    } satisfies SheetProps;
    const rendered = await render(
      <AppearanceProvider>
        <RestAlertSettingsSheet {...props} />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("switch", { name: "Rest vibration" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeOnTheScreen());

    await rendered.rerender(
      <AppearanceProvider>
        <RestAlertSettingsSheet {...props} visible={false} />
      </AppearanceProvider>,
    );
    await rendered.rerender(
      <AppearanceProvider>
        <RestAlertSettingsSheet {...props} visible />
      </AppearanceProvider>,
    );

    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it("serializes optimistic writes and only rolls back the final failed choice", async () => {
    type SheetProps = React.ComponentProps<typeof RestAlertSettingsSheet>;
    const rejectWrites: Array<(error: Error) => void> = [];
    const onChange = jest.fn<SheetProps["onChange"]>(() => (
      new Promise((_, reject) => {
        rejectWrites.push(reject);
      })
    ));
    await render(
      <AppearanceProvider>
        <RestAlertSettingsSheet
          notificationPermission="granted"
          onChange={onChange}
          onClose={jest.fn<SheetProps["onClose"]>()}
          onOpenAppearance={jest.fn<SheetProps["onOpenAppearance"]>()}
          onOpenNotificationSettings={
            jest.fn<SheetProps["onOpenNotificationSettings"]>()
          }
          preferences={{ soundEnabled: true, vibrationEnabled: false }}
          visible
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));
    await fireEvent.press(screen.getByRole("switch", { name: "Rest vibration" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenNthCalledWith(1, {
      soundEnabled: false,
      vibrationEnabled: false,
    });
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));

    await act(async () => {
      rejectWrites[0]?.(new Error("first_write_failed"));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenNthCalledWith(2, {
      soundEnabled: false,
      vibrationEnabled: true,
    });
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));

    await act(async () => {
      rejectWrites[1]?.(new Error("second_write_failed"));
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeOnTheScreen();
      expect(screen.getByRole("switch", { name: "Rest sound" }))
        .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
      expect(screen.getByRole("switch", { name: "Rest vibration" }))
        .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    });
  });
});
