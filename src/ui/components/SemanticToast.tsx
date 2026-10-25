import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";

import { ActionLabel } from "./ActionLabel";
import { space, typeScale, useAppTheme } from "../theme";

export type SemanticToastSeverity = "success" | "progress" | "error";
export type SemanticToastEvent = Readonly<{
  message: string;
  severity?: SemanticToastSeverity;
  durationMs?: number;
  action?: Readonly<{ label: string; onPress: () => void }> | undefined;
}>;

export type SemanticToastMountChange =
  Readonly<{ mounted: false }>
  | Readonly<{ mounted: true; event: SemanticToastEvent }>;

type ToastContextValue = Readonly<{
  enqueue: (event: SemanticToastEvent) => void;
  mountedEvent: SemanticToastEvent | undefined;
}>;
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function isBoundedUserMessage(message: string): boolean {
  return message.length > 0
    && message.length <= 160
    && !/(?:\btoken\b|\bpassword\b|\baccount id\b|error:|[/\\])/iu.test(message);
}

export function useSemanticToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === undefined) throw new Error("useSemanticToast must be inside SemanticToastProvider");
  return value;
}

export function useOptionalSemanticToast(): ToastContextValue | undefined {
  return useContext(ToastContext);
}

export function SemanticToastProvider({
  children,
  topAvoidance = 0,
  bottomAvoidance = 0,
  onToastMountChange,
}: Readonly<{
  children: React.ReactNode;
  topAvoidance?: number | undefined;
  bottomAvoidance?: number | undefined;
  onToastMountChange?: ((change: SemanticToastMountChange) => void) | undefined;
}>) {
  const { colors, reduceMotion } = useAppTheme();
  const [queue, setQueue] = useState<readonly SemanticToastEvent[]>([]);
  const current = queue[0];
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const mountedToastMessageRef = useRef<string | null>(null);
  const [mountedEvent, setMountedEvent] = useState<SemanticToastEvent | undefined>();

  const enqueue = useCallback((event: SemanticToastEvent) => {
    const normalizedDurationMs = normalizeToastDurationMs(event.durationMs);
    const normalized: SemanticToastEvent = {
      message: event.message.trim(),
      severity: event.severity ?? "success",
      ...(normalizedDurationMs === undefined ? {} : { durationMs: normalizedDurationMs }),
      ...(event.action === undefined ? {} : { action: event.action }),
    };
    if (!isBoundedUserMessage(normalized.message)) return;
    setQueue((currentQueue) => currentQueue.some((item) => item.message === normalized.message)
      ? currentQueue
      : [...currentQueue, normalized]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((currentQueue) => currentQueue.slice(1));
  }, []);

  useEffect(() => {
    if (current === undefined) return;
    opacity.setValue(reduceMotion ? 1 : 0);
    translateY.setValue(reduceMotion ? 0 : 8);
    const animation = Animated.parallel([
      Animated.timing(opacity, { duration: reduceMotion ? 0 : 150, toValue: 1, useNativeDriver: true }),
      Animated.timing(translateY, { duration: reduceMotion ? 0 : 150, toValue: 0, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [current, opacity, reduceMotion, translateY]);

  useEffect(() => {
    if (current === undefined || current.severity === "error") return;
    const timeout = setTimeout(dismiss, current.durationMs ?? DEFAULT_TOAST_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [current, dismiss]);

  useEffect(() => {
    if (current === undefined) {
      if (mountedToastMessageRef.current !== null) {
        mountedToastMessageRef.current = null;
        setMountedEvent(undefined);
        onToastMountChange?.({ mounted: false });
      }
      return;
    }

    if (mountedToastMessageRef.current !== current.message) {
      mountedToastMessageRef.current = null;
      setMountedEvent(undefined);
    }
  }, [current, onToastMountChange]);

  const handleToastLayout = useCallback(() => {
    if (current === undefined || mountedToastMessageRef.current === current.message) {
      return;
    }
    mountedToastMessageRef.current = current.message;
    setMountedEvent(current);
    onToastMountChange?.({ event: current, mounted: true });
  }, [current, onToastMountChange]);

  const value = useMemo(() => ({ enqueue, mountedEvent }), [enqueue, mountedEvent]);
  const accent = current?.severity === "error"
    ? colors.destructive
    : current?.severity === "progress"
      ? colors.timerAttention
      : colors.toastAccent;
  const topAnchor = Math.max(0, topAvoidance) + space[4];
  const bottomAnchor = Math.max(0, bottomAvoidance) + space[4];

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        style={[
          styles.host,
          { bottom: bottomAnchor, top: topAnchor },
        ]}
        testID="semantic-toast-host"
      >
        {current === undefined ? null : (
          <Animated.View
            accessibilityLabel={current.message}
            accessibilityLiveRegion={current.severity === "error" ? "assertive" : "polite"}
            accessibilityRole="alert"
            accessible
            importantForAccessibility="yes"
            onLayout={handleToastLayout}
            pointerEvents={current.action === undefined ? "none" : "auto"}
            style={[
              styles.toast,
              {
                backgroundColor: colors.toastBg,
                borderColor: colors.toastBorder,
                opacity,
                transform: [{ translateY }],
              },
            ]}
            testID="semantic-toast"
          >
            <View style={[styles.accent, { backgroundColor: accent }]} />
            <Text style={[typeScale.body as TextStyle, styles.copy, { color: colors.toastText }]}>
              {current.message}
            </Text>
            {current.action === undefined ? null : (
              <Pressable
                accessibilityLabel={current.action.label}
                accessibilityRole="button"
                onPress={() => {
                  current.action?.onPress();
                  dismiss();
                }}
                style={styles.action}
              >
                <ActionLabel color={colors.toastText} label={current.action.label} typography={typeScale.label as TextStyle} />
              </Pressable>
            )}
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function SemanticToastBoundary({
  children,
  ...providerProps
}: React.ComponentProps<typeof SemanticToastProvider>) {
  const existingContext = useContext(ToastContext);
  if (existingContext !== undefined) {
    return <>{children}</>;
  }
  return (
    <SemanticToastProvider {...providerProps}>
      {children}
    </SemanticToastProvider>
  );
}

const DEFAULT_TOAST_DURATION_MS = 2400;

function normalizeToastDurationMs(durationMs: number | undefined): number | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return undefined;
  }

  const rounded = Math.round(durationMs);
  return rounded >= 1000 && rounded <= 10_000 ? rounded : undefined;
}

const styles = StyleSheet.create({
  host: {
    left: space[4],
    position: "absolute",
    right: space[4],
  },
  toast: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
    overflow: "hidden",
    paddingRight: space[4],
  },
  accent: { width: 4 },
  copy: { alignSelf: "center", flex: 1, paddingLeft: 12, paddingVertical: space[2] },
  action: { alignSelf: "center", minHeight: 48, justifyContent: "center", paddingHorizontal: space[2] },
});
