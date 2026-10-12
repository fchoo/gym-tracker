import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { parseLocalDate, type LocalDate } from "../../domains/scheduling/localDate";
import { SystemClock, type Clock } from "../../domains/shared/clock";

export type CurrentLocalDateDependencies = Readonly<{
  clock: Pick<Clock, "nowMs">;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
  subscribeForeground(callback: () => void): () => void;
}>;

const systemClock = new SystemClock();
const productionDependencies: CurrentLocalDateDependencies = Object.freeze({
  clock: systemClock,
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  subscribeForeground: (callback) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") callback();
    });
    return () => subscription.remove();
  },
});

function localDateAtDeviceTime(nowMs: number): LocalDate {
  const now = new Date(nowMs);
  return parseLocalDate([
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-"));
}

function millisecondsUntilNextLocalMidnight(nowMs: number): number {
  const now = new Date(nowMs);
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();
  return Math.max(1, next - nowMs);
}

export function useCurrentLocalDate(
  dependencies: CurrentLocalDateDependencies = productionDependencies,
): LocalDate {
  const [current, setCurrent] = useState(() =>
    localDateAtDeviceTime(dependencies.clock.nowMs())
  );

  useEffect(() => {
    let timer: unknown;
    const refresh = () => {
      const nowMs = dependencies.clock.nowMs();
      setCurrent(localDateAtDeviceTime(nowMs));
      if (timer !== undefined) dependencies.cancel(timer);
      timer = dependencies.schedule(refresh, millisecondsUntilNextLocalMidnight(nowMs));
    };
    refresh();
    const unsubscribe = dependencies.subscribeForeground(refresh);
    return () => {
      if (timer !== undefined) dependencies.cancel(timer);
      unsubscribe();
    };
  }, [dependencies]);

  return current;
}
