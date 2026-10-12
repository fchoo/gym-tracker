import React, { useEffect, useRef } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { addLocalMonthsClamped, startOfLocalMonth, type LocalDate } from "../../domains/scheduling/localDate";
import {
  clampMonthDrag,
  type CalendarMotionCommand,
  type CalendarTransitionState,
} from "./calendarTransitionController";

const EASING = Easing.bezier(0.22, 0.8, 0.3, 1);
const SLOP_DP = 7;
const HORIZONTAL_INTENT_RATIO = 1.15;

type PanelOffset = -1 | 0 | 1;

/** The three panels are always separated by one measured viewport width. */
export function calendarPanelTranslate(offset: PanelOffset, dx: number, viewportWidth: number): number {
  return offset * viewportWidth + clampMonthDrag(dx, viewportWidth);
}

function Panel({
  children,
  offset,
  pointerX,
  viewportWidth,
}: Readonly<{
  children: React.ReactNode;
  offset: PanelOffset;
  pointerX: Readonly<{ value: number }>;
  viewportWidth: Readonly<{ value: number }>;
}>) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset * viewportWidth.value + pointerX.value }],
    width: viewportWidth.value,
  }));

  return <Animated.View style={[styles.panel, style]}>{children}</Animated.View>;
}

export function CalendarMonthViewport({
  command,
  month,
  onCancel,
  onComplete,
  onPreview,
  onRelease,
  renderMonth,
  transition,
}: Readonly<{
  command: CalendarMotionCommand | null;
  month: LocalDate;
  onCancel(): void;
  onComplete(epoch: number): void;
  onPreview(dx: number, viewportWidth: number): void;
  onRelease(input: Readonly<{ dx: number; dy: number; targetMonthId: string; viewportWidth: number }>): void;
  renderMonth(month: LocalDate, interactive: boolean): React.ReactNode;
  transition: CalendarTransitionState;
}>) {
  const pointerX = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const previewPanel = useSharedValue<PanelOffset>(0);
  const completionEpoch = useSharedValue(0);
  const released = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const mounted = useRef(true);
  const lastWidth = useRef(0);
  const previousMonth = startOfLocalMonth(addLocalMonthsClamped(month, -1));
  const nextMonth = startOfLocalMonth(addLocalMonthsClamped(month, 1));

  useEffect(() => () => {
    mounted.current = false;
    cancelAnimation(pointerX);
  }, [pointerX]);

  useEffect(() => {
    if (command?.kind !== "settle-month") return;
    const width = viewportWidth.value;
    if (width <= 0) {
      onComplete(command.epoch);
      return;
    }
    completionEpoch.value = command.epoch;
    cancelAnimation(pointerX);
    pointerX.value = withTiming(command.toOffset * width, {
      duration: command.durationMs,
      easing: EASING,
    }, (finished) => {
      if (finished && completionEpoch.value === command.epoch) {
        scheduleOnRN(onComplete, command.epoch);
      }
    });
  }, [command, completionEpoch, onCancel, onComplete, pointerX, viewportWidth]);

  useEffect(() => {
    if (transition.phase !== "idle") return;
    cancelAnimation(pointerX);
    pointerX.value = 0;
    previewPanel.value = 0;
  }, [pointerX, previewPanel, transition.epoch, transition.phase]);

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (touch === undefined) return;
      touchStartX.value = touch.absoluteX;
      touchStartY.value = touch.absoluteY;
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (touch === undefined) return;
      const dx = touch.absoluteX - touchStartX.value;
      const dy = touch.absoluteY - touchStartY.value;
      if (Math.abs(dx) < SLOP_DP && Math.abs(dy) < SLOP_DP) return;
      if (Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_INTENT_RATIO) manager.activate();
      else manager.fail();
    })
    .onBegin(() => {
      released.value = false;
      completionEpoch.value += 1;
      cancelAnimation(pointerX);
    })
    .onChange((event) => {
      const width = viewportWidth.value;
      if (width <= 0) return;
      const dx = Math.max(-width, Math.min(width, event.translationX));
      pointerX.value = dx;
      const nextPanel: PanelOffset = Math.abs(dx) >= width * 0.25 ? (dx < 0 ? 1 : -1) : 0;
      if (nextPanel !== previewPanel.value) {
        previewPanel.value = nextPanel;
        scheduleOnRN(onPreview, dx, width);
      }
    })
    .onEnd((event) => {
      const width = viewportWidth.value;
      if (width <= 0) return;
      released.value = true;
      scheduleOnRN(onRelease, {
        dx: Math.max(-width, Math.min(width, event.translationX)),
        dy: event.translationY,
        targetMonthId: event.translationX < 0 ? nextMonth.slice(0, 7) : previousMonth.slice(0, 7),
        viewportWidth: width,
      });
    })
    .onFinalize(() => {
      if (!released.value) {
        completionEpoch.value += 1;
        cancelAnimation(pointerX);
        pointerX.value = 0;
        scheduleOnRN(onCancel);
      }
    });

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth <= 0 || nextWidth === lastWidth.current) return;
    const hadMeasurement = lastWidth.current > 0;
    lastWidth.current = nextWidth;
    viewportWidth.value = nextWidth;
    cancelAnimation(pointerX);
    pointerX.value = 0;
    previewPanel.value = 0;
    if (hadMeasurement && mounted.current) onCancel();
  };

  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel="Calendar month panels" onLayout={onLayout} style={styles.viewport} testID="calendar-month-viewport">
        <Panel offset={-1} pointerX={pointerX} viewportWidth={viewportWidth}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
            {renderMonth(previousMonth, false)}
          </View>
        </Panel>
        <Panel offset={0} pointerX={pointerX} viewportWidth={viewportWidth}>
          {renderMonth(month, true)}
        </Panel>
        <Panel offset={1} pointerX={pointerX} viewportWidth={viewportWidth}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
            {renderMonth(nextMonth, false)}
          </View>
        </Panel>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  panel: { bottom: 0, left: 0, position: "absolute", top: 0 },
  viewport: { flex: 1, minHeight: 0, overflow: "hidden" },
});
