/**
 * Source-owned evidence ledger for the Phase 15 Workout acceptance gate.
 * It intentionally lists evidence paths rather than runtime data: evidence is
 * recorded only by the native runner after it has exercised the SQLite-backed app.
 */
const requirementCases = [
  ["workout.root-identity", "WRK-01"], ["workout.day-switch", "WRK-02"],
  ["workout.scheduled-rest-empty", "WRK-03"], ["workout.start-alternate", "WRK-04"],
  ["workout.start-resume", "WRK-05"], ["workout.context-running", "WRK-06"],
  ["workout.active-layout", "WRK-07"], ["workout.active-back", "WRK-08"],
  ["workout.exercise-disclosure", "WRK-09"], ["workout.active-indicator", "WRK-10"],
  ["workout.set-states", "WRK-11"], ["workout.row-edit", "WRK-12"],
  ["workout.load-reps-editor", "WRK-13"], ["workout.duration-editor", "WRK-14"],
  ["workout.all-metrics", "WRK-15"], ["workout.warmup-order", "WRK-16"],
  ["workout.add-set", "WRK-17"], ["workout.complete-commit", "WRK-18"],
  ["workout.complete-failure", "WRK-19"], ["workout.completion-collapse", "WRK-20"],
  ["workout.rest-dock", "WRK-21"], ["workout.rest-controls", "WRK-22"],
  ["workout.rest-recovery", "WRK-23"], ["workout.trend", "WRK-24"],
  ["workout.exercise-menu", "WRK-25"], ["workout.timing-flat", "WRK-26"],
  ["workout.plan-increment", "WRK-27"], ["workout.plan-after-workout", "WRK-28"],
  ["workout.add-exercise", "WRK-29"], ["workout.replace-exercise", "WRK-30"],
  ["workout.delete-exercise", "WRK-31"], ["workout.reorder", "WRK-32"],
  ["workout.undo", "WRK-33"], ["workout.outcomes", "WRK-34"],
  ["workout.completion-review", "WRK-35"], ["workout.completion-writeback", "WRK-36"],
];

const crossCuttingCases = [
  ["workout.readonly-presentation", "cross-cutting"],
  ["workout.timing-policy", "TIM-01"],
  ["workout.accessibility", "cross-cutting"],
  ["workout.appearance", "cross-cutting"],
  ["workout.offline-recovery", "cross-cutting"],
  ["workout.performance", "cross-cutting"],
];

export const PHASE15_REQUIRED_CASES = Object.freeze(
  [...requirementCases, ...crossCuttingCases].map(([id, requirement]) => Object.freeze({
    id,
    requirement,
    evidence_path: `artifacts/native/phase15/evidence/${id}.json`,
  })),
);

export const PHASE15_EVIDENCE_CASE_IDS = Object.freeze(PHASE15_REQUIRED_CASES.map(({ id }) => id));

export const PHASE15_ROOT_TO_COMPLETION_CASE = "workout.root-identity";

export const PHASE15_VISUAL_REFERENCES = Object.freeze({
  "light-workout-root": "513173987c6b29d370f5428e3226608a795d48cdf5a9c258a8624dd2bed0ad2d",
  "dark-workout-root": "ffd8cf979d3ba679cc744e58a91d30d7bd34cda055fc0bff5ae8c09d886de301",
  "light-active-overview": "0c40bbb3555550653d89ee517df29c882269cf92d58b95487512e9e6dfde5b18",
  "dark-active-overview": "aa2b56418d8cc13446fdfc0bef8ce6c1c8d7fff5bbad3ff9530c709fe4d9b61f",
  "light-committed-rest": "09aa4b4bda47451d35be6316b769a03fd70b5736ec4c7842ad1399015f47253b",
  "dark-committed-rest": "5d7a7035df19c63feedc0b400453c57c79b9ec3a1f8e51727807b867924bd0d7",
});

export const PHASE15_PINNED_VISUAL_SOURCES = Object.freeze({
  approved_json: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf",
  approved_hybrid_html: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96",
  source_manifest: "90de9f6040f36dc029b97ad3687d0e3569fd9bc33ad3eaab2cafc649ae1196a4",
});
