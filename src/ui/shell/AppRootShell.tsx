import React from "react";
import { View } from "react-native";

import { IconAction } from "../components";

export type RootRouteKey = "index" | "calendar" | "library" | "progress";

type FocusTarget = Readonly<{ focus?: () => void }>;

type AppRootShellProps = Readonly<{
  children: React.ReactNode;
  activeRoot?: RootRouteKey;
  headingRefs?: Partial<Record<RootRouteKey, React.RefObject<FocusTarget | null>>>;
  onOpenSettings?: () => void;
}>;

/** Coordinates root focus and header-origin seams without owning route or screen state. */
export function AppRootShell({
  children,
  activeRoot,
  headingRefs,
  onOpenSettings,
}: AppRootShellProps) {
  React.useLayoutEffect(() => {
    if (activeRoot === undefined) {
      return;
    }
    headingRefs?.[activeRoot]?.current?.focus?.();
  }, [activeRoot, headingRefs]);

  return (
    <View style={{ flex: 1 }} testID="app-root-shell">
      {children}
      {onOpenSettings === undefined ? null : (
        <View accessibilityLabel="Root contextual actions">
          <IconAction
            accessibilityLabel="Open App Settings"
            icon="settings"
            onPress={onOpenSettings}
          />
        </View>
      )}
    </View>
  );
}
