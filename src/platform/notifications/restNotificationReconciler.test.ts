import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  RestAlertPreferences,
  RestCommandResult,
  RestNotificationPort,
  RestRepository,
  RestStateV1,
} from "../../domains/rest";
import {
  REST_NOTIFICATION_CHANNEL_ID,
  REST_NOTIFICATION_CHANNEL_IDS,
} from "../../domains/rest";
import {
  createRestNotificationReconciler,
  parseRestNotificationPayload,
} from "./restNotificationReconciler";

function running(
  revision = 3,
): Extract<RestStateV1, { state: "running" }> {
  return {
    version: 1,
    state: "running",
    revision,
    startedAtMs: 10_000,
    endsAtMs: 100_000,
    nextSetId: "set-2",
  };
}

function repository(
  state: RestStateV1,
  sessionRevision = 7,
): RestRepository & {
  expireRest: jest.MockedFunction<RestRepository["expireRest"]>;
} {
  const expired: RestCommandResult = {
    state: {
      version: 1,
      state: "expired",
      revision: state.revision + 1,
      expiredAtMs: 100_000,
      nextSetId: state.nextSetId,
    },
    sessionRevision: sessionRevision + 1,
    invalidationScopes: [
      ["active-workout", "session-1"],
      ["today"],
    ],
  };
  return {
    getRestState: jest.fn(async () => state),
    getRestContext: jest.fn(async () => ({ state, sessionRevision })),
    listActiveSessionIds: jest.fn(async () => ["session-1"]),
    currentRestRevision: jest.fn(async () => state.revision),
    startManualRest: jest.fn(async () => expired),
    pauseRest: jest.fn(async () => expired),
    resumeRest: jest.fn(async () => expired),
    adjustRest: jest.fn(async () => expired),
    skipRest: jest.fn(async () => expired),
    expireRest: jest.fn(async () => expired),
  };
}

function port(
  scheduled: Awaited<ReturnType<RestNotificationPort["listScheduled"]>> = [],
  permission: Awaited<ReturnType<RestNotificationPort["permission"]>> =
    "granted",
): RestNotificationPort & {
  cancel: jest.MockedFunction<RestNotificationPort["cancel"]>;
  schedule: jest.MockedFunction<RestNotificationPort["schedule"]>;
} {
  return {
    ensureChannel: jest.fn(async () => undefined),
    permission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => permission),
    listScheduled: jest.fn(async () => scheduled),
    cancel: jest.fn(async () => undefined),
    schedule: jest.fn(async ({ identifier }) => identifier),
    openSettings: jest.fn(async () => undefined),
  };
}

const defaultPreferences: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

function preferenceStore(value: unknown = defaultPreferences) {
  return { read: jest.fn(() => value) };
}

