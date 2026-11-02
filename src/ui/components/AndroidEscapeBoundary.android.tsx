import { requireNativeViewManager } from "expo-modules-core";
import React from "react";
import type {
  NativeSyntheticEvent,
  ViewProps,
} from "react-native";

type AndroidEscapeBoundaryProps = ViewProps & Readonly<{
  onEscape: () => void;
  onKeyDown?: (event: NativeSyntheticEvent<Readonly<{
    key?: string;
    preventDefault?: () => void;
    shiftKey?: boolean;
  }>>) => void;
}>;

type NativeBoundaryProps = ViewProps & Readonly<{
  onEscape: () => void;
}>;

const NativeAndroidEscapeBoundary = requireNativeViewManager<NativeBoundaryProps>(
  "AndroidViewFocus",
);

/**
 * Native dispatch consumes Escape and records navigation keys synchronously.
 * React's cast onKeyDown is unavailable here; focusVisibility.android reads the epoch.
 */
export function AndroidEscapeBoundary({
  onKeyDown: _onKeyDown,
  ...props
}: AndroidEscapeBoundaryProps) {
  return <NativeAndroidEscapeBoundary {...props} />;
}
