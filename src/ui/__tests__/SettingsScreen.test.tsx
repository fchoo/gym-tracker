import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import { useExactRestAlarmAccess } from "../../bootstrap/useExactRestAlarmAccess";

jest.mock("../../bootstrap/useExactRestAlarmAccess", () => ({ useExactRestAlarmAccess: jest.fn() }));
const preciseAlerts = jest.mocked(useExactRestAlarmAccess);

import {
  AppSettingsContent,
  SettingsScreen,
  type SettingsScreenProps,
} from "../screens/SettingsScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  sizes,
} from "../theme";

function createProps(
  overrides: Partial<SettingsScreenProps> = {},
): SettingsScreenProps {
  const onBack = jest.fn<SettingsScreenProps["onBack"]>();
  const onChangeRestAlertPreferences = jest.fn<
    SettingsScreenProps["onChangeRestAlertPreferences"]
  >(async (preferences) => ({
    status: "persisted" as const,
    preferences,
  }));
  const onOpenNotificationSettings = jest.fn<
    SettingsScreenProps["onOpenNotificationSettings"]
  >();
  return {
    notificationPermission: "granted",
    onBack,
    onChangeRestAlertPreferences,
    onOpenDataAndRecovery: jest.fn(),
    onOpenNotificationSettings,
    onOpenRemovedSessions: jest.fn(),
    preferences: { soundEnabled: true, vibrationEnabled: false },
    restAlertPreferencesLoading: false,
    ...overrides,
  };
}

