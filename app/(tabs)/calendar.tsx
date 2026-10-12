import React from "react";
import Constants from "expo-constants";
import {
  router,
  useFocusEffect,
  type Href,
} from "expo-router";

import {
  useCalendarRangeReadPort,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  CalendarScreen,
} from "../../src/ui/screens/CalendarScreen";
import type {
  CalendarEventDestination,
} from "../../src/ui/calendar/calendarPorts";
import { useCurrentLocalDate } from "../../src/ui/calendar/useCurrentLocalDate";
import { useRootSettingsController } from "../../src/ui/shell/AppRootShell";
import {
  rootSettingsTriggerNativeID,
  useRootHeadingRef,
} from "../../src/ui/shell/rootFocus";
import {
  clearPhase16CalendarTestControls,
  configurePhase16CalendarTestControls,
} from "../../src/bootstrap/phase16CalendarTestControls";
import { createImportedActivityDetailHref } from "../../src/navigation/importedActivityRoute";

function routeId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? encodeURIComponent(value)
    : null;
}

function calendarQuery(returnEventId: string | undefined, extra: readonly [string, string][] = []): string {
  const entries: [string, string][] = [["origin", "calendar"], ...extra];
  if (returnEventId !== undefined) entries.push(["returnEventId", returnEventId]);
  return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

export default function CalendarRoute() {
  const settingsActionNativeID = rootSettingsTriggerNativeID("calendar");
  const headingRef = useRootHeadingRef("calendar");
  const settingsActionRef = React.useRef(null);
  const rootSettings = useRootSettingsController();
  const calendarRead = useCalendarRangeReadPort();
  const phase16Stage = (typeof globalThis.location?.search === "string"
    ? new URLSearchParams(globalThis.location.search).get("phase16CalendarStage")
    : undefined) ?? undefined;
  const [returnFocusGeneration, setReturnFocusGeneration] = React.useState(0);
  const hasFocused = React.useRef(false);
  const initialDate = useCurrentLocalDate();
  const openEvent = (destination: CalendarEventDestination, returnEventId?: string) => {
    switch (destination.kind) {
      case "session": {
        const sessionId = routeId(destination.sessionId);
        if (sessionId === null) return;
        router.push((`/session/${sessionId}?${calendarQuery(returnEventId)}`) as Href);
        return;
      }
      case "occurrence": {
        const occurrenceId = routeId(destination.occurrenceId);
        if (occurrenceId === null) return;
        router.push((`/calendar/plan/${occurrenceId}?${calendarQuery(returnEventId)}`) as Href);
        return;
      }
      case "plan": {
        const planId = routeId(destination.planId);
        const sessionId = routeId(destination.sessionId);
        if (planId === null || sessionId === null) return;
        // This preserves the typed handoff only; Plan 16-07 owns real Running integration.
        router.push((`/library/running/${planId}?${calendarQuery(returnEventId, [["sessionId", destination.sessionId]])}`) as Href);
        return;
      }
      case "activity": {
        router.push(createImportedActivityDetailHref({
          activityId: destination.activityId,
          origin: "calendar",
        }));
        return;
      }
    }
  };

  useFocusEffect(React.useCallback(() => {
    if (hasFocused.current) {
      setReturnFocusGeneration((generation) => generation + 1);
    } else {
      hasFocused.current = true;
    }
  }, []));

  React.useEffect(() => {
    const extra = Constants.expoConfig?.extra;
    configurePhase16CalendarTestControls({
      packageName: Constants.expoConfig?.android?.package,
      buildProfile: typeof extra?.buildProfile === "string" ? extra.buildProfile : undefined,
      nativeContractsEnabled: extra?.nativeContractsEnabled === true,
      suite: typeof extra?.nativeContractSuite === "string" ? extra.nativeContractSuite : undefined,
      stage: phase16Stage,
    });
    return clearPhase16CalendarTestControls;
  }, [phase16Stage]);

  return (
    <CalendarScreen
      initialDate={initialDate}
      loadCalendarRange={calendarRead.loadCalendarRange}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "calendar",
        triggerNativeID: settingsActionNativeID,
        triggerRef: settingsActionRef,
      })}
      onOpenEvent={openEvent}
      onRequestRootBack={() => router.back()}
      returnFocusGeneration={returnFocusGeneration}
      today={initialDate}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}
