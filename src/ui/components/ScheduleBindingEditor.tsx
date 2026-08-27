import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ScheduleEditorDay,
  ScheduleEditorRotationBinding,
  ScheduleEditorWeekdayBinding,
} from "../../bootstrap/scheduleRuntime";
import type {
  Weekday,
} from "../../domains/scheduling/localDate";
import {
  PlanEditorReorderableRow,
} from "./PlanEditorFields";
import {
  FocusablePressable,
  SecondaryAction,
} from "./index";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ScheduleBindingMode = "weekday" | "rotation";

const weekdays: readonly Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function reordered<Value>(
  values: readonly Value[],
  index: number,
  direction: -1 | 1,
): readonly Value[] {
  const destination = index + direction;
  if (destination < 0 || destination >= values.length) {
    return values;
  }
  const next = [...values];
  const value = next[index]!;
  next[index] = next[destination]!;
  next[destination] = value;
  return next;
}

export function ScheduleModeSelector({
  mode,
  onChange,
}: Readonly<{
  mode: ScheduleBindingMode;
  onChange(mode: ScheduleBindingMode): void;
}>) {
  const { colors } = useAppTheme();

  return (
    <View accessibilityRole="radiogroup" style={styles.segmented}>
      {(["weekday", "rotation"] as const).map((option) => {
        const selected = option === mode;
        const label = option === "weekday" ? "Weekday" : "Rotation";
        return (
          <FocusablePressable
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            focusable
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.mode,
              {
                backgroundColor: selected ? colors.action : colors.surface,
                borderColor: selected ? colors.action : colors.divider,
              },
            ]}
          >
            <Text style={[
              typeScale.bodyStrong as TextStyle,
              { color: selected ? colors.onAction : colors.textPrimary },
            ]}>
              {label}
            </Text>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

function WeekdayEditor({
  days,
  bindings,
  onChange,
}: Readonly<{
  days: readonly ScheduleEditorDay[];
  bindings: readonly ScheduleEditorWeekdayBinding[];
  onChange(bindings: readonly ScheduleEditorWeekdayBinding[]): void;
}>) {
  const { colors } = useAppTheme();

  function changeWeekday(index: number, weekday: Weekday) {
    onChange(bindings.map((binding, bindingIndex) => (
      bindingIndex === index ? { ...binding, weekday } : binding
    )));
  }

  function remove(index: number) {
    onChange(bindings
      .filter((_, bindingIndex) => bindingIndex !== index)
      .map((binding, ordinal) => ({ ...binding, ordinal })));
  }

  function add() {
    const planDayId = days[bindings.length % Math.max(days.length, 1)]?.id;
    if (planDayId === undefined) {
      return;
    }
    const used = new Set(bindings.map(({ weekday }) => weekday));
    const weekday = weekdays.find((candidate) => !used.has(candidate))
      ?? weekdays[bindings.length % weekdays.length]!;
    onChange([
      ...bindings,
      {
        ordinal: bindings.length,
        weekIndex: 0,
        weekday,
        planDayId,
      },
    ]);
  }

  return (
    <View style={styles.list}>
      {bindings.map((binding, index) => {
        const day = days.find(({ id }) => id === binding.planDayId);
        return (
          <View
            key={`${binding.weekIndex}:${binding.weekday}:${binding.planDayId}:${index}`}
            style={[styles.binding, { borderColor: colors.divider }]}
          >
            <Text style={[
              typeScale.bodyStrong as TextStyle,
              { color: colors.textPrimary },
            ]}>
              {`${binding.weekday} · ${day?.name ?? binding.planDayId}`}
            </Text>
            <View
              accessibilityLabel={`Weekday for ${day?.name ?? binding.planDayId}`}
              accessibilityRole="radiogroup"
              style={styles.weekdays}
            >
              {weekdays.map((weekday) => (
                <FocusablePressable
                  accessibilityLabel={`${day?.name ?? binding.planDayId}: ${weekday}`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: weekday === binding.weekday,
                    selected: weekday === binding.weekday,
                  }}
                  focusable
                  key={weekday}
                  onPress={() => changeWeekday(index, weekday)}
                  style={[
                    styles.weekday,
                    {
                      borderColor: weekday === binding.weekday
                        ? colors.action
                        : colors.divider,
                    },
                  ]}
                >
                  <Text style={[
                    typeScale.secondary as TextStyle,
                    { color: colors.textPrimary },
                  ]}>
                    {weekday.slice(0, 3)}
                  </Text>
                </FocusablePressable>
              ))}
            </View>
            <SecondaryAction
              label={`Remove ${day?.name ?? binding.planDayId} binding`}
              onPress={() => remove(index)}
            />
          </View>
        );
      })}
      <SecondaryAction
        disabled={days.length === 0}
        label="Add weekday binding"
        onPress={add}
      />
    </View>
  );
}

function RotationEditor({
  days,
  bindings,
  onChange,
}: Readonly<{
  days: readonly ScheduleEditorDay[];
  bindings: readonly ScheduleEditorRotationBinding[];
  onChange(bindings: readonly ScheduleEditorRotationBinding[]): void;
}>) {
  function move(index: number, direction: -1 | 1) {
    onChange(reordered(bindings, index, direction).map(
      (binding, ordinal) => ({ ...binding, ordinal }),
    ));
  }

  return (
    <View style={styles.list}>
      {bindings.map((binding, index) => {
        const day = days.find(({ id }) => id === binding.planDayId);
        const name = day?.name ?? binding.planDayId;
        return (
          <PlanEditorReorderableRow
            count={bindings.length}
            key={`${binding.planDayId}:${index}`}
            label={name}
            onMoveDown={() => move(index, 1)}
            onMoveUp={() => move(index, -1)}
            position={index}
          >
            <Text>
              {`${index + 1}. ${name}`}
            </Text>
          </PlanEditorReorderableRow>
        );
      })}
    </View>
  );
}

export function ScheduleBindingEditor({
  days,
  mode,
  weekdayBindings,
  rotationBindings,
  onWeekdayBindings,
  onRotationBindings,
}: Readonly<{
  days: readonly ScheduleEditorDay[];
  mode: ScheduleBindingMode;
  weekdayBindings: readonly ScheduleEditorWeekdayBinding[];
  rotationBindings: readonly ScheduleEditorRotationBinding[];
  onWeekdayBindings(bindings: readonly ScheduleEditorWeekdayBinding[]): void;
  onRotationBindings(bindings: readonly ScheduleEditorRotationBinding[]): void;
}>) {
  return mode === "weekday" ? (
    <WeekdayEditor
      bindings={weekdayBindings}
      days={days}
      onChange={onWeekdayBindings}
    />
  ) : (
    <RotationEditor
      bindings={rotationBindings}
      days={days}
      onChange={onRotationBindings}
    />
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  mode: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: 132,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  list: {
    gap: space[2],
  },
  binding: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    paddingVertical: space[2],
  },
  weekdays: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[1],
  },
  weekday: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: sizes.focusRing,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    padding: space[2],
  },
});
