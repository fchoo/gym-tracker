import Constants from "expo-constants";
import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS as scheduleOnJavaScript,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const SWIPE_COMPLETE_DISTANCE = 72;
const HELD_ROW_DISPLACEMENT = 84;

function GestureSmokeFixture() {
  const [horizontalSwipeComplete, setHorizontalSwipeComplete] = useState(false);
  const [heldRowDisplaced, setHeldRowDisplaced] = useState(false);
  const swipeTranslationX = useSharedValue(0);
  const heldRowTranslationY = useSharedValue(0);
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeTranslationX.value }],
  }));
  const heldRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: heldRowTranslationY.value }],
  }));

  const horizontalSwipe = useMemo(() => Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onChange((event) => {
      swipeTranslationX.value = event.translationX;
    })
    .onEnd((event) => {
      const completed = Math.abs(event.translationX) >= SWIPE_COMPLETE_DISTANCE;
      swipeTranslationX.value = withTiming(0);
      if (completed) {
        scheduleOnJavaScript(setHorizontalSwipeComplete)(true);
      }
    }), [swipeTranslationX]);
  const heldRow = useMemo(() => Gesture.LongPress()
    .minDuration(550)
    .maxDistance(24)
    .onStart(() => {
      heldRowTranslationY.value = withTiming(HELD_ROW_DISPLACEMENT);
      scheduleOnJavaScript(setHeldRowDisplaced)(true);
    }), [heldRowTranslationY]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Phase 6 gesture smoke
        </Text>
        <Text style={styles.instructions}>
          Swipe the card horizontally, then hold the row. This development-test fixture is excluded from production.
        </Text>
        <GestureDetector gesture={horizontalSwipe}>
          <Animated.View
            accessibilityLabel="Horizontal swipe target"
            style={[styles.swipeTarget, swipeStyle]}
            testID="phase6-horizontal-swipe-target"
          >
            <Text style={styles.targetText}>Horizontal gesture target</Text>
          </Animated.View>
        </GestureDetector>
        {horizontalSwipeComplete ? (
          <Text accessibilityLiveRegion="polite" style={styles.result}>
            Horizontal swipe complete
          </Text>
        ) : null}
        <GestureDetector gesture={heldRow}>
          <Animated.View
            accessibilityLabel="drag-Phase 6 gesture row"
            style={[styles.heldRow, heldRowStyle]}
            testID="drag-Phase 6 gesture row"
          >
            <Text style={styles.targetText}>Hold to displace this row</Text>
          </Animated.View>
        </GestureDetector>
        {heldRowDisplaced ? (
          <Text accessibilityLiveRegion="polite" style={styles.result}>
            Held row displaced
          </Text>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

export default function Phase6GestureSmokeRoute() {
  const enabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true;

  if (!enabled) {
    return <Redirect href="/" />;
  }

  return <GestureSmokeFixture />;
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 20,
    justifyContent: "center",
    padding: 24,
  },
  heldRow: {
    backgroundColor: "#1F3A5F",
    borderRadius: 16,
    minHeight: 80,
    justifyContent: "center",
    padding: 20,
  },
  instructions: {
    color: "#405168",
    fontSize: 16,
    lineHeight: 24,
  },
  result: {
    color: "#176B3A",
    fontSize: 16,
    fontWeight: "700",
  },
  root: {
    backgroundColor: "#F6F8FB",
    flex: 1,
  },
  swipeTarget: {
    backgroundColor: "#D7E8FF",
    borderRadius: 16,
    minHeight: 104,
    justifyContent: "center",
    padding: 20,
  },
  targetText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  title: {
    color: "#152033",
    fontSize: 26,
    fontWeight: "700",
  },
});
