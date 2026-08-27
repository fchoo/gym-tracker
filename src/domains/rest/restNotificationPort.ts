export const REST_NOTIFICATION_CHANNEL_IDS = Object.freeze({
  soundVibration: "workout-rest-v2-sound-vibration",
  soundOnly: "workout-rest-v2-sound-only",
  vibrationOnly: "workout-rest-v2-vibration-only",
  silent: "workout-rest-v2-silent",
} as const);

export const REST_NOTIFICATION_CHANNEL_ID =
  REST_NOTIFICATION_CHANNEL_IDS.soundVibration;

export type RestAlertPreferences = Readonly<{
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}>;

export type RestNotificationPermission =
  | "granted"
  | "denied"
  | "undetermined";

export type ScheduledRestNotification = Readonly<{
  identifier: string;
  sessionId: string | null;
  restRevision: number | null;
  endsAtMs: number | null;
  channelId?: string | null;
}>;

export type RestNotificationScheduleInput = Readonly<{
  identifier: string;
  sessionId: string;
  restRevision: number;
  endsAtMs: number;
  preferences?: RestAlertPreferences;
}>;

export interface ForegroundRestFeedbackPort {
  playTone(input: Readonly<{ sessionId: string }>): Promise<void>;
  vibrate(): Promise<void>;
}

export interface RestNotificationPort {
  ensureChannel(preferences?: RestAlertPreferences): Promise<void>;
  permission(): Promise<RestNotificationPermission>;
  requestPermission(): Promise<RestNotificationPermission>;
  listScheduled(): Promise<readonly ScheduledRestNotification[]>;
  cancel(identifier: string): Promise<void>;
  schedule(input: RestNotificationScheduleInput): Promise<string>;
  openSettings(): Promise<void>;
}
