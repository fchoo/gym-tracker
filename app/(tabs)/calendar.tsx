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
import type {
  CalendarEventDestination,
} from "../../src/ui/calendar/calendarPorts";
import { useRootSettingsController } from "../../src/ui/shell/AppRootShell";
import {
  rootSettingsTriggerNativeID,
  useRootHeadingRef,
} from "../../src/ui/shell/rootFocus";

export default function CalendarRoute() {
  const settingsActionNativeID = rootSettingsTriggerNativeID("calendar");
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
  const openEvent = (destination: CalendarEventDestination) => {
    switch (destination.kind) {
      case "session":
        router.push((`/session/${destination.sessionId}?origin=calendar`) as Href);
        return;
      case "occurrence":
        router.push((`/calendar/plan/${destination.occurrenceId}`) as Href);
        return;
      case "plan":
        router.push((`/library/running/${destination.planId}`) as Href);
        return;
      case "activity":
        router.push((`/garmin/activity/${destination.activityId}?origin=calendar`) as Href);
        return;
    }
  };

  return (
    <CalendarScreen
      initialDate={initialDate}
      loadCalendarRange={runtime.loadCalendarRange}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "calendar",
        triggerNativeID: settingsActionNativeID,
        triggerRef: settingsActionRef,
      })}
      onOpenEvent={openEvent}
      today={initialDate}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}
