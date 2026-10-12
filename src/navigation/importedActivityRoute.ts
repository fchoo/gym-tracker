import type { Href } from "expo-router";

import { parseImportedActivityLocalId } from "../domains/activities/activityDetails";

export const CALENDAR_RETURN_TOKEN = /^calendar:[A-Za-z0-9:_-]{1,80}$/u;

export type ActivityDetailRouteInput = Readonly<{
  activityId: string;
  origin: "workout" | "calendar" | "library" | "progress";
  returnToken?: string;
}>;

export function createImportedActivityDetailHref(input: ActivityDetailRouteInput): Href {
  const activityId = parseImportedActivityLocalId(input.activityId);
  if (activityId === null
    || !["workout", "calendar", "library", "progress"].includes(input.origin)
    || (input.origin !== "calendar" && input.returnToken !== undefined)
    || (input.returnToken !== undefined && !CALENDAR_RETURN_TOKEN.test(input.returnToken))) {
    throw new Error("imported_activity_route_invalid");
  }
  return {
    pathname: "/garmin/activity/[activityId]",
    params: {
      activityId,
      origin: input.origin,
      ...(input.returnToken === undefined ? {} : { returnToken: input.returnToken }),
    },
  } as Href;
}
