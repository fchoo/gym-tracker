import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppSettingsContent } from "../screens/SettingsScreen";
import { AppearanceProvider } from "../theme";
import { useSemanticToast } from "../components/SemanticToast";
import {
  AppRootShell,
  useRootSettingsController,
} from "./AppRootShell";

function ShellToastTrigger() {
  const { enqueue } = useSemanticToast();
  React.useEffect(() => enqueue({ message: "Workout saved" }), [enqueue]);
  return null;
}

function RootSettingsTrigger({
  root = "index",
  triggerRef,
}: Readonly<{
  root?: "index" | "calendar" | "library" | "progress";
  triggerRef: React.RefObject<{ focus?: () => void } | null>;
}>) {
  const { openRootSettings } = useRootSettingsController();
  return (
    <Pressable
      accessibilityLabel="Open App Settings"
      accessibilityRole="button"
      onPress={() => openRootSettings({ root, triggerRef })}
    />
  );
}

describe("AppRootShell", () => {
  it("keeps mounted root content in place and focuses the selected root heading", async () => {
    const workoutHeading = { current: { focus: jest.fn() } };
    const libraryHeading = { current: { focus: jest.fn() } };
    const { rerender } = await render(
      <AppearanceProvider>
        <AppRootShell
          activeRoot="index"
          headingRefs={{ index: workoutHeading, library: libraryHeading }}
        >
          <View>
            <Text>Library query: deadlift</Text>
          </View>
        </AppRootShell>
      </AppearanceProvider>,
    );

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="library"
            headingRefs={{ index: workoutHeading, library: libraryHeading }}
          >
            <View>
              <Text>Library query: deadlift</Text>
            </View>
          </AppRootShell>
        </AppearanceProvider>,
      );
    });

    expect(screen.getByText("Library query: deadlift")).toBeOnTheScreen();
    expect(libraryHeading.current.focus).toHaveBeenCalledTimes(1);
  });

  it("delegates root-owned settings requests without rendering a floating trigger", async () => {
    const onOpenSettings = jest.fn();
    const triggerRef = { current: { focus: jest.fn() } };
    await render(
      <AppearanceProvider>
        <AppRootShell activeRoot="index" onOpenSettings={onOpenSettings}>
          <RootSettingsTrigger triggerRef={triggerRef} />
        </AppRootShell>
      </AppearanceProvider>,
    );

    expect(screen.queryByLabelText("Root contextual actions")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open App Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("opens one App Settings sheet and restores the exact shell trigger on close", async () => {
    const trigger = { current: { focus: jest.fn() } };
    await render(
      <AppearanceProvider>
        <AppRootShell
          activeRoot="index"
          settingsContent={(
            <AppSettingsContent
              notificationPermission="granted"
              onChangeRestAlertPreferences={() => undefined}
              onOpenDataAndRecovery={jest.fn()}
              onOpenNotificationSettings={() => undefined}
              onOpenRemovedSessions={jest.fn()}
              preferences={{ soundEnabled: true, vibrationEnabled: true }}
              restAlertPreferencesLoading={false}
            />
          )}
          settingsTriggerRef={trigger}
        >
          <RootSettingsTrigger triggerRef={trigger} />
        </AppRootShell>
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Open App Settings" }));
    expect(screen.getByRole("header", { name: "App Settings" })).toBeOnTheScreen();
    expect(screen.getByText("Appearance applies to all four destinations, Active Workout, Garmin, sheets, dialogs, and recovery routes.")).toBeOnTheScreen();

    const focusCallsBeforeClose = trigger.current.focus.mock.calls.length;
    await fireEvent.press(screen.getByRole("button", { name: "Close App Settings" }));
    expect(trigger.current.focus).toHaveBeenCalledTimes(focusCallsBeforeClose + 1);
  });

  it("dismisses root App Settings before a retained deep-route callback runs", async () => {
    const openRemovedSessions = jest.fn();
    await render(
      <AppearanceProvider>
        <AppRootShell
          activeRoot="index"
          settingsContent={(closeSettings) => (
            <AppSettingsContent
              notificationPermission="granted"
              onChangeRestAlertPreferences={() => undefined}
              onNavigate={closeSettings}
              onOpenDataAndRecovery={() => undefined}
              onOpenNotificationSettings={() => undefined}
              onOpenRemovedSessions={openRemovedSessions}
              preferences={{ soundEnabled: true, vibrationEnabled: true }}
              restAlertPreferencesLoading={false}
            />
          )}
        >
          <RootSettingsTrigger triggerRef={{ current: { focus: jest.fn() } }} />
        </AppRootShell>
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Open App Settings" }));
    await fireEvent.press(screen.getByRole("button", { name: "Removed sessions" }));
    expect(openRemovedSessions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("header", { name: "App Settings" }))
      .not.toBeOnTheScreen();
  });

  it("restores the exact originating trigger and falls back to the root heading", async () => {
    const trigger = { current: { focus: jest.fn() } };
    const heading = { current: { focus: jest.fn() } };
    const consumeOrigin = jest.fn();
    const { rerender } = await render(
      <AppearanceProvider>
        <AppRootShell
          activeRoot="library"
          currentPath="/more/removed-sessions"
          headingRefs={{ library: heading }}
          onConsumeOrigin={consumeOrigin}
        >
          <View />
        </AppRootShell>
      </AppearanceProvider>,
    );

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="library"
            currentPath="/library"
            headingRefs={{ library: heading }}
            origin={{ root: "library", trigger }}
            onConsumeOrigin={consumeOrigin}
          >
            <View />
          </AppRootShell>
        </AppearanceProvider>,
      );
    });
    expect(trigger.current.focus).toHaveBeenCalledTimes(1);
    expect(consumeOrigin).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="library"
            currentPath="/more/data-and-recovery"
            headingRefs={{ library: heading }}
            onConsumeOrigin={consumeOrigin}
          >
            <View />
          </AppRootShell>
        </AppearanceProvider>,
      );
    });

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="library"
            currentPath="/library"
            headingRefs={{ library: heading }}
            origin={{ root: "library" }}
            onConsumeOrigin={consumeOrigin}
          >
            <View />
          </AppRootShell>
        </AppearanceProvider>,
      );
    });
    expect(heading.current.focus).toHaveBeenCalledTimes(1);
    expect(consumeOrigin).toHaveBeenCalledTimes(2);
  });

  it("focuses the destination heading when leaving a deep route for another root", async () => {
    const trigger = { current: { focus: jest.fn() } };
    const libraryHeading = { current: { focus: jest.fn() } };
    const progressHeading = { current: { focus: jest.fn() } };
    const consumeOrigin = jest.fn();
    const { rerender } = await render(
      <AppearanceProvider>
        <AppRootShell
          activeRoot="library"
          currentPath="/more/removed-sessions"
          headingRefs={{ library: libraryHeading, progress: progressHeading }}
          onConsumeOrigin={consumeOrigin}
        >
          <View />
        </AppRootShell>
      </AppearanceProvider>,
    );

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="progress"
            currentPath="/progress"
            headingRefs={{ library: libraryHeading, progress: progressHeading }}
            origin={{ root: "library", trigger }}
            onConsumeOrigin={consumeOrigin}
          >
            <View />
          </AppRootShell>
        </AppearanceProvider>,
      );
    });

    expect(trigger.current.focus).not.toHaveBeenCalled();
    expect(progressHeading.current.focus).toHaveBeenCalledTimes(1);
    expect(consumeOrigin).toHaveBeenCalledTimes(1);
  });

  it("mounts one measured shell-level toast host", async () => {
    await render(
      <AppearanceProvider>
        <AppRootShell toastBottomAvoidance={74} toastTopAvoidance={56}>
          <ShellToastTrigger />
        </AppRootShell>
      </AppearanceProvider>,
    );

    const toastStyle = StyleSheet.flatten(screen.getByTestId("semantic-toast").props.style);
    expect(toastStyle).toMatchObject({ top: 72 });
    expect(toastStyle.bottom).toBeUndefined();
  });
});
