import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  recordPhase16CalendarCancel,
  recordPhase16CalendarDrag,
  recordPhase16CalendarFocus,
  recordPhase16CalendarRelease,
} from "../../bootstrap/phase16CalendarTestControls";
import { addLocalMonthsClamped, startOfLocalMonth, type LocalDate } from "../../domains/scheduling/localDate";
import {
  clampMonthDrag,
  type CalendarMotionCommand,
  type CalendarTransitionPhase,
  type CalendarTransitionState,
} from "./calendarTransitionController";
import { calendarTrackMetrics } from "./CalendarWeekRow";

const EASING = Easing.bezier(0.22, 0.8, 0.3, 1);
const SLOP_DP = 7;
const HORIZONTAL_INTENT_RATIO = 1.15;

type PanelOffset = -1 | 0 | 1;

export type CalendarWeekGeometry = Readonly<{ y: number; height: number; generation: number }>;

export function calendarWeekGeometryForGeneration(
  geometry: CalendarWeekGeometry | null | undefined,
  generation: number,
): CalendarWeekGeometry | null {
  return geometry?.generation === generation ? geometry : null;
}

/** The three panels are always separated by one measured viewport width. */
export function calendarPanelTranslate(offset: PanelOffset, dx: number, viewportWidth: number): number {
  return offset * viewportWidth + clampMonthDrag(dx, viewportWidth);
}

export function calendarMonthPanEnabled(phase: CalendarTransitionPhase): boolean {
  return phase === "idle" || phase === "dragging";
}

