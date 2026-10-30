export type RouteParam = string | readonly string[] | undefined;

export type ScalarRouteParam =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "value"; value: string }>
  | Readonly<{ kind: "invalid" }>;

export function parseScalarRouteParam(value: RouteParam): ScalarRouteParam {
  if (value === undefined) return Object.freeze({ kind: "absent" });
  if (typeof value !== "string" || value.trim().length === 0) {
    return Object.freeze({ kind: "invalid" });
  }
  return Object.freeze({ kind: "value", value });
}

export type ParsedCalendarRouteOrigin<ManagementOrigin extends string> =
  | Readonly<{ kind: "calendar" }>
  | Readonly<{ kind: "management"; origin: ManagementOrigin }>
  | Readonly<{ kind: "invalid" }>;

export function parseCalendarRouteOrigin<ManagementOrigin extends string>(
  value: RouteParam,
  options: Readonly<{
    absentManagementOrigin?: ManagementOrigin;
    managementOrigins: readonly ManagementOrigin[];
  }>,
): ParsedCalendarRouteOrigin<ManagementOrigin> {
  const parsed = parseScalarRouteParam(value);
  if (parsed.kind === "absent") {
    return options.absentManagementOrigin === undefined
      ? Object.freeze({ kind: "invalid" })
      : Object.freeze({ kind: "management", origin: options.absentManagementOrigin });
  }
  if (parsed.kind === "invalid") return parsed;
  if (parsed.value === "calendar") return Object.freeze({ kind: "calendar" });
  const managementOrigin = options.managementOrigins.find((origin) => origin === parsed.value);
  return managementOrigin === undefined
    ? Object.freeze({ kind: "invalid" })
    : Object.freeze({ kind: "management", origin: managementOrigin });
}
