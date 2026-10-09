import Constants from "expo-constants";
import { Redirect } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSemanticToast } from "../src/ui/components/SemanticToast";
import { AppRootShell } from "../src/ui/shell/AppRootShell";
import {
  space,
  useAppTheme,
} from "../src/ui/theme";

const TOAST_TOP_AVOIDANCE = 56;
const TOAST_BOTTOM_AVOIDANCE = 74;

function phase14ToastProofEnabled(): boolean {
  const extra = Constants.expoConfig?.extra;
  return extra?.buildProfile === "development-test"
    && extra?.nativeContractsEnabled === true
    && extra?.nativeContractSuite === "phase14";
}

function ToastProofContent() {
  const { colors } = useAppTheme();
  const { enqueue } = useSemanticToast();
  const [backgroundActivated, setBackgroundActivated] = React.useState(false);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    enqueue({
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
        Tap the background control while the toast remains visible. The update
        must land without dismissing the toast or opening any other surface.
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
    <AppRootShell
      toastBottomAvoidance={TOAST_BOTTOM_AVOIDANCE}
      toastTopAvoidance={TOAST_TOP_AVOIDANCE}
    >
      <ToastProofContent />
    </AppRootShell>
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
