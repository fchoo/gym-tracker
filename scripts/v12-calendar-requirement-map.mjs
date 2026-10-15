import { V12_CALENDAR_STAGE_IDS } from "./v12-calendar-observation-contract.mjs";

const STAGES = new Set(V12_CALENDAR_STAGE_IDS);
const CALENDAR_IDS = Array.from({ length: 23 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);

// Each key is the source-owned parity inventory_id. Gesture receipts are
// attached only to the Calendar interaction contract they directly exercise;
// every row also requires its own native requirement observation.
export const V12_CALENDAR_REQUIREMENT_STAGE_IDS = Object.freeze({
  "calendar.month": Object.freeze(["month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month"]),
  "calendar.calendar-key": Object.freeze([]),
  "calendar.event-encoding": Object.freeze(["dev-02-light-title"]),
  "calendar.date-grid": Object.freeze(["four-row-month", "five-row-month", "six-row-month", "dev-01-padding"]),
  "calendar.events-titles": Object.freeze([]),
  "calendar.today-selection": Object.freeze([]),
  "calendar.drag-follow": Object.freeze(["drag-forward-10", "drag-backward-10", "drag-cancel", "drag-vertical", "drag-diagonal"]),
  "calendar.threshold": Object.freeze([
    "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
    "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
    "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
    "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
    "drag-fast-subthreshold", "drag-retreat", "drag-cancel",
  ]),
  "calendar.month-motion": Object.freeze(["rapid-reverse-input", "rotation-during-transition", "background-during-transition"]),
  "calendar.month-navigation": Object.freeze(["month-year-boundary", "leap-february"]),
  "calendar.keyboard": Object.freeze([]),
  "calendar.expand-week": Object.freeze(["week-expand-first-row", "week-expand-middle-row", "week-expand-last-row"]),
  "calendar.collapse-week": Object.freeze(["week-collapse-middle-row"]),
  "calendar.adjacent-week": Object.freeze(["adjacent-week"]),
  "calendar.reduced-motion": Object.freeze(["reduced-motion"]),
  "calendar.agenda": Object.freeze([]),
  "calendar.agenda-routing": Object.freeze([]),
  "calendar.readonly-history": Object.freeze([]),
  "calendar.planned-preview": Object.freeze([]),
  "calendar.detail-return": Object.freeze([]),
  "calendar.calendar-load-error": Object.freeze([]),
  "calendar.history-deep-correction": Object.freeze([]),
  "calendar.history-management": Object.freeze([]),
});

export const V12_CALENDAR_REQUIREMENT_PROBE_IDS = Object.freeze({
  "calendar.month": Object.freeze(["monday-first-grid", "persistent-month-controls", "viewport-fill"]),
  "calendar.calendar-key": Object.freeze(["header-action-order", "activity-status-groups", "no-inline-legend"]),
  "calendar.event-encoding": Object.freeze(["strength-running-pixels", "complete-partial-planned-shapes", "non-color-labels"]),
  "calendar.date-grid": Object.freeze(["date-track-28dp", "event-track-36dp", "row-continuity"]),
  "calendar.events-titles": Object.freeze(["two-visible-events", "full-accessibility-names", "overflow-count"]),
  "calendar.today-selection": Object.freeze(["selected-today-outside", "rest-vs-empty"]),
  "calendar.drag-follow": Object.freeze(["rendered-panel-translation", "vertical-intent", "cancel-no-activation"]),
  "calendar.threshold": Object.freeze(["commanded-measured-thresholds", "release-outcomes", "continuous-retreat", "short-fast-snapback"]),
  "calendar.month-motion": Object.freeze(["settle-240ms", "callback-order-unique", "interruption-stale-callback"]),
  "calendar.month-navigation": Object.freeze(["previous-next-today", "day-clamp", "year-and-leap-boundary"]),
  "calendar.keyboard": Object.freeze(["arrow-navigation", "date-activation", "visible-focus"]),
  "calendar.expand-week": Object.freeze(["selected-overlay-top", "following-overlay-bottom", "agenda-reveal"]),
  "calendar.collapse-week": Object.freeze(["explicit-expand-collapse", "overlay-return-to-month-bounds", "selected-focus-restored"]),
  "calendar.adjacent-week": Object.freeze(["collapse-select-expand-order", "event-preservation"]),
  "calendar.reduced-motion": Object.freeze(["normal-baseline", "runtime-toggle", "identical-destination"]),
  "calendar.agenda": Object.freeze(["single-full-width-target", "summary-sport-status-source", "single-chevron"]),
  "calendar.agenda-routing": Object.freeze(["strength-destination", "planned-running-destination", "imported-running-destination", "entity-identity"]),
  "calendar.readonly-history": Object.freeze(["completed-partial-detail", "all-set-rows", "no-mutation-controls"]),
  "calendar.planned-preview": Object.freeze(["occurrence-preview", "target-only", "no-session-or-result"]),
  "calendar.detail-return": Object.freeze(["agenda-state-restored", "trigger-focus-restored", "exercise-disclosure"]),
  "calendar.calendar-load-error": Object.freeze(["loading-empty-error", "retry-retains-date", "no-invented-session"]),
  "calendar.history-deep-correction": Object.freeze(["calendar-readonly", "management-correction-route", "revision-conflict-retry"]),
  "calendar.history-management": Object.freeze(["calendar-readonly", "management-resume", "management-remove-confirmation"]),
});

export const V12_CALENDAR_REQUIREMENT_DEFINITIONS = Object.freeze(
  Object.keys(V12_CALENDAR_REQUIREMENT_STAGE_IDS).map((evidenceId, index) => Object.freeze({
    requirement_id: CALENDAR_IDS[index],
    evidence_id: evidenceId,
    stage_ids: V12_CALENDAR_REQUIREMENT_STAGE_IDS[evidenceId],
    probe_ids: V12_CALENDAR_REQUIREMENT_PROBE_IDS[evidenceId],
  })),
);

export function deriveV12CalendarRequirementSelectors(matrixRows) {
  const rows = matrixRows.filter(({ requirement_id: id }) => id.startsWith("CAL-"));
  if (rows.length !== CALENDAR_IDS.length
    || rows.some((row, index) => row.requirement_id !== CALENDAR_IDS[index])
    || new Set(rows.map(({ inventory_id: id }) => id)).size !== rows.length
    || rows.some(({ inventory_id: id }) => !Object.hasOwn(V12_CALENDAR_REQUIREMENT_STAGE_IDS, id)
      || !Object.hasOwn(V12_CALENDAR_REQUIREMENT_PROBE_IDS, id))) {
    throw new Error("v12_calendar_requirement_matrix_invalid");
  }
  const mappedInventoryIds = Object.keys(V12_CALENDAR_REQUIREMENT_STAGE_IDS);
  if (mappedInventoryIds.length !== rows.length || mappedInventoryIds.some((id) => !rows.some((row) => row.inventory_id === id))) {
    throw new Error("v12_calendar_requirement_matrix_invalid");
  }
  return Object.freeze(rows.map((row, index) => {
    const canonical = V12_CALENDAR_REQUIREMENT_DEFINITIONS[index];
    const stageIds = V12_CALENDAR_REQUIREMENT_STAGE_IDS[row.inventory_id];
    if (canonical.requirement_id !== row.requirement_id || canonical.evidence_id !== row.inventory_id) throw new Error("v12_calendar_requirement_matrix_invalid");
    if (stageIds.some((stageId) => !STAGES.has(stageId))) throw new Error("v12_calendar_requirement_stage_invalid");
    return Object.freeze({
      row_id: row.requirement_id,
      evidence_id: row.inventory_id,
      stage_ids: stageIds,
      probe_ids: V12_CALENDAR_REQUIREMENT_PROBE_IDS[row.inventory_id],
    });
  }));
}
