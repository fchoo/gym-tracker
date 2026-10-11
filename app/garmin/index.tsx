import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import {
  parseGarminRootOrigin,
  useGarminImportRuntime,
} from "../../src/bootstrap/garminImportRuntime";
import { useWorkoutAppRuntime } from "../../src/bootstrap/workoutAppRuntime";
import { GarminSyncScreen } from "../../src/ui/screens/GarminSyncScreen";

function scalar(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createGarminRootHref(origin: unknown): Href {
  return {
    pathname: "/garmin",
    params: { origin: parseGarminRootOrigin(origin) },
  } as Href;
}

export default function GarminRootRoute() {
  const params = useLocalSearchParams() as Readonly<{
    origin?: string | readonly string[];
  }>;
  const origin = parseGarminRootOrigin(scalar(params.origin));
  const application = useWorkoutAppRuntime().garminImport;
  const runtime = useGarminImportRuntime({ application });
  const [returnFocusActivityId, setReturnFocusActivityId] = useState<string>();
  const [returnFocusVersion, setReturnFocusVersion] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const routeContext = useMemo(() => ({ origin }), [origin]);
  const openActivity = useCallback((activityId: string) => {
    setReturnFocusActivityId(activityId);
    setReturnFocusVersion((current) => current + 1);
    router.push({
      pathname: "/garmin/activity/[activityId]",
      params: { activityId },
    } as Href);
  }, []);
  const rememberScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(Math.max(0, event.nativeEvent.contentOffset.y));
  }, []);

  return (
    <GarminSyncScreen
      {...runtime}
      contextOrigin={routeContext.origin}
      onBack={() => router.back()}
      onOpenActivity={openActivity}
      onScroll={rememberScroll}
      returnFocusVersion={returnFocusVersion}
      scrollOffset={scrollOffset}
      {...(returnFocusActivityId === undefined ? {} : { returnFocusActivityId })}
    />
  );
}
