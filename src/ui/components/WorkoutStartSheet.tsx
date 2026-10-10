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
  typeScale,
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
          <WorkoutStartCancelAction onClose={onClose} />
    </BottomSheet>
  );
}
