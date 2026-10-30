import React from "react";
import { View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import {
  type RootFocusTarget,
  type RootOrigin,
  type RootRouteKey,
  rootSettingsTriggerNativeID,
  rootTabNativeID,
} from "./rootFocus";

type AppRootShellProps = Readonly<{
  children: React.ReactNode;
  activeRoot?: RootRouteKey;
  currentPath?: string;
  headingRefs?: Partial<Record<RootRouteKey, React.RefObject<RootFocusTarget | null>>>;
  origin?: RootOrigin;
  onConsumeOrigin?: () => void;
  onOpenSettings?: () => void;
  onSettingsVisibilityChange?: (visible: boolean) => void;
  requestNativeFocus?: (nativeID: string) => void | Promise<boolean>;
  settingsContent?: React.ReactNode | ((closeSettings: () => void) => React.ReactNode);
  settingsTriggerNativeID?: string;
  settingsTriggerRef?: React.RefObject<RootFocusTarget | null>;
}>;

type RootSettingsControllerValue = Readonly<{
  closeRootSettings: () => void;
  openRootSettings: (input: Readonly<{
    root: RootRouteKey;
    triggerNativeID?: string;
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
  onSettingsVisibilityChange,
  requestNativeFocus,
  settingsContent,
  settingsTriggerNativeID,
  settingsTriggerRef,
}: AppRootShellProps) {
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [activeSettingsTriggerRef, setActiveSettingsTriggerRef] = React.useState<
    React.RefObject<RootFocusTarget | null> | undefined
  >(settingsTriggerRef);
  const [activeSettingsTriggerNativeID, setActiveSettingsTriggerNativeID] = React.useState<
    string | undefined
  >(settingsTriggerNativeID);
  const previousActiveRootRef = React.useRef<RootRouteKey | undefined>(activeRoot);
  const previousPathRef = React.useRef(currentPath);
  const closeSettings = React.useCallback(() => {
    setSettingsVisible(false);
    onSettingsVisibilityChange?.(false);
  }, [onSettingsVisibilityChange]);
  const openRootSettings = React.useCallback((input: Readonly<{
    root: RootRouteKey;
    triggerNativeID?: string;
    triggerRef: React.RefObject<RootFocusTarget | null>;
  }>) => {
    setActiveSettingsTriggerRef(input.triggerRef);
    setActiveSettingsTriggerNativeID(
      input.triggerNativeID ?? rootSettingsTriggerNativeID(input.root),
    );
    if (settingsContent !== undefined) {
      setSettingsVisible(true);
      onSettingsVisibilityChange?.(true);
      return;
    }
    onOpenSettings?.();
  }, [onOpenSettings, onSettingsVisibilityChange, settingsContent]);
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
      setActiveSettingsTriggerNativeID(settingsTriggerNativeID);
    }
  }, [settingsTriggerNativeID, settingsTriggerRef, settingsVisible]);

  React.useLayoutEffect(() => {
    const rootChanged = previousActiveRootRef.current !== activeRoot;
    const pathChanged = previousPathRef.current !== currentPath;

    if (activeRoot !== undefined) {
      const focusRoot = () => {
        headingRefs?.[activeRoot]?.current?.focus?.();
        void requestNativeFocus?.(rootTabNativeID(activeRoot));
      };
      const originTrigger = origin !== undefined && origin.root === activeRoot
        ? origin.trigger?.current
        : undefined;
      if (pathChanged && origin?.root === activeRoot) {
        if (originTrigger?.focus !== undefined) {
          originTrigger.focus();
        } else {
          focusRoot();
        }
        onConsumeOrigin?.();
      } else if (pathChanged && origin !== undefined && origin.root !== activeRoot) {
        focusRoot();
        onConsumeOrigin?.();
      } else if (rootChanged) {
        focusRoot();
      }
    }

    previousActiveRootRef.current = activeRoot;
    previousPathRef.current = currentPath;
  }, [activeRoot, currentPath, headingRefs, onConsumeOrigin, origin, requestNativeFocus]);

  return (
    <RootSettingsControllerContext.Provider value={rootSettingsController}>
      <View style={{ flex: 1 }} testID="app-root-shell">
        {children}
        {settingsContent === undefined ? null : (
          <BottomSheet
            cancelLabel="Close App Settings"
            heading="App Settings"
            onCancel={closeSettings}
            requestNativeFocus={requestNativeFocus}
            restoreFocusNativeID={activeSettingsTriggerNativeID}
            restoreFocusRef={activeSettingsTriggerRef}
            testID="app-settings-sheet"
            visible={settingsVisible}
          >
            {resolvedSettingsContent}
          </BottomSheet>
        )}
      </View>
    </RootSettingsControllerContext.Provider>
  );
}
