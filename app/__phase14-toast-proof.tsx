import Constants from "expo-constants";
import { Redirect } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SemanticToastBoundary,
  useSemanticToast,
} from "../src/ui/components/SemanticToast";
import { AppRootShell } from "../src/ui/shell/AppRootShell";
import {
  space,
  useAppTheme,
} from "../src/ui/theme";

const TOAST_TOP_AVOIDANCE = 56;
const TOAST_BOTTOM_AVOIDANCE = 74;
const PROOF_TOAST_DURATION_MS = 6000;

function phase14ToastProofEnabled(): boolean {
  const extra = Constants.expoConfig?.extra;
  return extra?.buildProfile === "development-test"
    && extra?.nativeContractsEnabled === true
    && extra?.nativeContractSuite === "phase14";
}

function ToastProofContent() {
  const { colors } = useAppTheme();
  const { enqueue, mountedEvent } = useSemanticToast();
  const [backgroundActivated, setBackgroundActivated] = React.useState(false);
  const startedRef = React.useRef(false);
  const toastMounted = mountedEvent?.message === "Toast proof active";

  React.useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    enqueue({
      durationMs: PROOF_TOAST_DURATION_MS,
      message: "Toast proof active",
      severity: "progress",
    });
  }, [enqueue]);

  return (
    <View style={styles.content}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.textPrimary }]}
      >
        Phase 14 toast proof
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Tap the background control while the toast remains visible. The state
        change must land without dismissing the toast or opening any other
        surface.
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.mountStatus, { color: colors.textPrimary }]}
      >
        {toastMounted ? "Toast host mounted" : "Waiting for toast host"}
      </Text>
      <View style={styles.spacer} />
      <Pressable
        accessibilityLabel="Tap background control"
        accessibilityRole="button"
        onPress={() => setBackgroundActivated(true)}
        style={[
          styles.action,
          {
            backgroundColor: colors.surface,
            borderColor: colors.contentCardBorder,
          },
        ]}
      >
        <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
          Tap background control
        </Text>
      </Pressable>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.status, { color: colors.textPrimary }]}
      >
        {backgroundActivated
          ? "Background control activated"
          : "Background control idle"}
      </Text>
    </View>
  );
}

export default function Phase14ToastProofRoute() {
  if (!phase14ToastProofEnabled()) {
    return <Redirect href="/" />;
  }

  return (
    <SemanticToastBoundary
      bottomAvoidance={TOAST_BOTTOM_AVOIDANCE}
      topAvoidance={TOAST_TOP_AVOIDANCE}
    >
      <AppRootShell>
        <ToastProofContent />
      </AppRootShell>
    </SemanticToastBoundary>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: space[4],
    paddingTop: 132,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  mountStatus: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: space[2],
  },
  spacer: {
    flex: 1,
    minHeight: 160,
  },
  action: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: space[4],
  },
  actionLabel: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  status: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: space[4],
    paddingBottom: space[6],
    textAlign: "center",
  },
});
