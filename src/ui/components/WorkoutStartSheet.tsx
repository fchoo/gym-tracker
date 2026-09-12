import React, {
  useEffect,
  useRef,
} from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type { ActivatedPlanDay } from "../../domains/plans";
import {
  PrimaryAction,
  SecondaryAction,
} from "./index";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export function WorkoutStartSheet({
  visible,
  scheduledDayId,
  planDays,
  onClose,
  onStartDay,
  onStartEmpty,
  restoreFocusRef,
}: Readonly<{
  visible: boolean;
  scheduledDayId?: string;
  planDays: readonly ActivatedPlanDay[];
  onClose: () => void;
  onStartDay: (dayId: string) => void;
  onStartEmpty: () => void;
  restoreFocusRef?: React.RefObject<View | null>;
}>) {
  const { colors } = useAppTheme();
  const headingRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      headingRef.current?.focus();
    }
  }, [visible]);

  function close() {
    onClose();
    restoreFocusRef?.current?.focus();
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={styles.backdrop}
      >
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          testID="workout-start-sheet-content"
        >
          <View
            accessibilityRole="header"
            accessible
            focusable
            ref={headingRef}
          >
            <Text
              style={[
                typeScale.screenTitle as TextStyle,
                { color: colors.textPrimary },
              ]}
            >
              Start a workout
            </Text>
          </View>
          <Text
            style={[
              typeScale.body as TextStyle,
              { color: colors.textSecondary },
            ]}
          >
            Alternate, rest-day, and empty workouts do not advance your
            schedule. Completing the scheduled workout advances it.
          </Text>
          {planDays.map((day) => (
            day.id === scheduledDayId ? (
              <PrimaryAction
                key={day.id}
                label={`Start ${day.name}`}
                onPress={() => onStartDay(day.id)}
                testID="scheduled-start-option"
              />
            ) : (
              <PrimaryAction
                key={day.id}
                label={`Start ${day.name}`}
                onPress={() => onStartDay(day.id)}
              />
            )
          ))}
          <SecondaryAction
            label="Start empty workout"
            onPress={() => onStartEmpty()}
          />
          <SecondaryAction label="Cancel" onPress={close} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.emphasized,
    borderTopRightRadius: radius.emphasized,
    maxHeight: "90%",
  },
  sheetContent: {
    gap: space[4],
    padding: space[6],
  },
});