describe("Plan 01-09 rest notification reconciliation", () => {
  it("schedules exactly one stable future request when missing", async () => {
    const notifications = port();
    const reconciler = createRestNotificationReconciler({
      repository: repository(running()),
      notifications,
      nowMs: () => 40_000,
    });

    await expect(reconciler.reconcile("session-1")).resolves.toEqual({
      outcome: "scheduled",
      identifier: "rest:session-1",
      permission: "granted",
    });
    expect(notifications.schedule).toHaveBeenCalledWith({
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      preferences: defaultPreferences,
    });
  });

  it("keeps a matching request and replaces stale, duplicate, or malformed state", async () => {
    const matching = port([{
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      channelId: REST_NOTIFICATION_CHANNEL_ID,
    }]);
    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications: matching,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toMatchObject({
      outcome: "unchanged",
    });
    expect(matching.cancel).not.toHaveBeenCalled();
    expect(matching.schedule).not.toHaveBeenCalled();

    const stale = port([
      {
        identifier: "rest:session-1",
        sessionId: "session-1",
        restRevision: 2,
        endsAtMs: 90_000,
      },
      {
        identifier: "legacy-rest-duplicate",
        sessionId: "session-1",
        restRevision: 3,
        endsAtMs: 100_000,
      },
      {
        identifier: "rest:session-1:malformed",
        sessionId: null,
        restRevision: null,
        endsAtMs: null,
      },
    ]);
    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications: stale,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toMatchObject({
      outcome: "scheduled",
    });
    expect(stale.cancel.mock.calls.map(([identifier]) => identifier)).toEqual([
      "rest:session-1",
      "legacy-rest-duplicate",
      "rest:session-1:malformed",
    ]);
    expect(stale.schedule).toHaveBeenCalledTimes(1);
  });

  it("reads preferences once and replaces a channel mismatch without mutating rest facts", async () => {
    const source = repository(running());
    const preferences = preferenceStore();
    const notifications = port([{
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      channelId: REST_NOTIFICATION_CHANNEL_ID,
    }]);
    const reconciler = createRestNotificationReconciler({
      repository: source,
      notifications,
      preferences,
      nowMs: () => 40_000,
    });

    await expect(reconciler.reconcile("session-1")).resolves.toMatchObject({
      outcome: "unchanged",
    });
    expect(preferences.read).toHaveBeenCalledTimes(1);

    preferences.read.mockReturnValueOnce({
      soundEnabled: true,
      vibrationEnabled: false,
    });
    await expect(reconciler.reconcile("session-1")).resolves.toMatchObject({
      outcome: "scheduled",
    });
    expect(preferences.read).toHaveBeenCalledTimes(2);
    expect(notifications.cancel).toHaveBeenCalledWith("rest:session-1");
    expect(notifications.schedule).toHaveBeenLastCalledWith({
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      preferences: { soundEnabled: true, vibrationEnabled: false },
    });
    expect(notifications.ensureChannel).toHaveBeenLastCalledWith({
      soundEnabled: true,
      vibrationEnabled: false,
    });
    expect(source.expireRest).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "vibration-only",
      preferences: { soundEnabled: false, vibrationEnabled: true },
      channelId: REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly,
    },
    {
      label: "silent",
      preferences: { soundEnabled: false, vibrationEnabled: false },
      channelId: REST_NOTIFICATION_CHANNEL_IDS.silent,
    },
  ] satisfies ReadonlyArray<{
    label: string;
    preferences: RestAlertPreferences;
    channelId: string;
  }>)(
    "keeps a matching $label request without rescheduling",
    async ({ preferences, channelId }) => {
      const notifications = port([{
        identifier: "rest:session-1",
        sessionId: "session-1",
        restRevision: 3,
        endsAtMs: 100_000,
        channelId,
      }]);

      await expect(createRestNotificationReconciler({
        repository: repository(running()),
        notifications,
        preferences: preferenceStore(preferences),
        nowMs: () => 40_000,
      }).reconcile("session-1")).resolves.toEqual({
        outcome: "unchanged",
        identifier: "rest:session-1",
        permission: "granted",
      });
      expect(notifications.ensureChannel).toHaveBeenCalledWith(preferences);
      expect(notifications.cancel).not.toHaveBeenCalled();
      expect(notifications.schedule).not.toHaveBeenCalled();
    },
  );

  it("uses default preferences when the injected store has no value", async () => {
    const preferences = preferenceStore(null);
    const notifications = port([{
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      channelId: REST_NOTIFICATION_CHANNEL_IDS.soundVibration,
    }]);

    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications,
      preferences,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toMatchObject({
      outcome: "unchanged",
    });
    expect(preferences.read).toHaveBeenCalledTimes(1);
    expect(notifications.ensureChannel).toHaveBeenCalledWith(
      defaultPreferences,
    );
    expect(notifications.cancel).not.toHaveBeenCalled();
    expect(notifications.schedule).not.toHaveBeenCalled();
  });

  it("safely defaults malformed preference bytes without changing SQLite facts", async () => {
    const source = repository(running());
    const preferences = preferenceStore({
      soundEnabled: "yes",
      vibrationEnabled: true,
    });
    const notifications = port();

    await expect(createRestNotificationReconciler({
      repository: source,
      notifications,
      preferences,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toMatchObject({
      outcome: "scheduled",
    });
    expect(preferences.read).toHaveBeenCalledTimes(1);
    expect(notifications.schedule).toHaveBeenCalledWith(expect.objectContaining({
      preferences: defaultPreferences,
    }));
    expect(source.expireRest).not.toHaveBeenCalled();
  });

  it("cleans a session-scoped identifier even when its payload has no session", async () => {
    const notifications = port([
      {
        identifier: "rest:session-1:legacy",
        sessionId: null,
        restRevision: null,
        endsAtMs: null,
      },
      {
        identifier: "unrelated",
        sessionId: "session-1",
        restRevision: null,
        endsAtMs: null,
      },
      {
        identifier: "unrelated-other-session",
        sessionId: "session-2",
        restRevision: null,
        endsAtMs: null,
      },
    ]);

    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toMatchObject({
      outcome: "scheduled",
    });
    expect(notifications.cancel).toHaveBeenCalledWith(
      "rest:session-1:legacy",
    );
    expect(notifications.cancel).toHaveBeenCalledWith("unrelated");
    expect(notifications.cancel).not.toHaveBeenCalledWith(
      "unrelated-other-session",
    );
  });

  it("cancels requests for idle, paused, and expired states", async () => {
    for (const state of [
      {
        version: 1,
        state: "idle",
        revision: 4,
        nextSetId: null,
      },
      {
        version: 1,
        state: "paused",
        revision: 4,
        remainingMs: 30_000,
        nextSetId: "set-2",
      },
      {
        version: 1,
        state: "expired",
        revision: 4,
        expiredAtMs: 100_000,
        nextSetId: "set-2",
      },
    ] satisfies RestStateV1[]) {
      const notifications = port([{
        identifier: "rest:session-1",
        sessionId: "session-1",
        restRevision: 3,
        endsAtMs: 100_000,
      }]);
      await expect(createRestNotificationReconciler({
        repository: repository(state),
        notifications,
        nowMs: () => 40_000,
      }).reconcile("session-1")).resolves.toMatchObject({
        outcome: "cancelled",
      });
      expect(notifications.cancel).toHaveBeenCalledWith("rest:session-1");
      expect(notifications.schedule).not.toHaveBeenCalled();
    }
  });

  it("returns unchanged for a missing session and idle state without requests", async () => {
    const missingRepository = repository(running());
    jest.spyOn(missingRepository, "getRestContext").mockResolvedValueOnce(null);
    await expect(createRestNotificationReconciler({
      repository: missingRepository,
      notifications: port(),
      nowMs: () => 40_000,
    }).reconcile("missing")).resolves.toEqual({
      outcome: "session_missing",
      permission: "undetermined",
    });

    await expect(createRestNotificationReconciler({
      repository: repository({
        version: 1,
        state: "idle",
        revision: 4,
        nextSetId: null,
      }),
      notifications: port(),
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toEqual({
      outcome: "unchanged",
      identifier: "rest:session-1",
      permission: "undetermined",
    });

    const idleCleanup = port([
      {
        identifier: "rest:session-1:legacy",
        sessionId: null,
        restRevision: null,
        endsAtMs: null,
      },
      {
        identifier: "unrelated",
        sessionId: "session-1",
        restRevision: null,
        endsAtMs: null,
      },
      {
        identifier: "unrelated-other-session",
        sessionId: "session-2",
        restRevision: null,
        endsAtMs: null,
      },
    ]);
    await expect(createRestNotificationReconciler({
      repository: repository({
        version: 1,
        state: "idle",
        revision: 4,
        nextSetId: null,
      }),
      notifications: idleCleanup,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toMatchObject({
      outcome: "cancelled",
    });
    expect(idleCleanup.cancel.mock.calls.map(([identifier]) => identifier))
      .toEqual([
        "rest:session-1:legacy",
        "unrelated",
      ]);
  });

  it("expires late running state before cancellation", async () => {
    const source = repository(running(), 7);
    const notifications = port([{
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
    }]);
    const result = await createRestNotificationReconciler({
      repository: source,
      notifications,
      nowMs: () => 100_000,
    }).reconcile("session-1");

    expect(source.expireRest).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedSessionRevision: 7,
      expectedRestRevision: 3,
      nowMs: 100_000,
    });
    expect(result).toMatchObject({ outcome: "expired" });
    expect(notifications.cancel).toHaveBeenCalledWith("rest:session-1");
  });

  it("returns non-authoritative denied and platform-failure outcomes", async () => {
    const denied = port([], "denied");
    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications: denied,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toEqual({
      outcome: "permission_denied",
      permission: "denied",
    });
    expect(denied.schedule).not.toHaveBeenCalled();

    const undetermined = port([], "undetermined");
    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications: undetermined,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toEqual({
      outcome: "permission_undetermined",
      permission: "undetermined",
    });
    expect(undetermined.schedule).not.toHaveBeenCalled();

    const failed = port();
    jest.spyOn(failed, "listScheduled").mockRejectedValueOnce(
      new Error("platform_detail"),
    );
    await expect(createRestNotificationReconciler({
      repository: repository(running()),
      notifications: failed,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toEqual({
      outcome: "platform_failure",
      permission: "granted",
    });

    const readFailureSource = repository(running());
    const unavailablePreferences = preferenceStore();
    unavailablePreferences.read.mockImplementationOnce(() => {
      throw new Error("storage_unavailable");
    });
    const readFailureNotifications = port();
    await expect(createRestNotificationReconciler({
      repository: readFailureSource,
      notifications: readFailureNotifications,
      preferences: unavailablePreferences,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toEqual({
      outcome: "platform_failure",
      permission: "undetermined",
    });
    expect(readFailureSource.expireRest).not.toHaveBeenCalled();
    expect(readFailureNotifications.ensureChannel).not.toHaveBeenCalled();

    const scheduleFailureSource = repository(running());
    const scheduleFailure = port();
    scheduleFailure.schedule.mockRejectedValueOnce(new Error("schedule_failed"));
    await expect(createRestNotificationReconciler({
      repository: scheduleFailureSource,
      notifications: scheduleFailure,
      nowMs: () => 40_000,
    }).reconcile("session-1")).resolves.toEqual({
      outcome: "platform_failure",
      permission: "granted",
    });
    expect(scheduleFailureSource.expireRest).not.toHaveBeenCalled();
  });

  it("validates versioned payloads and rejects stale or malformed taps", () => {
    expect(parseRestNotificationPayload({
      version: 1,
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
    })).toEqual({
      version: 1,
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
    });
    for (const payload of [
      null,
      {},
      { version: 2, sessionId: "session-1", restRevision: 3 },
      { version: 1, sessionId: "", restRevision: 3 },
      { version: 1, sessionId: "session-1", restRevision: -1 },
      {
        version: 1,
        sessionId: "session-1",
        restRevision: 3,
        endsAtMs: -1,
      },
      [],
    ]) {
      expect(parseRestNotificationPayload(payload)).toBeNull();
    }
  });
});
