import { act, renderHook } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";
import { useExactRestAlarmAccess } from "./useExactRestAlarmAccess";
import type { ExactRestAlarmAccessPort } from "../platform/notifications/exactAlarmAccess";

afterEach(() => { jest.restoreAllMocks(); });
describe("exact rest alarm access controller", () => {
  it("keeps permission status usable without an injected runtime refresh callback", async () => {
    let change: ((value: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => { change = listener; return { remove: jest.fn() }; });
    const read = jest.fn<ExactRestAlarmAccessPort["read"]>(() => "denied");
    const port = { read, openSettings: jest.fn(async () => true) };
    const hook = await renderHook(() => useExactRestAlarmAccess(port));
    read.mockReturnValue("allowed");
    await act(async () => { change?.("active"); await hook.result.current.retryRefresh(); });
    expect(hook.result.current.access).toBe("allowed");
    expect(hook.result.current.refreshFailed).toBe(false);
    await hook.unmount();
  });

  it("does not reissue pending alarms on an already-allowed mount and exposes retry after transition failure", async () => {
    let change: ((value: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => { change = listener; return { remove: jest.fn() }; });
    const read = jest.fn<ExactRestAlarmAccessPort["read"]>(() => "allowed");
    const refreshPendingAlarms = jest.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("schedule_failed")).mockResolvedValue(undefined);
    const port = { read, openSettings: jest.fn(async () => true) };
    const hook = await renderHook(() => useExactRestAlarmAccess(port, refreshPendingAlarms));
    await act(async () => { change?.("active"); });
    expect(refreshPendingAlarms).not.toHaveBeenCalled();
    read.mockReturnValue("denied");
    await act(async () => { change?.("active"); });
    read.mockReturnValue("allowed");
    await act(async () => { change?.("active"); });
    expect(hook.result.current.refreshFailed).toBe(true);
    await act(async () => { await hook.result.current.retryRefresh(); });
    expect(hook.result.current.refreshFailed).toBe(false);
    expect(refreshPendingAlarms).toHaveBeenCalledTimes(2);
    await hook.unmount();
  });

  it("refreshes granted or revoked access on foreground return without opening settings", async () => {
    let change: ((value: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => { change = listener; return { remove }; });
    const read = jest.fn<ExactRestAlarmAccessPort["read"]>(() => "denied");
    const openSettings = jest.fn(async () => true);
    const refreshPendingAlarms = jest.fn(async () => undefined);
    const port = { read, openSettings };
    const hook = await renderHook(() => useExactRestAlarmAccess(port, refreshPendingAlarms));
    expect(hook.result.current.access).toBe("denied");
    read.mockReturnValue("allowed");
    await act(async () => { change?.("background"); change?.("active"); });
    expect(hook.result.current.access).toBe("allowed");
    expect(refreshPendingAlarms).toHaveBeenCalledTimes(1);
    await act(async () => { change?.("active"); });
    expect(refreshPendingAlarms).toHaveBeenCalledTimes(1);
    read.mockReturnValue("denied");
    await act(async () => { change?.("active"); });
    expect(hook.result.current.access).toBe("denied");
    expect(openSettings).not.toHaveBeenCalled();
    await hook.unmount();
    expect(remove).toHaveBeenCalled();
  });
  it("opens Android settings explicitly and keeps denied access until Android grants it", async () => {
    const port = { read: () => "denied" as const, openSettings: jest.fn(async () => true) };
    const hook = await renderHook(() => useExactRestAlarmAccess(port));
    await act(async () => { await hook.result.current.openSettings(); });
    expect(port.openSettings).toHaveBeenCalledTimes(1);
    expect(hook.result.current.access).toBe("denied");
    expect(hook.result.current.openFailed).toBe(false);
    await hook.unmount();
  });
  it("reports settings-open failure without changing access", async () => {
    const port = { read: () => "denied" as const, openSettings: jest.fn(async () => false) };
    const hook = await renderHook(() => useExactRestAlarmAccess(port));
    await act(async () => { await hook.result.current.openSettings(); });
    expect(hook.result.current.access).toBe("denied");
    expect(hook.result.current.openFailed).toBe(true);
    await hook.unmount();
  });
});
