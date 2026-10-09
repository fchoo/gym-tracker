import React from "react";
import { View } from "react-native";

import { IconAction } from "../components";
import { BottomSheet } from "../components/BottomSheet";
import {
  SemanticToastProvider,
  type SemanticToastMountChange,
} from "../components/SemanticToast";
import {
  type RootFocusTarget,
  type RootOrigin,
  type RootRouteKey,
} from "./rootFocus";

type AppRootShellProps = Readonly<{
  children: React.ReactNode;
  activeRoot?: RootRouteKey;
  currentPath?: string;
  headingRefs?: Partial<Record<RootRouteKey, React.RefObject<RootFocusTarget | null>>>;
  origin?: RootOrigin;
  onConsumeOrigin?: () => void;
  onOpenSettings?: () => void;
  settingsContent?: React.ReactNode | ((closeSettings: () => void) => React.ReactNode);
  settingsTriggerRef?: React.RefObject<RootFocusTarget | null>;
  toastTopAvoidance?: number;
  toastBottomAvoidance?: number;
  onToastMountChange?: ((change: SemanticToastMountChange) => void) | undefined;
}>;

/** Coordinates root focus and header-origin seams without owning route or screen state. */
export function AppRootShell({
  children,
  activeRoot,
  currentPath,
  headingRefs,
  origin,
  onConsumeOrigin,
  onOpenSettings,
  settingsContent,
  settingsTriggerRef,
  toastTopAvoidance,
  toastBottomAvoidance,
  onToastMountChange,
}: AppRootShellProps) {
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const previousActiveRootRef = React.useRef<RootRouteKey | undefined>(activeRoot);
  const previousPathRef = React.useRef(currentPath);
  const closeSettings = React.useCallback(() => setSettingsVisible(false), []);
  const resolvedSettingsContent = typeof settingsContent === "function"
    ? settingsContent(closeSettings)
    : settingsContent;

  React.useLayoutEffect(() => {
    const rootChanged = previousActiveRootRef.current !== activeRoot;
    const pathChanged = previousPathRef.current !== currentPath;

    if (activeRoot !== undefined) {
      const originTrigger = origin !== undefined && origin.root === activeRoot
        ? origin.trigger?.current
        : undefined;
      if (pathChanged && origin?.root === activeRoot) {
        if (originTrigger?.focus !== undefined) {
          originTrigger.focus();
        } else {
          headingRefs?.[activeRoot]?.current?.focus?.();
        }
        onConsumeOrigin?.();
      } else if (pathChanged && origin !== undefined && origin.root !== activeRoot) {
        onConsumeOrigin?.();
      } else if (rootChanged) {
        headingRefs?.[activeRoot]?.current?.focus?.();
      }
    }

    previousActiveRootRef.current = activeRoot;
    previousPathRef.current = currentPath;
  }, [activeRoot, currentPath, headingRefs, onConsumeOrigin, origin]);

  return (
    <SemanticToastProvider
      bottomAvoidance={toastBottomAvoidance}
      onToastMountChange={onToastMountChange}
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
              ref={settingsTriggerRef as React.Ref<View>}
            />
          </View>
        )}
        {settingsContent === undefined ? null : (
          <BottomSheet
            cancelLabel="Close App Settings"
            heading="App Settings"
            onCancel={closeSettings}
            restoreFocusRef={settingsTriggerRef}
            visible={settingsVisible}
          >
            {resolvedSettingsContent}
          </BottomSheet>
        )}
      </View>
    </SemanticToastProvider>
  );
}
