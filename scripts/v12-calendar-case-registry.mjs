import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const APPEARANCES = Object.freeze([
  Object.freeze({ code: "L", preference: "Light", os_scheme: "Light" }),
  Object.freeze({ code: "D", preference: "Dark", os_scheme: "Dark" }),
  Object.freeze({ code: "SL", preference: "System", os_scheme: "Light" }),
  Object.freeze({ code: "SD", preference: "System", os_scheme: "Dark" }),
]);

const PORTRAIT_SIZES = Object.freeze([
  Object.freeze({ code: "C360", width: 360, height: 800 }),
  Object.freeze({ code: "C390", width: 390, height: 844 }),
  Object.freeze({ code: "M600", width: 600, height: 960 }),
  Object.freeze({ code: "X840", width: 840, height: 1080 }),
]);

const ORIENTATIONS = Object.freeze(["P", "L"]);
const FONT_SCALES = Object.freeze([
  Object.freeze({ code: "F100", value: 1 }),
  Object.freeze({ code: "F200", value: 2 }),
]);

export const V12_CALENDAR_STATIC_CONFIGURATIONS = Object.freeze(
  APPEARANCES.flatMap((appearance) => PORTRAIT_SIZES.flatMap((size) => (
    ORIENTATIONS.flatMap((orientation) => FONT_SCALES.map((font) => Object.freeze({
      id: `${appearance.code}-${size.code}-${orientation}-${font.code}`,
      appearance: appearance.preference,
      os_scheme: appearance.os_scheme,
      viewport: Object.freeze({
        width: orientation === "P" ? size.width : size.height,
        height: orientation === "P" ? size.height : size.width,
      }),
      orientation: orientation === "P" ? "portrait" : "landscape",
      font_scale: font.value,
    })))
  ))),
);

export const V12_CALENDAR_STATE_IDS = Object.freeze([
  "calendar-loading-month",
  "calendar-refresh-retained",
  "calendar-month-empty",
  "calendar-agenda-empty",
  "calendar-rest-day",
  "calendar-one-event",
  "calendar-two-events",
  "calendar-many-events",
  "calendar-long-event-title",
  "calendar-query-error-retry",
  "calendar-month-four-weeks",
  "calendar-month-five-weeks",
  "calendar-month-six-weeks",
  "calendar-focused-week",
  "calendar-key",
  "calendar-strength-complete",
  "calendar-strength-partial",
  "calendar-strength-planned",
]);

export const V12_CALENDAR_ROUTE_JOURNEY_IDS = Object.freeze([
  "calendar-strength-completed",
  "calendar-strength-partial",
  "calendar-strength-planned",
  "calendar-running-planned",
  "calendar-garmin-outdoor",
  "calendar-garmin-treadmill",
  "calendar-running-missing",
  "calendar-garmin-removed",
]);

export const V12_CALENDAR_INPUT_IDS = Object.freeze([
  "touch",
  "software-keyboard",
  "hardware-keyboard",
  "dpad",
]);

export const V12_CALENDAR_MOTION_IDS = Object.freeze(["normal", "reduced"]);

export const V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS = Object.freeze({
  functional: Object.freeze({
    assertions: Object.freeze([
      Object.freeze({ id: "functional-result", expected: true }),
    ]),
  }),
  trace: Object.freeze({
    schema_version: 1,
    producer: "v12-calendar-native-trace/v1",
    events: Object.freeze(["observation-started", "observation-finished"]),
  }),
  measurement: Object.freeze({
    schema_version: 1,
    producer: "v12-calendar-native-measurement/v1",
    metrics: Object.freeze([
      Object.freeze({ id: "viewport-width", unit: "dp", source: "viewport.width" }),
      Object.freeze({ id: "viewport-height", unit: "dp", source: "viewport.height" }),
      Object.freeze({ id: "font-scale", unit: "ratio", source: "font_scale" }),
    ]),
  }),
  capture: Object.freeze({ format: "png", minimum_width_px: 1, minimum_height_px: 1 }),
});

const CANONICAL_CONFIGURATION_ID = "L-C390-P-F100";
const CANONICAL_STATE_ID = "calendar-focused-week";

function requiredCase(id, kind, binding) {
  const identity = { id, kind, binding };
  return Object.freeze({
    ...identity,
    case_sha256: createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
  });
}

