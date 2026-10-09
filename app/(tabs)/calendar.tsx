import React from "react";
import {
  router,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  CalendarScreen,
} from "../../src/ui/screens/CalendarScreen";
import { useRootSettingsController } from "../../src/ui/shell/AppRootShell";
import { useRootHeadingRef } from "../../src/ui/shell/rootFocus";

export default function CalendarRoute() {
  const headingRef = useRootHeadingRef("calendar");
  const settingsActionRef = React.useRef(null);
  const rootSettings = useRootSettingsController();
  const runtime = useWorkoutAppRuntime();
  const now = new Date();
  const initialDate = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");

  return (
    <CalendarScreen
      initialDate={initialDate}
      loadCalendarMonth={({ month, selectedDate }) => runtime.loadCalendarMonth({
        month,
        selectedDate,
        today: initialDate,
      })}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "calendar",
        triggerRef: settingsActionRef,
      })}
      onOpenSession={(sessionId) =>
        router.push(("/session/" + sessionId) as Href)}
      today={initialDate}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
    />
  );
}
