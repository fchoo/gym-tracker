import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";

import {
  addLocalDays,
  compareLocalDates,
  parseLocalDate,
  weekdayForLocalDate,
  type LocalDate,
} from "../../domains/scheduling/localDate";
import {
  FocusablePressable,
  PrimaryAction,
  SecondaryAction,
} from "./index";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type Month = Readonly<{
  year: number;
  month: number;
}>;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAY_SHORT_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const CALENDAR_COLUMNS = 7;
const CALENDAR_CELL_COUNT = 42;
const MONTH_SWIPE_COMPLETE_DISTANCE = 72;
const LAST_LOCAL_DATE = parseLocalDate("9999-12-31");
const COMPACT_DIALOG_INSET = space[1];
const COMPACT_DIALOG_PADDING = space[2];
const REGULAR_DIALOG_INSET = space[4];
const REGULAR_DIALOG_PADDING = space[4];
const MAX_DIALOG_WIDTH = 720;

function partsOf(value: LocalDate): Readonly<{
  year: number;
  month: number;
  day: number;
}> {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function toLocalDate(year: number, month: number, day: number): LocalDate {
  return parseLocalDate([
    year.toString().padStart(4, "0"),
    month.toString().padStart(2, "0"),
    day.toString().padStart(2, "0"),
  ].join("-"));
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function nextMonth(month: Month, direction: -1 | 1): Month | null {
  const next = month.month + direction;
  if (next === 0) {
    return month.year === 1 ? null : { year: month.year - 1, month: 12 };
  }
  if (next === 13) {
    return month.year === 9_999 ? null : { year: month.year + 1, month: 1 };
  }
  return { ...month, month: next };
}

function monthOf(value: LocalDate): Month {
  const { year, month } = partsOf(value);
  return { year, month };
}

function sameMonth(left: Month, right: Month): boolean {
  return left.year === right.year && left.month === right.month;
}

function validLocalDate(value: string | null | undefined): LocalDate | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  try {
    return parseLocalDate(value);
  } catch {
    return null;
  }
}

function specifiedLocalDateIsValid(
  value: string | undefined,
  parsedValue: LocalDate | null,
): boolean {
  return value === undefined || parsedValue !== null;
}

function weekdayIndex(value: LocalDate): number {
  const weekday = weekdayForLocalDate(value);
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ].indexOf(weekday);
}

function withinBounds(
  value: LocalDate,
  minimumDate: LocalDate | null,
  maximumDate: LocalDate | null,
): boolean {
  return (minimumDate === null || compareLocalDates(value, minimumDate) !== -1)
    && (maximumDate === null || compareLocalDates(value, maximumDate) !== 1);
}

function monthHasSelectableDate(
  month: Month | null,
  minimumDate: LocalDate | null,
  maximumDate: LocalDate | null,
): boolean {
  if (month === null) {
    return false;
  }
  const first = toLocalDate(month.year, month.month, 1);
  const last = toLocalDate(
    month.year,
    month.month,
    daysInMonth(month.year, month.month),
  );
  return (minimumDate === null || compareLocalDates(last, minimumDate) !== -1)
    && (maximumDate === null || compareLocalDates(first, maximumDate) !== 1);
}

function labelForMonth(month: Month): string {
  return `${MONTH_NAMES[month.month - 1]} ${month.year}`;
}

