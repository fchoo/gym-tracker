import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { currentDeviceTimeZone } from "../../platform/time/deviceTimeZone";

export function useDeviceTimeZone(): string {
  const [timeZone, setTimeZone] = useState(currentDeviceTimeZone);
  useEffect(() => {
    const refresh = () => setTimeZone(currentDeviceTimeZone());
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, 60_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  return timeZone;
}
