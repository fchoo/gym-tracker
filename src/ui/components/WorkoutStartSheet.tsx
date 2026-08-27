import React, {
  useEffect,
  useRef,
  useState,
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

export function WorkoutStartSheet({
  visible,
  scheduledDayId,
  planDays,
  onClose,
  onStartDay,
  onStartEmpty,
  allowRotationAdvance = false,
  restoreFocusRef,
}: Readonly<{
  visible: boolean;
  scheduledDayId?: string;
  planDays: readonly ActivatedPlanDay[];
  onClose: () => void;
  onStartDay: (dayId: string, advanceRotation: boolean) => void;
  onStartEmpty: (advanceRotation: boolean) => void;
  allowRotationAdvance?: boolean;
  restoreFocusRef?: React.RefObject<View | null>;
}>) {
  const { colors } = useAppTheme();
  const headingRef = useRef<View>(null);
  const [advanceRotation, setAdvanceRotation] = useState(false);

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
            This will not advance your schedule unless you explicitly mark the
            planned day complete or skipped.
          </Text>
          {allowRotationAdvance ? (
            <FocusablePressable
              accessibilityLabel="Advance rotation after this workout"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: advanceRotation }}
              focusable
              onPress={() => setAdvanceRotation((current) => !current)}
              style={[
                styles.checkbox,
                { borderColor: colors.divider },
              ]}
            >
              <Text
                style={[
                  typeScale.bodyStrong as TextStyle,
                  { color: colors.textPrimary },
                ]}
              >
                {advanceRotation ? "Selected" : "Not selected"}
              </Text>
              <Text
                style={[
                  typeScale.body as TextStyle,
                  { color: colors.textPrimary },
                ]}
              >
                Advance rotation after this workout
              </Text>
            </FocusablePressable>
          ) : null}
          {planDays.map((day) => (
            day.id === scheduledDayId ? (
              <PrimaryAction
                key={day.id}
                label={`Start ${day.name}`}
                onPress={() => onStartDay(day.id, advanceRotation)}
                testID="scheduled-start-option"
              />
            ) : (
              <PrimaryAction
                key={day.id}
                label={`Start ${day.name}`}
                onPress={() => onStartDay(day.id, advanceRotation)}
              />
            )
          ))}
          <SecondaryAction
            label="Start empty workout"
            onPress={() => onStartEmpty(advanceRotation)}
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
  checkbox: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});