export const V12_CALENDAR_REQUIRED_CASES = Object.freeze([
  ...V12_CALENDAR_STATIC_CONFIGURATIONS.map((configuration) => requiredCase(
    `configuration:${configuration.id}`,
    "configuration",
    Object.freeze({
      configuration_id: configuration.id,
      state_id: "calendar-month",
      input: "touch",
      motion: "normal",
    }),
  )),
  ...V12_CALENDAR_STATE_IDS.map((stateId) => requiredCase(
    `state:${stateId}`,
    "state",
    Object.freeze({
      configuration_id: CANONICAL_CONFIGURATION_ID,
      state_id: stateId,
      input: "touch",
      motion: "normal",
    }),
  )),
  ...V12_CALENDAR_ROUTE_JOURNEY_IDS.map((routeId, index) => requiredCase(
    `route:${routeId}`,
    "route",
    Object.freeze({
      configuration_id: CANONICAL_CONFIGURATION_ID,
      state_id: routeId,
      input: index % 2 === 0 ? "touch" : "hardware-keyboard",
      motion: "normal",
    }),
  )),
  ...V12_CALENDAR_INPUT_IDS.map((inputId) => requiredCase(
    `input:${inputId}`,
    "input",
    Object.freeze({
      configuration_id: CANONICAL_CONFIGURATION_ID,
      state_id: CANONICAL_STATE_ID,
      input: inputId,
      motion: "normal",
    }),
  )),
  ...V12_CALENDAR_MOTION_IDS.map((motionId) => requiredCase(
    `motion:${motionId}`,
    "motion",
    Object.freeze({
      configuration_id: CANONICAL_CONFIGURATION_ID,
      state_id: CANONICAL_STATE_ID,
      input: "touch",
      motion: motionId,
    }),
  )),
]);

export const V12_CALENDAR_CASE_REGISTRY = Object.freeze({
  schema_version: 2,
  id: "v12-calendar-reference-cases/v1",
  static_configurations: V12_CALENDAR_STATIC_CONFIGURATIONS,
  state_ids: V12_CALENDAR_STATE_IDS,
  route_ids: V12_CALENDAR_ROUTE_JOURNEY_IDS,
  input_ids: V12_CALENDAR_INPUT_IDS,
  motion_ids: V12_CALENDAR_MOTION_IDS,
  required_cases: V12_CALENDAR_REQUIRED_CASES,
});

const registryBytes = Buffer.from(JSON.stringify(V12_CALENDAR_CASE_REGISTRY));

export const V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR = Object.freeze({
  schema_version: 2,
  id: V12_CALENDAR_CASE_REGISTRY.id,
  sha256: createHash("sha256").update(registryBytes).digest("hex"),
  static_configuration_count: V12_CALENDAR_STATIC_CONFIGURATIONS.length,
  state_count: V12_CALENDAR_STATE_IDS.length,
  route_count: V12_CALENDAR_ROUTE_JOURNEY_IDS.length,
  input_count: V12_CALENDAR_INPUT_IDS.length,
  motion_count: V12_CALENDAR_MOTION_IDS.length,
  required_case_count: V12_CALENDAR_REQUIRED_CASES.length,
});

export const V12_CALENDAR_REQUIRED_CASE_IDS = Object.freeze(
  V12_CALENDAR_REQUIRED_CASES.map(({ id }) => id),
);

export const V12_CALENDAR_CASE_LEDGER_DESCRIPTOR = Object.freeze({
  schema_version: 1,
  registry_id: V12_CALENDAR_CASE_REGISTRY.id,
  case_ids: V12_CALENDAR_REQUIRED_CASE_IDS,
  artifact_path_template: "cases/{case_sha256}.json",
});

export function validateV12CalendarCaseRegistryDescriptor(value) {
  if (!isDeepStrictEqual(value, V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR)) {
    throw new Error("v12_calendar_case_registry_invalid");
  }
  return true;
}

export function validateV12CalendarCaseLedgerDescriptor(value) {
  if (!isDeepStrictEqual(value, V12_CALENDAR_CASE_LEDGER_DESCRIPTOR)) {
    throw new Error("v12_calendar_case_ledger_invalid");
  }
  return true;
}
