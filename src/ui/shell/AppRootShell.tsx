import React from "react";
import { View } from "react-native";

import { IconAction } from "../components";
import { BottomSheet } from "../components/BottomSheet";
import { SemanticToastProvider } from "../components/SemanticToast";

export type RootRouteKey = "index" | "calendar" | "library" | "progress";

type FocusTarget = Readonly<{ focus?: () => void }>;

export type RootOrigin = Readonly<{
  root: RootRouteKey;
  trigger?: React.RefObject<FocusTarget | null>;
}>;

type AppRootShellProps = Readonly<{
  children: React.ReactNode;
  activeRoot?: RootRouteKey;
  headingRefs?: Partial<Record<RootRouteKey, React.RefObject<FocusTarget | null>>>;
  origin?: RootOrigin;
  onOpenSettings?: () => void;
  settingsContent?: React.ReactNode;
  settingsTriggerRef?: React.RefObject<FocusTarget | null>;
  toastTopAvoidance?: number;
  toastBottomAvoidance?: number;
}>;

/** Coordinates root focus and header-origin seams without owning route or screen state. */
export function AppRootShell({
  children,
  activeRoot,
  headingRefs,
  origin,
  onOpenSettings,
  settingsContent,
  settingsTriggerRef,
  toastTopAvoidance,
  toastBottomAvoidance,
}: AppRootShellProps) {
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  React.useLayoutEffect(() => {
    const originTrigger = origin !== undefined && origin.root === activeRoot
      ? origin.trigger?.current
      : undefined;
    if (originTrigger?.focus !== undefined) {
      originTrigger.focus();
      return;
    }
    if (activeRoot === undefined) {
      return;
    }
    headingRefs?.[activeRoot]?.current?.focus?.();
  }, [activeRoot, headingRefs, origin]);

  return (
    <SemanticToastProvider
      bottomAvoidance={toastBottomAvoidance}
      topAvoidance={toastTopAvoidance}
    >
      <View style={{ flex: 1 }} testID="app-root-shell">
        {children}
        {onOpenSettings === undefined && settingsContent === undefined ? null : (
          <View accessibilityLabel="Root contextual actions">
            <IconAction
              accessibilityLabel="Open App Settings"
              icon="settings"
              onPress={() => {
                if (settingsContent !== undefined) {
                  setSettingsVisible(true);
                  return;
                }
                onOpenSettings?.();
              }}
            />
          </View>
        )}
        {settingsContent === undefined ? null : (
          <BottomSheet
            cancelLabel="Close App Settings"
            heading="App Settings"
            onCancel={() => setSettingsVisible(false)}
            restoreFocusRef={settingsTriggerRef}
            visible={settingsVisible}
          >
            {settingsContent}
          </BottomSheet>
        )}
      </View>
    </SemanticToastProvider>
  );
}
