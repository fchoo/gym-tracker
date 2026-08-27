import type {
  RestAlertPreferences,
  RestNotificationPermission,
  RestNotificationPort,
  RestRepository,
} from "../../domains/rest";
import {
  REST_NOTIFICATION_CHANNEL_IDS,
} from "../../domains/rest";
import {
  productionRestAlertPreferenceStore,
} from "../preferences/restAlertPreferenceStore";

export type RestNotificationPayloadV1 = Readonly<{
  version: 1;
  sessionId: string;
  restRevision: number;
  endsAtMs: number;
}>;

export type RestReconciliationResult =
  | Readonly<{
      outcome: "unchanged" | "scheduled" | "cancelled" | "expired";
      identifier: string;
      permission: RestNotificationPermission;
    }>
  | Readonly<{
      outcome: "permission_denied" | "permission_undetermined";
      permission: RestNotificationPermission;
    }>
  | Readonly<{
      outcome: "platform_failure" | "session_missing";
      permission: RestNotificationPermission;
    }>;

type RestAlertPreferenceStore = Readonly<{
  read(): unknown;
}>;

const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

function validPreferences(value: unknown): value is RestAlertPreferences {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).soundEnabled === "boolean"
    && typeof (value as Record<string, unknown>).vibrationEnabled === "boolean";
}

function channelIdFor(preferences: RestAlertPreferences): string {
  if (preferences.soundEnabled) {
    return preferences.vibrationEnabled
      ? REST_NOTIFICATION_CHANNEL_IDS.soundVibration
      : REST_NOTIFICATION_CHANNEL_IDS.soundOnly;
  }
  return preferences.vibrationEnabled
    ? REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly
    : REST_NOTIFICATION_CHANNEL_IDS.silent;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function parseRestNotificationPayload(
  value: unknown,
): RestNotificationPayloadV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || typeof record.sessionId !== "string"
    || record.sessionId.trim().length === 0
    || !nonNegativeInteger(record.restRevision)
    || !nonNegativeInteger(record.endsAtMs)
  ) {
    return null;
  }
  return {
    version: 1,
    sessionId: record.sessionId,
    restRevision: record.restRevision,
    endsAtMs: record.endsAtMs,
  };
}

function stableIdentifier(sessionId: string): string {
  return `rest:${sessionId}`;
}

export function createRestNotificationReconciler(input: Readonly<{
  repository: RestRepository;
  notifications: RestNotificationPort;
  preferences?: RestAlertPreferenceStore;
  nowMs: () => number;
}>) {
  return Object.freeze({
    async reconcile(
      sessionId: string,
      resolvedContext?: Awaited<ReturnType<RestRepository["getRestContext"]>>,
    ): Promise<RestReconciliationResult> {
      let permission: RestNotificationPermission = "undetermined";
      try {
        const storedPreferences = (input.preferences
          ?? productionRestAlertPreferenceStore).read()
          ?? DEFAULT_REST_ALERT_PREFERENCES;
        const preferences = validPreferences(storedPreferences)
          ? storedPreferences
          : DEFAULT_REST_ALERT_PREFERENCES;
        const context = resolvedContext
          ?? await input.repository.getRestContext(sessionId);
        if (context === null) {
          return { outcome: "session_missing", permission };
        }
        const nowMs = input.nowMs();
        let state = context.state;
        let expired = false;
        if (state.state === "running" && state.endsAtMs <= nowMs) {
          const result = await input.repository.expireRest({
            sessionId,
            expectedSessionRevision: context.sessionRevision,
            expectedRestRevision: state.revision,
            nowMs,
          });
          state = result.state;
          expired = true;
        }

        const identifier = stableIdentifier(sessionId);

        if (state.state !== "running") {
          const scheduled = await input.notifications.listScheduled();
          const related = scheduled.filter((request) => (
            request.identifier === identifier
            || request.identifier.startsWith(`${identifier}:`)
            || request.sessionId === sessionId
          ));
          for (const request of related) {
            await input.notifications.cancel(request.identifier);
          }
          return {
            outcome: expired
              ? "expired"
              : related.length > 0
                ? "cancelled"
                : "unchanged",
            identifier,
            permission,
          };
        }

        await input.notifications.ensureChannel(preferences);
        permission = await input.notifications.permission();
        if (permission !== "granted") {
          return {
            outcome: permission === "denied"
              ? "permission_denied"
              : "permission_undetermined",
            permission,
          };
        }

        const scheduled = await input.notifications.listScheduled();
        const related = scheduled.filter((request) => (
          request.identifier === identifier
          || request.identifier.startsWith(`${identifier}:`)
          || request.sessionId === sessionId
        ));
        const matching = related.filter((request) => (
          request.identifier === identifier
          && request.sessionId === sessionId
          && request.restRevision === state.revision
          && request.endsAtMs === state.endsAtMs
          && request.channelId === channelIdFor(preferences)
        ));
        if (matching.length === 1 && related.length === 1) {
          return { outcome: "unchanged", identifier, permission };
        }
        for (const request of related) {
          await input.notifications.cancel(request.identifier);
        }
        await input.notifications.schedule({
          identifier,
          sessionId,
          restRevision: state.revision,
          endsAtMs: state.endsAtMs,
          preferences,
        });
        return { outcome: "scheduled", identifier, permission };
      } catch {
        return { outcome: "platform_failure", permission };
      }
    },
  });
}
