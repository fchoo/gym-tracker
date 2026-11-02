import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type TextStyle } from "react-native";

import type { LocalDate } from "../../domains/scheduling";
import { FocusablePressable, IconAction } from "../components";
import { BottomSheet } from "../components/BottomSheet";
import { calendarTypeScale, radius, sizes, space, typeScale, useAppTheme } from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
// Calendar reads include adjacent months and their complete civil weeks.
const FIRST_YEAR = 2;
const LAST_YEAR = 9_998;
const YEAR_PAGE_SIZE = 12;
const boundedYearPage = (start: number) => Math.max(FIRST_YEAR, Math.min(LAST_YEAR - YEAR_PAGE_SIZE + 1, start));

export function CalendarMonthPicker({
  month,
  onCancel,
  onSelectMonth,
  restoreFocusRef,
  visible,
}: Readonly<{
  month: LocalDate;
  onCancel(): void;
  onSelectMonth(monthId: string): void;
  restoreFocusRef: React.RefObject<View | null>;
  visible: boolean;
}>) {
  const { colors } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const [choosingYear, setChoosingYear] = useState(false);
  const [yearPage, setYearPage] = useState(() => boundedYearPage(year - 5));
  useEffect(() => {
    if (!visible) return;
    const currentYear = Number(month.slice(0, 4));
    setYear(currentYear);
    setYearPage(boundedYearPage(currentYear - 5));
    setChoosingYear(false);
  }, [month, visible]);

  const columns = fontScale >= 1.75 ? 1 : width < 600 ? 2 : 3;
  const options = choosingYear
    ? Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => ({
        label: String(yearPage + index),
        accessibilityLabel: `Choose ${yearPage + index}`,
        selected: yearPage + index === year,
        onPress: () => { setYear(yearPage + index); setChoosingYear(false); },
      }))
    : MONTH_NAMES.map((label, index) => {
        const monthId = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
        return {
          label,
          accessibilityLabel: `Show ${label} ${year}`,
          selected: monthId === month.slice(0, 7),
          onPress: () => onSelectMonth(monthId),
        };
      });
  const previousAvailable = choosingYear ? yearPage > FIRST_YEAR : year > FIRST_YEAR;
  const nextAvailable = choosingYear ? yearPage + YEAR_PAGE_SIZE - 1 < LAST_YEAR : year < LAST_YEAR;

  return (
    <BottomSheet
      cancelLabel="Close month and year picker"
      heading="Choose month and year"
      headingStyle={calendarTypeScale.heading as TextStyle}
      onCancel={onCancel}
      restoreFocusRef={restoreFocusRef}
      testID="calendar-month-picker"
      visible={visible}
    >
      <View style={styles.yearNavigation}>
        <IconAction
          accessibilityLabel={choosingYear ? "Show earlier years" : "Previous year"}
          disabled={!previousAvailable}
          icon="back"
          onPress={() => choosingYear ? setYearPage(boundedYearPage(yearPage - YEAR_PAGE_SIZE)) : setYear(year - 1)}
        />
        <FocusablePressable
          accessibilityLabel={choosingYear ? `Choose month in ${year}` : `Choose year, ${year}`}
          accessibilityRole="button"
          onPress={() => { setYearPage(boundedYearPage(year - 5)); setChoosingYear(!choosingYear); }}
          style={styles.yearTitle}
        >
          <Text style={[calendarTypeScale.heading as TextStyle, { color: colors.textPrimary }]}>
            {choosingYear ? `${yearPage}–${yearPage + YEAR_PAGE_SIZE - 1}` : year}
          </Text>
        </FocusablePressable>
        <IconAction
          accessibilityLabel={choosingYear ? "Show later years" : "Next year"}
          disabled={!nextAvailable}
          icon="forward"
          onPress={() => choosingYear ? setYearPage(boundedYearPage(yearPage + YEAR_PAGE_SIZE)) : setYear(year + 1)}
        />
      </View>
      <View style={styles.options}>
        {Array.from({ length: Math.ceil(options.length / columns) }, (_, row) => (
          <View key={row} style={styles.optionRow}>
            {options.slice(row * columns, (row + 1) * columns).map((option) => (
              <FocusablePressable
                accessibilityLabel={option.accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ selected: option.selected }}
                key={option.label}
                onPress={option.onPress}
                style={({ pressed }) => [styles.option, {
                  backgroundColor: option.selected || pressed ? colors.surfaceSubtle : "transparent",
                  borderColor: option.selected ? colors.blue : colors.divider,
                }]}
              >
                <Text style={[typeScale.bodyStrong as TextStyle, styles.optionLabel, { color: colors.textPrimary }]}>{option.label}</Text>
              </FocusablePressable>
            ))}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: { borderRadius: radius.standard, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: sizes.minimumTarget, minWidth: 0, padding: space[2] },
  optionLabel: { textAlign: "center" },
  optionRow: { flexDirection: "row", gap: space[2] },
  options: { gap: space[2] },
  yearNavigation: { alignItems: "center", flexDirection: "row", gap: space[2] },
  yearTitle: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: sizes.minimumTarget, minWidth: 0 },
});
