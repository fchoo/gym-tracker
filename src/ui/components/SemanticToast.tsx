import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View, type TextStyle } from "react-native";

import { space, typeScale, useAppTheme } from "../theme";

export type SemanticToastSeverity = "success" | "progress" | "error";
export type SemanticToastEvent = Readonly<{
  message: string;
  severity?: SemanticToastSeverity;
}>;

type ToastContextValue = Readonly<{ enqueue: (event: SemanticToastEvent) => void }>;
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

export function SemanticToastProvider({
  children,
  topAvoidance = 0,
  bottomAvoidance: _bottomAvoidance = 0,
}: Readonly<{
  children: React.ReactNode;
  topAvoidance?: number | undefined;
  bottomAvoidance?: number | undefined;
}>) {
  const { colors, reduceMotion } = useAppTheme();
  const [queue, setQueue] = useState<readonly SemanticToastEvent[]>([]);
  const current = queue[0];
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const enqueue = useCallback((event: SemanticToastEvent) => {
    const normalized = { message: event.message.trim(), severity: event.severity ?? "success" } as const;
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
    const timeout = setTimeout(dismiss, 2400);
    return () => clearTimeout(timeout);
  }, [current, dismiss]);

  const value = useMemo(() => ({ enqueue }), [enqueue]);
  const accent = current?.severity === "error"
    ? colors.destructive
    : current?.severity === "progress"
      ? colors.timerAttention
      : colors.toastAccent;
  const topAnchor = topAvoidance + space[4];

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current === undefined ? null : (
        <Animated.View
          accessibilityLiveRegion={current.severity === "error" ? "assertive" : "polite"}
          accessibilityRole="alert"
          style={[
            styles.toast,
            {
              backgroundColor: colors.toastBg,
              borderColor: colors.toastBorder,
              opacity,
              top: topAnchor,
              transform: [{ translateY }],
            },
          ]}
          testID="semantic-toast"
        >
          <View style={[styles.accent, { backgroundColor: accent }]} />
          <Text style={[typeScale.body as TextStyle, styles.copy, { color: colors.toastText }]}>
            {current.message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    left: space[4],
    minHeight: 50,
    overflow: "hidden",
    paddingRight: space[4],
    position: "absolute",
    right: space[4],
  },
  accent: { width: 4 },
  copy: { alignSelf: "center", flex: 1, paddingLeft: 12, paddingVertical: space[2] },
});