export function calendarAgendaMotion(command: Readonly<{
  phase: "expand" | "collapse";
  agendaDelayMs: number;
  agendaDurationMs: number;
}>): Readonly<{ delayMs: number; durationMs: number; opacity: 0 | 1 }> {
  return Object.freeze({
    delayMs: command.agendaDelayMs,
    durationMs: command.agendaDurationMs,
    opacity: command.phase === "expand" ? 1 : 0,
  });
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

function FocusedWeekOverlay({
  children,
  edge,
  geometry,
  progress,
  viewportHeight,
}: Readonly<{
  children: React.ReactNode;
  edge: "top" | "bottom";
  geometry: CalendarWeekGeometry;
  progress: Readonly<{ value: number }>;
  viewportHeight: Readonly<{ value: number }>;
}>) {
  const style = useAnimatedStyle(() => {
    const targetY = edge === "top" ? 0 : Math.max(0, viewportHeight.value - geometry.height);
    return {
      height: geometry.height,
      transform: [{ translateY: geometry.y + (targetY - geometry.y) * progress.value }],
    };
  });

  return (
    <Animated.View
      style={[styles.focusedOverlay, style]}
      testID={edge === "top" ? "calendar-focused-selected-week" : "calendar-focused-following-week"}
    >
      {children}
    </Animated.View>
  );
}

function FocusedAgenda({
  children,
  followingGeometry,
  opacity,
  selectedGeometry,
}: Readonly<{
  children: React.ReactNode;
  followingGeometry: CalendarWeekGeometry;
  opacity: Readonly<{ value: number }>;
  selectedGeometry: CalendarWeekGeometry;
}>) {
  const style = useAnimatedStyle(() => ({
    bottom: followingGeometry.height,
    opacity: opacity.value,
    top: selectedGeometry.height,
  }));
  return <Animated.View style={[styles.focusedAgenda, style]} testID="calendar-focused-agenda">{children}</Animated.View>;
}

export function CalendarMonthViewport({
  agenda,
  command,
  fontScale = 1,
  focusedWeek,
  layoutGeneration = 0,
  month,
  onCancel,
  onComplete,
  onPreview,
  onRelease,
  renderMonth,
  renderWeek,
  transition,
  weekCount = 6,
}: Readonly<{
  agenda?: React.ReactNode;
  command: CalendarMotionCommand | null;
  fontScale?: number;
  layoutGeneration?: number;
  focusedWeek: Readonly<{
    selectedDates: readonly LocalDate[];
    followingDates: readonly LocalDate[];
    selectedGeometry: CalendarWeekGeometry | null;
    followingGeometry: CalendarWeekGeometry | null;
  }> | null;
  month: LocalDate;
  onCancel(): void;
  onComplete(epoch: number): void;
  onPreview(dx: number, viewportWidth: number): void;
  onRelease(input: Readonly<{ dx: number; dy: number; targetMonthId: string; viewportWidth: number }>): void;
  renderMonth(month: LocalDate, interactive: boolean): React.ReactNode;
  renderWeek(dates: readonly LocalDate[], interactive: boolean): React.ReactNode;
  transition: CalendarTransitionState;
  weekCount?: number;
}>) {
  const pointerX = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const previewPanel = useSharedValue<PanelOffset>(0);
  const completionEpoch = useSharedValue(0);
  const weekCompletionEpoch = useSharedValue(0);
  const focusProgress = useSharedValue(0);
  const agendaOpacity = useSharedValue(transition.mode === "focused" ? 1 : 0);
  const released = useSharedValue(false);
  const diagnosticThresholdMask = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const panEnabled = useSharedValue(calendarMonthPanEnabled(transition.phase));
  const mounted = useRef(true);
  const lastWidth = useRef(0);
  const lastHeight = useRef(0);
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
    if (command?.kind !== "settle-week") return;
    const agendaMotion = calendarAgendaMotion(command);
    cancelAnimation(agendaOpacity);
    agendaOpacity.value = agendaMotion.delayMs > 0
      ? withDelay(agendaMotion.delayMs, withTiming(agendaMotion.opacity, { duration: agendaMotion.durationMs }))
      : withTiming(agendaMotion.opacity, { duration: agendaMotion.durationMs });
    const selectedGeometry = calendarWeekGeometryForGeneration(focusedWeek?.selectedGeometry, layoutGeneration);
    const followingGeometry = calendarWeekGeometryForGeneration(focusedWeek?.followingGeometry, layoutGeneration);
    if (selectedGeometry === null || followingGeometry === null) {
      return;
    }
    weekCompletionEpoch.value = command.epoch;
    recordPhase16CalendarFocus({
      selected: selectedGeometry,
      following: followingGeometry,
      destination: {
        selectedY: 0,
        followingY: Math.max(0, viewportHeight.value - followingGeometry.height),
      },
    });
    cancelAnimation(focusProgress);
    focusProgress.value = withTiming(command.phase === "expand" ? 1 : 0, {
      duration: command.durationMs,
      easing: Easing.bezier(command.easing[0], command.easing[1], command.easing[2], command.easing[3]),
    }, (finished) => {
      if (finished && weekCompletionEpoch.value === command.epoch) {
        scheduleOnRN(onComplete, command.epoch);
      }
    });
  }, [agendaOpacity, command, focusProgress, focusedWeek?.followingGeometry, focusedWeek?.selectedGeometry, layoutGeneration, onCancel, onComplete, viewportHeight, weekCompletionEpoch]);

  useEffect(() => {
    if (!transition.reducedMotion) return;
    cancelAnimation(focusProgress);
    focusProgress.value = transition.mode === "focused" ? 1 : 0;
    cancelAnimation(agendaOpacity);
    agendaOpacity.value = transition.mode === "focused" ? 1 : 0;
  }, [agendaOpacity, focusProgress, transition.mode, transition.reducedMotion]);

  useEffect(() => {
    if (transition.phase !== "idle") return;
    cancelAnimation(pointerX);
    pointerX.value = 0;
    previewPanel.value = 0;
  }, [pointerX, previewPanel, transition.epoch, transition.phase]);

  useEffect(() => {
    panEnabled.value = calendarMonthPanEnabled(transition.phase);
  }, [panEnabled, transition.phase]);

  const pan = Gesture.Pan()
    .enabled(calendarMonthPanEnabled(transition.phase))
    .manualActivation(true)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (touch === undefined) return;
      touchStartX.value = touch.absoluteX;
      touchStartY.value = touch.absoluteY;
    })
    .onTouchesMove((event, manager) => {
      if (!panEnabled.value) {
        manager.fail();
        return;
      }
      const touch = event.allTouches[0];
      if (touch === undefined) return;
      const dx = touch.absoluteX - touchStartX.value;
      const dy = touch.absoluteY - touchStartY.value;
      if (Math.abs(dx) < SLOP_DP && Math.abs(dy) < SLOP_DP) return;
      if (Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_INTENT_RATIO) manager.activate();
      else manager.fail();
    })
    .onBegin(() => {
      if (!panEnabled.value) return;
      released.value = false;
      diagnosticThresholdMask.value = 0;
      completionEpoch.value += 1;
      cancelAnimation(pointerX);
    })
    .onChange((event) => {
      const width = viewportWidth.value;
      if (width <= 0) return;
      const dx = Math.max(-width, Math.min(width, event.translationX));
      pointerX.value = dx;
      const nextPanel: PanelOffset = Math.abs(dx) >= width * 0.25 ? (dx < 0 ? 1 : -1) : 0;
      const progress = Math.abs(dx) / width;
      const markers = [0.1, 0.249, 0.25, 0.251];
      for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index]!;
        const bit = 1 << index;
        if (progress >= marker && (diagnosticThresholdMask.value & bit) === 0) {
          diagnosticThresholdMask.value |= bit;
          const semanticMonth = (nextPanel === 1 ? nextMonth : nextPanel === -1 ? previousMonth : month).slice(0, 7);
          const titleMonth = (nextPanel === 1 ? nextMonth : nextPanel === -1 ? previousMonth : month).slice(0, 7);
          scheduleOnRN(recordPhase16CalendarDrag, { dx, viewportWidth: width, transformX: dx, semanticMonth, titleMonth });
        }
      }
      if (nextPanel !== previewPanel.value) {
        previewPanel.value = nextPanel;
        scheduleOnRN(onPreview, dx, width);
      }
    })
    .onEnd((event) => {
      const width = viewportWidth.value;
      if (width <= 0) return;
      released.value = true;
      const dx = Math.max(-width, Math.min(width, event.translationX));
      const selectedMonth = (Math.abs(dx) >= width * 0.25 ? (dx < 0 ? nextMonth : previousMonth) : month).slice(0, 7);
      scheduleOnRN(recordPhase16CalendarRelease, { dx, viewportWidth: width, semanticMonth: selectedMonth, titleMonth: selectedMonth });
      scheduleOnRN(onRelease, {
        dx,
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
        scheduleOnRN(recordPhase16CalendarCancel);
        scheduleOnRN(onCancel);
      }
    });

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    const nextHeight = event.nativeEvent.layout.height;
    viewportHeight.value = nextHeight;
    if (nextWidth <= 0 || nextHeight <= 0 || (nextWidth === lastWidth.current && nextHeight === lastHeight.current)) return;
    const hadMeasurement = lastWidth.current > 0 && lastHeight.current > 0;
    lastWidth.current = nextWidth;
    lastHeight.current = nextHeight;
    viewportWidth.value = nextWidth;
    cancelAnimation(pointerX);
    pointerX.value = 0;
    previewPanel.value = 0;
    if (hadMeasurement && mounted.current) onCancel();
  };

  const trackMetrics = calendarTrackMetrics(fontScale);
  const minimumHeight = trackMetrics.rowMinHeight
    * (transition.mode === "focused" ? 2 : weekCount)
    + (transition.mode === "focused" ? 110 : 0);
  const fallbackSelectedGeometry = Object.freeze({ y: 0, height: trackMetrics.rowMinHeight, generation: layoutGeneration });
  const fallbackFollowingGeometry = Object.freeze({
    y: Math.max(0, (weekCount - 1) * trackMetrics.rowMinHeight),
    height: trackMetrics.rowMinHeight,
    generation: layoutGeneration,
  });
  const selectedGeometry = focusedWeek?.selectedGeometry ?? fallbackSelectedGeometry;
  const followingGeometry = focusedWeek?.followingGeometry ?? fallbackFollowingGeometry;
  const hasFocusedComposition = focusedWeek !== null
    && (command?.kind === "settle-week" || transition.mode === "focused");

  return (
    <ScrollView
      contentContainerStyle={[styles.verticalContent, { minHeight: minimumHeight }]}
      nestedScrollEnabled
      scrollEnabled
      style={styles.verticalScroll}
      testID="calendar-vertical-scroll"
    >
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
        {hasFocusedComposition ? (
          <>
            <FocusedWeekOverlay edge="top" geometry={selectedGeometry} progress={focusProgress} viewportHeight={viewportHeight}>
              {renderWeek(focusedWeek.selectedDates, transition.phase === "idle")}
            </FocusedWeekOverlay>
            <FocusedAgenda
              followingGeometry={followingGeometry}
              opacity={agendaOpacity}
              selectedGeometry={selectedGeometry}
            >
              {agenda}
            </FocusedAgenda>
            <FocusedWeekOverlay edge="bottom" geometry={followingGeometry} progress={focusProgress} viewportHeight={viewportHeight}>
              {renderWeek(focusedWeek.followingDates, transition.phase === "idle")}
            </FocusedWeekOverlay>
          </>
        ) : null}
        </View>
      </GestureDetector>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { bottom: 0, left: 0, position: "absolute", top: 0 },
  focusedOverlay: { left: 0, position: "absolute", right: 0, top: 0 },
  focusedAgenda: { left: 0, minHeight: 0, position: "absolute", right: 0 },
  verticalContent: { flexGrow: 1 },
  verticalScroll: { flex: 1, minHeight: 0 },
  viewport: { flex: 1, minHeight: 0, overflow: "hidden" },
});
