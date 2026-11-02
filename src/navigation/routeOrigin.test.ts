import { describe, expect, it } from "@jest/globals";

import {
  parseCalendarRouteOrigin,
  parseScalarRouteParam,
} from "./routeOrigin";

describe("route origin parsing", () => {
  it("accepts only scalar values and distinguishes absence from invalid input", () => {
    expect(parseScalarRouteParam(undefined)).toEqual({ kind: "absent" });
    expect(parseScalarRouteParam("calendar")).toEqual({ kind: "value", value: "calendar" });
    expect(parseScalarRouteParam("")).toEqual({ kind: "invalid" });
    expect(parseScalarRouteParam(["calendar"])).toEqual({ kind: "invalid" });
  });

  it("fails closed for unknown origins while preserving intentional absent management routes", () => {
    const options = {
      absentManagementOrigin: "workout",
      managementOrigins: ["workout", "library", "progress"] as const,
    };
    expect(parseCalendarRouteOrigin("calendar", options)).toEqual({ kind: "calendar" });
    expect(parseCalendarRouteOrigin("library", options)).toEqual({ kind: "management", origin: "library" });
    expect(parseCalendarRouteOrigin(undefined, options)).toEqual({ kind: "management", origin: "workout" });
    expect(parseCalendarRouteOrigin("provider", options)).toEqual({ kind: "invalid" });
    expect(parseCalendarRouteOrigin(["calendar"], options)).toEqual({ kind: "invalid" });
  });
});
