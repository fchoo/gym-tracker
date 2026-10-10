import React from "react";
import { StyleSheet, View } from "react-native";

import { PrimaryAction, SecondaryAction } from "./index";
import { space } from "../theme";

export type WorkoutActionDockProps = Readonly<{
  completeLabel: string;
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
  onAddExercise,
  onComplete,
  state,
}: WorkoutActionDockProps) {
  const busy = state === "saving";
  return (
    <View style={styles.dock} testID="workout-action-dock">
      <View style={styles.action}>
        <SecondaryAction
          disabled={busy}
          label="Add exercise"
          onPress={onAddExercise}
        />
      </View>
      <View style={styles.action}>
        <PrimaryAction
          busy={busy}
          label={completeLabel}
          onPress={onComplete}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    gap: space[2],
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  action: { flex: 1 },
});
