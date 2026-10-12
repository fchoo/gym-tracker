import { createHash } from "node:crypto";

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
      motion: "normal",
      input: "touch",
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

export const V12_CALENDAR_CASE_REGISTRY = Object.freeze({
  schema_version: 1,
  id: "v12-calendar-reference-cases/v1",
  static_configurations: V12_CALENDAR_STATIC_CONFIGURATIONS,
  state_ids: V12_CALENDAR_STATE_IDS,
  route_ids: V12_CALENDAR_ROUTE_JOURNEY_IDS,
  input_ids: V12_CALENDAR_INPUT_IDS,
  motion_ids: V12_CALENDAR_MOTION_IDS,
});

const registryBytes = Buffer.from(JSON.stringify(V12_CALENDAR_CASE_REGISTRY));

export const V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR = Object.freeze({
  schema_version: 1,
  id: V12_CALENDAR_CASE_REGISTRY.id,
  sha256: createHash("sha256").update(registryBytes).digest("hex"),
  static_configuration_count: V12_CALENDAR_STATIC_CONFIGURATIONS.length,
  state_count: V12_CALENDAR_STATE_IDS.length,
  route_count: V12_CALENDAR_ROUTE_JOURNEY_IDS.length,
  input_count: V12_CALENDAR_INPUT_IDS.length,
  motion_count: V12_CALENDAR_MOTION_IDS.length,
});

export const V12_CALENDAR_REQUIRED_CASE_IDS = Object.freeze([
  ...V12_CALENDAR_STATIC_CONFIGURATIONS.map(({ id }) => `configuration:${id}`),
  ...V12_CALENDAR_STATE_IDS.map((id) => `state:${id}`),
  ...V12_CALENDAR_ROUTE_JOURNEY_IDS.map((id) => `route:${id}`),
  ...V12_CALENDAR_INPUT_IDS.map((id) => `input:${id}`),
  ...V12_CALENDAR_MOTION_IDS.map((id) => `motion:${id}`),
]);

export function validateV12CalendarCaseRegistryDescriptor(value) {
  if (JSON.stringify(value) !== JSON.stringify(V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR)) {
    throw new Error("v12_calendar_case_registry_invalid");
  }
  return true;
}
