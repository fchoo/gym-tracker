import { renderHook } from "@testing-library/react-native";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";

import { useExpoRestCountdownCueAdapter } from "../audio/expoRestCountdownCueAdapter";
import { claimForegroundRestSound } from "../audio/foregroundRestSoundOwnership";
import { createExpoForegroundRestFeedbackAdapter, installForegroundRestNotificationHandler } from "./expoForegroundRestFeedbackAdapter";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));
jest.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: jest.fn() }));

jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: jest.fn(() => ({
    pause: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
}));

const input = { sessionId: "session-countdown", restRevision: 3, endsAtMs: 100_000 };
let handler: NonNullable<Parameters<typeof Notifications.setNotificationHandler>[0]>["handleNotification"];
let descriptor: PropertyDescriptor | undefined;
let state: AppStateStatus;
const appStateListeners = new Set<(next: AppStateStatus) => void>();
const appStateChanged = (next: AppStateStatus) => {
  for (const listener of [...appStateListeners]) listener(next);
};
let appStateListener: jest.SpiedFunction<typeof AppState.addEventListener>;

function notification(data: unknown = { version: 1, ...input }, identifier = `rest:${input.sessionId}`) {
  return { request: { identifier, content: { data } } } as Notifications.Notification;
}
async function sound(data?: unknown, identifier?: string) {
  return (await handler(notification(data, identifier))).shouldPlaySound;
}

beforeAll(() => {
  installForegroundRestNotificationHandler();
  handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0]![0]!.handleNotification;
  descriptor = Object.getOwnPropertyDescriptor(AppState, "currentState");
  Object.defineProperty(AppState, "currentState", { configurable: true, get: () => state });
  appStateListener = jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: jest.fn(() => appStateListeners.delete(listener)) };
  });
});
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(99_000);
  state = "active";
});
afterEach(() => {
  state = "background";
  appStateChanged?.("background");
  jest.useRealTimers();
});

describe("scheduled foreground rest sound ownership", () => {
  it("suppresses only the exact scheduled session, revision, deadline, and valid V1 payload", async () => {
    claimForegroundRestSound(input);
    expect(await sound()).toBe(false);
    for (const replacement of [
      { sessionId: "other-session" }, { restRevision: 2 }, { endsAtMs: 99_999 },
      { version: 2 }, { restRevision: "3" }, { endsAtMs: -1 }, { sessionId: "" },
    ]) {
      expect(await sound({ version: 1, ...input, ...replacement })).toBe(true);
    }
    expect(await sound({ version: 1, ...input }, "unrelated-notification")).toBe(true);
    expect(await sound(null)).toBe(true);
    expect(await sound({})).toBe(true);
  });

  it("preserves the exact claim through natural-expiry unmount for a bounded grace only", async () => {
    const claim = claimForegroundRestSound(input);
    jest.setSystemTime(input.endsAtMs);
    claim.release();
    expect(await sound()).toBe(false);
    jest.setSystemTime(input.endsAtMs + 2_999);
    expect(await sound()).toBe(false);
    jest.setSystemTime(input.endsAtMs + 3_000);
    expect(await sound()).toBe(true);
  });

  it("clears ownership immediately for manual controls and for a route leaving before expiry", async () => {
    const manual = claimForegroundRestSound(input);
    manual.clear();
    expect(await sound()).toBe(true);
    const unmounted = claimForegroundRestSound(input);
    unmounted.release();
    expect(await sound()).toBe(true);
    const atDeadline = claimForegroundRestSound(input);
    jest.setSystemTime(input.endsAtMs);
    atDeadline.clear();
    expect(await sound()).toBe(true);
  });

  it("keeps background delivery audible and cannot resurrect ownership on foreground return", async () => {
    claimForegroundRestSound(input);
    state = "inactive";
    expect(await sound()).toBe(true);
    appStateChanged?.("inactive");
    state = "background";
    expect(await sound()).toBe(true);
    state = "active";
    expect(await sound()).toBe(true);
    claimForegroundRestSound(input);
    expect(await sound()).toBe(false);
  });

  it("does not let cleanup from an old revision clear the newly claimed deadline", async () => {
    const old = claimForegroundRestSound(input);
    const next = { ...input, restRevision: 4, endsAtMs: 115_000 };
    claimForegroundRestSound(next);
    old.clear();
    expect(await sound()).toBe(true);
    expect(await sound({ version: 1, ...next })).toBe(false);
  });

  it("retains expired rest A grace while rest B in the same session owns its next deadline", async () => {
    const rendered = await renderHook(() => useExpoRestCountdownCueAdapter());
    const port = rendered.result.current;
    const releaseA = port.claimForegroundRestSound!(input);
    jest.setSystemTime(input.endsAtMs);
    releaseA();
    // The next dock clears pending playback during its initial state effect.
    port.cancelPendingCues?.();
    const next = { ...input, restRevision: 4, endsAtMs: 115_000 };
    port.claimForegroundRestSound!(next);
    expect(await sound()).toBe(false);
    expect(await sound({ version: 1, ...next })).toBe(false);
    jest.setSystemTime(input.endsAtMs + 2_999);
    expect(await sound()).toBe(false);
    jest.setSystemTime(input.endsAtMs + 3_000);
    expect(await sound()).toBe(true);
    expect(await sound({ version: 1, ...next })).toBe(false);
    port.cancelPendingCues?.();
    expect(await sound({ version: 1, ...next })).toBe(true);
    await rendered.unmount();
  });

  it("leaves direct tone fallback and an active route without a dock claim audible", async () => {
    expect(await sound()).toBe(true);
    claimForegroundRestSound(input);
    await createExpoForegroundRestFeedbackAdapter().playTone({ sessionId: input.sessionId });
    const request = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.at(-1)![0]!;
    expect((await handler({ request: { identifier: "direct-tone", ...request } } as Notifications.Notification)).shouldPlaySound).toBe(true);
  });

  it("rejects claims for an expired rest or a background route", async () => {
    jest.setSystemTime(input.endsAtMs);
    claimForegroundRestSound(input);
    expect(await sound()).toBe(true);
    jest.setSystemTime(99_000);
    state = "background";
    claimForegroundRestSound(input);
    state = "active";
    expect(await sound()).toBe(true);
  });
});

afterAll(() => {
  appStateListener.mockRestore();
  if (descriptor) Object.defineProperty(AppState, "currentState", descriptor);
  else Reflect.deleteProperty(AppState, "currentState");
});
