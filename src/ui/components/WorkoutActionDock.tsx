import React from "react";
import { StyleSheet, View } from "react-native";

import { PrimaryAction, SecondaryAction } from "./index";
import { space } from "../theme";

export type WorkoutActionDockProps = Readonly<{
  completeLabel: string;
  addExerciseRef?: React.Ref<View> | undefined;
  onAddExercise: () => void;
  onComplete: () => void;
  state: "ready" | "saving" | "failed";
}>;

/**
 * Pure presentation for the active workout's two gym-floor intents. The screen
 * owns command identity, retry, commit acknowledgement, and source updates.
 */
export function WorkoutActionDock({
  completeLabel,
  addExerciseRef,
  onAddExercise,
  onComplete,
  state,
}: WorkoutActionDockProps) {
  const busy = state === "saving";
  return (
    <View style={styles.dock} testID="workout-action-dock">
      <View style={[styles.action, styles.addAction]} testID="workout-action-dock-add">
        <SecondaryAction
          disabled={busy}
          label="Add exercise"
          onPress={onAddExercise}
          ref={addExerciseRef}
          style={styles.compactAction}
        />
      </View>
      <View style={styles.action}>
        <PrimaryAction
          busy={busy}
          label={completeLabel}
          onPress={onComplete}
          style={styles.compactAction}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  action: { flexBasis: 0, flexGrow: 1, minWidth: 0 },
  addAction: { flexBasis: 128, minWidth: 128 },
  compactAction: { minHeight: 56 },
});
