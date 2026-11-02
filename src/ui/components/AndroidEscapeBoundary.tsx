import React from "react";
import {
  View,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";

type BoundaryKeyEvent = NativeSyntheticEvent<Readonly<{
  key?: string;
  preventDefault?: () => void;
  shiftKey?: boolean;
}>>;

export type AndroidEscapeBoundaryProps = ViewProps & Readonly<{
  onEscape: () => void;
  onKeyDown?: (event: BoundaryKeyEvent) => void;
}>;

const KeyBoundary = View as unknown as React.ComponentType<AndroidEscapeBoundaryProps>;

/** Host/non-Android fallback for the native Android dialog-key boundary. */
export function AndroidEscapeBoundary({
  onEscape,
  onKeyDown,
  ...props
}: AndroidEscapeBoundaryProps) {
  const handleKeyDown = React.useCallback((event: BoundaryKeyEvent) => {
    if (event.nativeEvent.key === "Escape") {
      event.nativeEvent.preventDefault?.();
      onEscape();
      return;
    }
    onKeyDown?.(event);
  }, [onEscape, onKeyDown]);

  return <KeyBoundary {...props} onEscape={onEscape} onKeyDown={handleKeyDown} />;
}
