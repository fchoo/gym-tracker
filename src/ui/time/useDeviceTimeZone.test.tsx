import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { describe, expect, it, jest } from "@jest/globals";
import * as timeZone from "../../domains/shared/displayTimeZone";
import { useDeviceTimeZone } from "./useDeviceTimeZone";

describe("phone timezone refresh", () => {
  it("refreshes the display zone after returning from OS settings and unsubscribes", async () => {
    let zone = "Asia/Singapore";
    const read = jest.spyOn(timeZone, "currentDeviceTimeZone").mockImplementation(() => zone);
    let foreground!: (state: string) => void;
    const remove = jest.fn();
    const subscribe = jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      foreground = listener as (state: string) => void;
      return { remove };
    });
    try {
      const hook = await renderHook(useDeviceTimeZone);
      expect(hook.result.current).toBe("Asia/Singapore");
      zone = "America/New_York";
      await act(async () => foreground("active"));
      expect(hook.result.current).toBe("America/New_York");
      await hook.unmount();
      expect(remove).toHaveBeenCalledTimes(1);
    } finally { read.mockRestore(); subscribe.mockRestore(); }
  });
});