function renderScreen(
  props: SettingsScreenProps,
  appearanceStore = createMemoryAppearanceStore(),
) {
  return render(
    <AppearanceProvider store={appearanceStore}>
      <SettingsScreen {...props} />
    </AppearanceProvider>,
  );
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    preciseAlerts.mockReturnValue({ access: "not_required", opening: false, openFailed: false, refreshFailed: false, retryRefresh: jest.fn(async () => undefined), openSettings: jest.fn(async () => undefined) });
  });

  it("offers precise alarm access explicitly without changing sound or vibration preferences", async () => {
    const openSettings = jest.fn(async () => undefined);
    preciseAlerts.mockReturnValue({ access: "denied", opening: false, openFailed: false, refreshFailed: false, retryRefresh: jest.fn(async () => undefined), openSettings });
    const refresh = jest.fn(async () => undefined);
    const props = createProps({ onRefreshPreciseRestAlarms: refresh });
    await renderScreen(props);
    expect(screen.getByText("Precise background alerts")).toBeOnTheScreen();
    expect(openSettings).not.toHaveBeenCalled();
    const action = screen.getByRole("button", { name: "Allow precise rest alerts" });
    expect(action).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(action);
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(props.onChangeRestAlertPreferences).not.toHaveBeenCalled();
    expect(preciseAlerts).toHaveBeenCalledWith(undefined, refresh);
  });

  it("shows granted precise access without another permission action", async () => {
    preciseAlerts.mockReturnValue({ access: "allowed", opening: false, openFailed: false, refreshFailed: false, retryRefresh: jest.fn(async () => undefined), openSettings: jest.fn(async () => undefined) });
    await renderScreen(createProps());
    expect(screen.getByText("Allowed. Rest completion alerts can use Android's precise alarms.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Allow precise rest alerts" })).not.toBeOnTheScreen();
  });

  it("offers retry when pending precise alarms could not be refreshed", async () => {
    const retryRefresh = jest.fn(async () => undefined);
    preciseAlerts.mockReturnValue({ access: "allowed", opening: false, openFailed: false, refreshFailed: true, retryRefresh, openSettings: jest.fn(async () => undefined) });
    await renderScreen(createProps());
    expect(screen.getByText("Pending rest alerts could not be updated. Your timer stays accurate.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry precise rest alerts" }));
    expect(retryRefresh).toHaveBeenCalledTimes(1);
  });

  it("shares the App Settings content tree between its route wrapper and sheet host", async () => {
    const props = createProps();
    await render(
      <AppearanceProvider>
        <AppSettingsContent {...props} />
      </AppearanceProvider>,
    );

    expect(screen.getByText(
      "Appearance applies to all four destinations, Active Workout, Garmin, sheets, dialogs, and recovery routes.",
    )).toBeOnTheScreen();
    const headings = screen.getAllByRole("header").map((node) => (
      node.props.accessibilityLabel ?? node.props.children
    ));
    expect(headings).toEqual([
      "Appearance",
      "Dates and times",
      "Rest alerts",
      "History and data",
      "Data and recovery",
    ]);
    expect(screen.queryByRole("button", { name: "Go back" }))
      .not.toBeOnTheScreen();
  });

  it("renders the locked hierarchy with persisted top-level appearance radios and accessible rows", async () => {
    const appearanceStore = createMemoryAppearanceStore();
    await renderScreen(createProps(), appearanceStore);

    expect(screen.getByRole("header", { name: "App Settings" }))
      .toBeOnTheScreen();
    const expectedHeadings = [
      "App Settings",
      "Appearance",
      "Dates and times",
      "Rest alerts",
      "History and data",
      "Data and recovery",
    ];
    expect(screen.getAllByRole("header")).toHaveLength(expectedHeadings.length);
    for (const heading of expectedHeadings) {
      expect(screen.getByRole("header", { name: heading })).toBeOnTheScreen();
    }
    expect(screen.getByTestId("settings-appearance-group"))
      .toHaveProp("accessibilityRole", "radiogroup");
    expect(screen.getByRole("radio", { name: "System" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: true }),
      );
    for (const option of ["System", "Light", "Dark"]) {
      expect(screen.getByRole("radio", { name: option }))
        .toHaveStyle({ minHeight: 48 });
    }

    await fireEvent(screen.getByRole("radio", { name: "System" }), "focus");
    expect(screen.getByRole("radio", { name: "System" }))
      .toHaveStyle({ outlineWidth: sizes.focusRing });

    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(appearanceStore.read()).toBe("Dark");
    expect(screen.getByRole("radio", { name: "Dark" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: true, checked: true }),
      );

    expect(screen.getByText(
      "Plays two short beeps at 2 and 1 seconds, then a longer beep when rest ends.",
    )).toBeOnTheScreen();
    expect(screen.getByText(
      "Restore a completed workout that was removed from ordinary history.",
    )).toBeOnTheScreen();
    expect(screen.getByText(
      "Automatic Google Drive backup and manual recovery tools are available here.",
    )).toBeOnTheScreen();

    for (const name of [
      "Rest sound",
      "Rest vibration",
      "Removed sessions",
      "Data and recovery",
    ]) {
      const role = name.startsWith("Rest") ? "switch" : "button";
      expect(screen.getByRole(role, { name })).toHaveStyle({ minHeight: 48 });
    }
    expect(screen.getByTestId("settings-rest-sound-copy"))
      .toHaveStyle({ flexShrink: 1 });
    expect(screen.queryByRole("button", { name: "Close appearance" }))
      .not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Close rest alerts" }))
      .not.toBeOnTheScreen();
  });

  it("explains the two-short-then-long rest sound sequence", async () => {
    await renderScreen(createProps());
    expect(screen.getByText(
      "Plays two short beeps at 2 and 1 seconds, then a longer beep when rest ends.",
    )).toBeOnTheScreen();
  });

  it("keeps the saved row shape and values while rest settings load", async () => {
    const props = createProps({
      preferences: { soundEnabled: false, vibrationEnabled: true },
      restAlertPreferencesLoading: true,
    });
    const rendered = await renderScreen(props);

    expect(screen.getByRole("progressbar", {
      name: "Loading rest alert settings",
    })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ busy: true, disabled: true }),
    );
    for (const setting of ["sound", "vibration"]) {
      expect(screen.getByTestId(
        `settings-rest-alert-${setting}-loading-row`,
        { includeHiddenElements: true },
      ))
        .toHaveStyle({ flexDirection: "row", minHeight: 48 });
    }
    expect(screen.queryAllByRole("switch")).toHaveLength(0);

    await rendered.rerender(
      <AppearanceProvider>
        <SettingsScreen {...props} restAlertPreferencesLoading={false} />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ checked: false }),
      );
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ checked: true }),
      );
  });

  it("reverts a rejected save to its authoritative value and retries through the same switch", async () => {
    const onChangeRestAlertPreferences = jest.fn<
      SettingsScreenProps["onChangeRestAlertPreferences"]
    >(async () => ({
      status: "not_persisted",
      preferences: { soundEnabled: true, vibrationEnabled: false },
    }));
    await renderScreen(createProps({ onChangeRestAlertPreferences }));

    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeOnTheScreen();
      expect(screen.getByText("Rest alert setting was not saved"))
        .toBeOnTheScreen();
      expect(screen.getByText(
        "Your saved rest alert setting was not changed. Try the switch again.",
      )).toBeOnTheScreen();
      expect(screen.getByRole("switch", { name: "Rest sound" }))
        .toHaveProp(
          "accessibilityState",
          expect.objectContaining({ checked: true }),
        );
    });
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));
    await waitFor(() => expect(onChangeRestAlertPreferences).toHaveBeenCalledTimes(2));
    expect(onChangeRestAlertPreferences).toHaveBeenNthCalledWith(2, {
      soundEnabled: false,
      vibrationEnabled: false,
    });
  });

  it("keeps the denied-notification fallback and its settings action", async () => {
    const onOpenNotificationSettings = jest.fn<
      SettingsScreenProps["onOpenNotificationSettings"]
    >();
    await renderScreen(createProps({
      notificationPermission: "denied",
      onOpenNotificationSettings,
    }));

    expect(screen.getByText("Background rest alerts are off"))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "Your in-app timer stays accurate. Allow notifications in Android settings for background rest alerts.",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Open notification settings",
    }));
    expect(onOpenNotificationSettings).toHaveBeenCalledTimes(1);
  });
});
