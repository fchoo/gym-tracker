import React from "react";
import { View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
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
}>;

type RootSettingsControllerValue = Readonly<{
  closeRootSettings: () => void;
  openRootSettings: (input: Readonly<{
    root: RootRouteKey;
    triggerRef: React.RefObject<RootFocusTarget | null>;
  }>) => void;
}>;

const RootSettingsControllerContext = React.createContext<RootSettingsControllerValue | null>(
  null,
);

export function useRootSettingsController(): RootSettingsControllerValue {
  const controller = React.useContext(RootSettingsControllerContext);
  return controller ?? {
    closeRootSettings: () => undefined,
    openRootSettings: () => undefined,
  };
}

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
}: AppRootShellProps) {
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [activeSettingsTriggerRef, setActiveSettingsTriggerRef] = React.useState<
    React.RefObject<RootFocusTarget | null> | undefined
  >(settingsTriggerRef);
  const previousActiveRootRef = React.useRef<RootRouteKey | undefined>(activeRoot);
  const previousPathRef = React.useRef(currentPath);
  const closeSettings = React.useCallback(() => setSettingsVisible(false), []);
  const openRootSettings = React.useCallback((input: Readonly<{
    root: RootRouteKey;
    triggerRef: React.RefObject<RootFocusTarget | null>;
  }>) => {
    setActiveSettingsTriggerRef(input.triggerRef);
    if (settingsContent !== undefined) {
      setSettingsVisible(true);
      return;
    }
    onOpenSettings?.();
  }, [onOpenSettings, settingsContent]);
  const resolvedSettingsContent = typeof settingsContent === "function"
    ? settingsContent(closeSettings)
    : settingsContent;
  const rootSettingsController = React.useMemo(() => ({
    closeRootSettings: closeSettings,
    openRootSettings,
  }), [closeSettings, openRootSettings]);

  React.useEffect(() => {
    if (!settingsVisible) {
      setActiveSettingsTriggerRef(settingsTriggerRef);
    }
  }, [settingsTriggerRef, settingsVisible]);

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
        headingRefs?.[activeRoot]?.current?.focus?.();
        onConsumeOrigin?.();
      } else if (rootChanged) {
        headingRefs?.[activeRoot]?.current?.focus?.();
      }
    }

    previousActiveRootRef.current = activeRoot;
    previousPathRef.current = currentPath;
  }, [activeRoot, currentPath, headingRefs, onConsumeOrigin, origin]);

  return (
    <RootSettingsControllerContext.Provider value={rootSettingsController}>
      <View style={{ flex: 1 }} testID="app-root-shell">
        {children}
        {settingsContent === undefined ? null : (
          <BottomSheet
            cancelLabel="Close App Settings"
            heading="App Settings"
            onCancel={closeSettings}
            restoreFocusRef={activeSettingsTriggerRef}
            visible={settingsVisible}
          >
            {resolvedSettingsContent}
          </BottomSheet>
        )}
      </View>
    </RootSettingsControllerContext.Provider>
  );
}
