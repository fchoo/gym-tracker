import React from "react";
import { Text } from "react-native";

import type { GarminConnectionControllerInput } from "../garmin/useGarminConnectionController";

export type GarminSyncScreenProps = GarminConnectionControllerInput & Readonly<{
  onOpenActivity(activityId: string): void;
}>;

/** Task 18-06-01 RED scaffold. */
export function GarminSyncScreen(_props: GarminSyncScreenProps) {
  return <Text>Garmin Sync unavailable</Text>;
}