function longDateLabel(value: LocalDate): string {
  const weekday = weekdayForLocalDate(value);
  const { day, month, year } = partsOf(value);
  return `${weekday}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

function completeGridDates(firstOfMonth: LocalDate): LocalDate[] {
  let firstGridDate: LocalDate;
  try {
    firstGridDate = addLocalDays(firstOfMonth, -weekdayIndex(firstOfMonth));
  } catch {
    return Array.from({ length: CALENDAR_CELL_COUNT }, (_, offset) =>
      addLocalDays(firstOfMonth, offset));
  }
  try {
    return Array.from({ length: CALENDAR_CELL_COUNT }, (_, offset) =>
      addLocalDays(firstGridDate, offset));
  } catch {
    const lastGridDate = addLocalDays(LAST_LOCAL_DATE, -(CALENDAR_CELL_COUNT - 1));
    return Array.from({ length: CALENDAR_CELL_COUNT }, (_, offset) =>
      addLocalDays(lastGridDate, offset));
  }
}

export function calendarFieldMonthDirectionForHorizontalSwipe(
  translationX: number,
): -1 | 1 | null {
  "worklet";

  if (translationX <= -MONTH_SWIPE_COMPLETE_DISTANCE) {
    return 1;
  }
  if (translationX >= MONTH_SWIPE_COMPLETE_DISTANCE) {
    return -1;
  }
  return null;
}

export type CalendarFieldProps = Readonly<{
  label: string;
  value: string;
  onChange(value: string): void;
  allowEmpty?: boolean;
  defaultDate?: string;
  minimumDate?: string;
  maximumDate?: string;
  disabled?: boolean;
  help?: string;
}>;

/**
 * A civil-date selector. It never parses a date-only value through JavaScript
 * Date, so callers retain their LocalDate and timezone semantics.
 */
export function CalendarField({
  label,
  value,
  onChange,
  allowEmpty = false,
  defaultDate,
  minimumDate,
  maximumDate,
  disabled = false,
  help,
}: CalendarFieldProps) {
  const { colors } = useAppTheme();
  const { fontScale, height: windowHeight, width: windowWidth } =
    useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const dialogRef = useRef<View>(null);
  const wasOpenRef = useRef(false);
  const selectedValue = validLocalDate(value);
  const parsedDefault = validLocalDate(defaultDate);
  const defaultValue = parsedDefault ?? selectedValue;
  const minimum = validLocalDate(minimumDate);
  const maximum = validLocalDate(maximumDate);
  const boundsValid = specifiedLocalDateIsValid(minimumDate, minimum)
    && specifiedLocalDateIsValid(maximumDate, maximum)
    && ((minimum === null || maximum === null)
      || compareLocalDates(minimum, maximum) !== 1);
  const emptyValue = allowEmpty && value === "";
  const emptyDefaultValid = emptyValue
    && parsedDefault !== null
    && withinBounds(parsedDefault, minimum, maximum);
  const valid = boundsValid && (
    selectedValue !== null
    || emptyDefaultValid
  );
  const initialDisplayValue = selectedValue ?? (emptyDefaultValid
    ? parsedDefault
    : null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LocalDate | null>(selectedValue);
  const [displayMonth, setDisplayMonth] = useState<Month | null>(
    initialDisplayValue === null ? null : monthOf(initialDisplayValue),
  );

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      dialogRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
      const triggerHandle = findNodeHandle(triggerRef.current);
      AccessibilityInfo.setAccessibilityFocus(triggerHandle ?? 0);
    }
  }, [open]);

  const openCalendar = () => {
    const displayValue = selectedValue ?? (emptyDefaultValid
      ? parsedDefault
      : null);
    if (!valid || disabled || displayValue === null) {
      return;
    }
    setDraft(selectedValue);
    setDisplayMonth(monthOf(displayValue));
    setOpen(true);
  };

  const cancel = () => {
    setOpen(false);
  };

  const confirm = () => {
    if (draft !== null && withinBounds(draft, minimum, maximum)) {
      onChange(draft);
      setOpen(false);
    }
  };

  const moveDraft = (dayDelta: number) => {
    if (draft === null) {
      return;
    }
    let next: LocalDate;
    try {
      next = addLocalDays(draft, dayDelta);
    } catch {
      return;
    }
    if (!withinBounds(next, minimum, maximum)) {
      return;
    }
    setDraft(next);
    setDisplayMonth(monthOf(next));
  };

  const grid = useMemo(() => {
    if (displayMonth === null) {
      return [];
    }
    const first = toLocalDate(displayMonth.year, displayMonth.month, 1);
    return completeGridDates(first);
  }, [displayMonth]);

  const error = valid
    ? undefined
    : !boundsValid
      ? "Calendar date bounds are invalid."
      : emptyValue && parsedDefault === null
        ? "Enter a valid default YYYY-MM-DD date."
        : emptyValue
          ? "Default date must be within calendar bounds."
          : "Enter a valid YYYY-MM-DD date.";
  const triggerLabel = emptyValue ? "Choose date" : label;
  const calendarMonth = displayMonth ?? (selectedValue === null
    ? (emptyDefaultValid && parsedDefault !== null
        ? monthOf(parsedDefault)
        : null)
    : monthOf(selectedValue));
  const compactWidth = windowWidth <= 360;
  const dialogInset = compactWidth
    ? COMPACT_DIALOG_INSET
    : REGULAR_DIALOG_INSET;
  const dialogPadding = compactWidth
    ? COMPACT_DIALOG_PADDING
    : REGULAR_DIALOG_PADDING;
  const dialogWidth = Math.min(
    MAX_DIALOG_WIDTH,
    Math.max(0, windowWidth - (dialogInset * 2)),
  );
  const gridWidth = sizes.minimumTarget * CALENDAR_COLUMNS;
  const scrollFirst = windowHeight < 700 || fontScale >= 1.5;
  const moveMonth = (direction: -1 | 1) => {
    if (calendarMonth === null) {
      return;
    }
    const next = nextMonth(calendarMonth, direction);
    if (monthHasSelectableDate(next, minimum, maximum)) {
      setDisplayMonth(next);
    }
  };
  const horizontalMonthGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-24, 24])
      .runOnJS(true)
      .onEnd((event) => {
        const direction = calendarFieldMonthDirectionForHorizontalSwipe(
          event.translationX,
        );
        if (direction !== null) {
          moveMonth(direction);
        }
      }),
    [calendarMonth, maximum, minimum],
  );

  return (
    <View style={styles.field}>
      <Text style={[
        typeScale.label as TextStyle,
        { color: colors.textPrimary },
      ]}>
        {label}
      </Text>
      {help === undefined ? null : (
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: colors.textSecondary },
        ]}>
          {help}
        </Text>
      )}
      <FocusablePressable
        accessibilityHint="Opens an in-app calendar."
        accessibilityLabel={triggerLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || !valid }}
        disabled={disabled || !valid}
        focusable={valid && !disabled}
        onPress={openCalendar}
        ref={triggerRef}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: error === undefined ? colors.divider : colors.destructive,
            opacity: disabled || !valid ? 0.62 : 1,
          },
        ]}
      >
        <Text style={[
          typeScale.body as TextStyle,
          { color: colors.textPrimary },
        ]}>
          {emptyValue ? "Choose date" : value}
        </Text>
      </FocusablePressable>
      {error === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.destructive },
          ]}
        >
          {error}
        </Text>
      )}
      <Modal
        animationType="none"
        onRequestClose={cancel}
        transparent
        visible={open}
      >
        <View
          accessibilityViewIsModal
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScrollContent,
              scrollFirst && styles.modalScrollContentCompact,
              { padding: dialogInset },
            ]}
            horizontal={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={styles.modalScroll}
            testID="calendar-modal-scroll"
          >
            <View
              accessibilityLabel="Calendar dialog"
              accessibilityViewIsModal
              focusable
              ref={dialogRef}
              style={[
                styles.dialog,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.divider,
                  padding: dialogPadding,
                  width: dialogWidth,
                },
              ]}
              testID="calendar-dialog"
            >
              {calendarMonth === null ? null : (
                <>
                <Text
                  accessibilityRole="header"
                  style={[
                    typeScale.sectionTitle as TextStyle,
                    { color: colors.textPrimary },
                  ]}
                >
                  Select date
                </Text>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    typeScale.bodyStrong as TextStyle,
                    { color: colors.textPrimary },
                  ]}
                >
                  {draft === null ? "No date selected" : longDateLabel(draft)}
                </Text>
                <View style={styles.monthActions} testID="calendar-month-actions">
                  <SecondaryAction
                    disabled={!monthHasSelectableDate(
                      nextMonth(calendarMonth, -1),
                      minimum,
                      maximum,
                    )}
                    label="Previous month"
                    onPress={() => moveMonth(-1)}
                  />
                  <Text
                    accessibilityRole="header"
                    style={[
                      typeScale.sectionTitle as TextStyle,
                      styles.monthTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {labelForMonth(calendarMonth)}
                  </Text>
                  <SecondaryAction
                    disabled={!monthHasSelectableDate(
                      nextMonth(calendarMonth, 1),
                      minimum,
                      maximum,
                    )}
                    label="Next month"
                    onPress={() => moveMonth(1)}
                  />
                </View>
                <GestureDetector gesture={horizontalMonthGesture}>
                  <View accessibilityLabel="Calendar grid" testID="calendar-grid"
                    accessibilityValue={{ text: draft ?? "" }}
                    style={[styles.grid, { width: gridWidth }]}>
                  {WEEKDAY_SHORT_NAMES.map((weekday, index) => (
                    <Text
                      accessibilityLabel={weekday}
                      key={weekday}
                      style={[
                      typeScale.label as TextStyle,
                      styles.weekday,
                      { color: colors.textSecondary },
                    ]}
                      testID={`calendar-weekday-${index}`}
                    >
                      {compactWidth || fontScale >= 1.5
                        ? weekday.slice(0, 1)
                        : weekday}
                    </Text>
                  ))}
                  {grid.map((date) => {
                    const isSelected = draft === date;
                    const selectable = withinBounds(date, minimum, maximum);
                    const adjacent = !sameMonth(monthOf(date), calendarMonth);
                    return (
                      <FocusablePressable
                        accessibilityLabel={`Select ${date}`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !selectable, selected: isSelected }}
                        disabled={!selectable}
                        key={date}
                        onKeyDown={(event: { nativeEvent: { key: string } }) => {
                          const deltas: Record<string, number> = {
                            ArrowDown: 7,
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                          };
                          const delta = deltas[event.nativeEvent.key];
                          if (delta !== undefined) {
                            moveDraft(delta);
                            return;
                          }
                          if (event.nativeEvent.key === "Enter"
                            || event.nativeEvent.key === " ") {
                            if (selectable) {
                              setDraft(date);
                              setDisplayMonth(monthOf(date));
                            }
                          }
                        }}
                        onPress={() => {
                          setDraft(date);
                          setDisplayMonth(monthOf(date));
                        }}
                        style={[
                          styles.day,
                          {
                            backgroundColor: isSelected
                              ? colors.action
                              : colors.surfaceSubtle,
                            borderColor: isSelected ? colors.action : colors.divider,
                            opacity: !selectable ? 0.48 : adjacent ? 0.72 : 1,
                          },
                        ]}
                        testID={`calendar-day-${date}`}
                      >
                        <Text style={[
                          typeScale.bodyStrong as TextStyle,
                          { color: isSelected ? colors.onAction : colors.textPrimary },
                        ]}>
                          {partsOf(date).day}
                        </Text>
                      </FocusablePressable>
                    );
                  })}
                  </View>
                </GestureDetector>
                {defaultValue === null ? null : (
                  <SecondaryAction
                    disabled={!withinBounds(defaultValue, minimum, maximum)}
                    label="Use Default Date"
                    onPress={() => {
                      setDraft(defaultValue);
                      setDisplayMonth(monthOf(defaultValue));
                    }}
                  />
                )}
                <View style={styles.confirmActions} testID="calendar-confirm-actions">
                  <SecondaryAction label="Keep Original Date" onPress={cancel} />
                  <PrimaryAction
                    disabled={draft === null || !withinBounds(draft, minimum, maximum)}
                    label="Apply Date"
                    onPress={confirm}
                  />
                </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  confirmActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    justifyContent: "flex-end",
  },
  day: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    height: sizes.minimumTarget,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    width: sizes.minimumTarget,
  },
  dialog: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
  },
  field: {
    gap: space[1],
  },
  grid: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  modalBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
  },
  modalScroll: {
    flex: 1,
    width: "100%",
  },
  modalScrollContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
  },
  modalScrollContentCompact: {
    justifyContent: "flex-start",
  },
  monthActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    justifyContent: "space-between",
  },
  monthTitle: {
    flexGrow: 1,
    textAlign: "center",
  },
  trigger: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  weekday: {
    minWidth: sizes.minimumTarget,
    textAlign: "center",
    width: sizes.minimumTarget,
  },
});
