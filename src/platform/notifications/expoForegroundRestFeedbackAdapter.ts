import * as Notifications from "expo-notifications";
import {
  ImpactFeedbackStyle,
  impactAsync,
} from "expo-haptics";

import {
  REST_NOTIFICATION_CHANNEL_IDS,
  type ForegroundRestFeedbackPort,
} from "../../domains/rest";

let foregroundNotificationHandlerInstalled = false;

export function installForegroundRestNotificationHandler(): void {
  if (foregroundNotificationHandlerInstalled) {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  foregroundNotificationHandlerInstalled = true;
}

export function createExpoForegroundRestFeedbackAdapter(): ForegroundRestFeedbackPort {
  return Object.freeze({
    async playTone(_input: Readonly<{ sessionId: string }>) {
      installForegroundRestNotificationHandler();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Rest complete",
          body: "Your next working set is ready.",
          sound: "default",
          vibrate: [],
        },
        trigger: {
          channelId: REST_NOTIFICATION_CHANNEL_IDS.soundOnly,
        },
      });
    },
    vibrate: () => impactAsync(ImpactFeedbackStyle.Light),
  });
}
