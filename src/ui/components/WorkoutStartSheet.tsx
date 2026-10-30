import React from "react";
import {
  Text,
  View,
  type TextStyle,
} from "react-native";

import type { ActivatedPlanDay } from "../../domains/plans";
import {
  PrimaryAction,
  SecondaryAction,
} from "./index";
import { BottomSheet, useBottomSheetCancel } from "./BottomSheet";
import {
  workoutTypeScale,
  useAppTheme,
} from "../theme";

function WorkoutStartCancelAction({ onClose }: Readonly<{ onClose: () => void }>) {
  const cancelSheet = useBottomSheetCancel();

  return <SecondaryAction label="Return to Workout" onPress={cancelSheet ?? onClose} />;
}

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
  const scheduledDay = scheduledDayId === undefined
    ? undefined
    : planDays.find((day) => day.id === scheduledDayId);
  const otherPlanDays = planDays.filter((day) => day.id !== scheduledDayId);

  return (
    <BottomSheet
      heading="Start a workout"
      onCancel={onClose}
      restoreFocusRef={restoreFocusRef}
      scrollTestID="workout-start-sheet-content"
      visible={visible}
    >
          <Text
            style={[
              workoutTypeScale.body as TextStyle,
              { color: colors.textSecondary },
            ]}
          >
            Alternate, rest-day, and empty workouts do not advance your
            schedule. Completing the scheduled workout advances it.
          </Text>
          {scheduledDay === undefined ? null : <PrimaryAction
            label={`Start ${scheduledDay.name}`}
            onPress={() => onStartDay(scheduledDay.id)}
            testID="scheduled-start-option"
          />}
          {otherPlanDays.map((day) => <PrimaryAction
            key={day.id}
            label={`Start ${day.name}`}
            onPress={() => onStartDay(day.id)}
          />)}
          <SecondaryAction
            label="Start empty workout"
            onPress={() => onStartEmpty()}
          />
          <WorkoutStartCancelAction onClose={onClose} />
    </BottomSheet>
  );
}
