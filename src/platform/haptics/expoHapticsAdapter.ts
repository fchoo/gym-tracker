import {
  ImpactFeedbackStyle,
  impactAsync,
} from "expo-haptics";

import type {
  HapticsPort,
} from "../../domains/workout";

export function createExpoHapticsAdapter(): HapticsPort {
  return Object.freeze({
    async committed() {
      await impactAsync(ImpactFeedbackStyle.Light).catch(() => undefined);
    },
  });
}
