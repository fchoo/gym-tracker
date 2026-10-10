export const PHASE17_REQUIRED_LIBRARY_REQUIREMENTS = Object.freeze(Array.from({ length: 36 }, (_, i) => `LIB-${String(i + 1).padStart(2, "0")}`));

type CaseRow = readonly [id: string, requirement: string | null, action: string, uiReadback: string, sourceProbe: string, ...assertions: string[]];

// This is deliberately a one-row-per-ledger-case matrix, rather than a product/profile
// Cartesian expansion.  The action is a product-port interaction; sourceProbe is the
// post-action authoritative SQLite readback required before a native result can pass.
const rows: readonly CaseRow[] = [
  ["library.remembered-state", "LIB-01", "return-to-library", "selected-section-restored", "library_view_state"],
  ["library.plan-groups", "LIB-02", "filter-plan-group", "filtered-plan-group-visible", "owned_plans"],
  ["library.exercise-search", "LIB-03", "search-exercises", "matching-exercise-result-visible", "exercise_search_index"],
  ["library.exercise-favorites", "LIB-04", "toggle-exercise-favorite", "favorite-section-updated", "exercise_preferences"],
  ["library.actions-sheet", "LIB-05", "open-library-actions", "library-actions-sheet-visible", "library_action_state"],
  ["library.neutral-plan-chooser", "LIB-06", "open-neutral-plan-chooser", "strength-and-running-unselected", "plan_create_intent", "neutral-chooser-no-command-no-preselection"],
  ["library.true-no-plans", "LIB-07", "create-and-return-to-empty-library", "no-plans-empty-state-visible", "owned_plans"],
  ["library.owned-summary", "LIB-08", "open-strength-detail", "strength-summary-facts-visible", "owned_plans"],
  ["library.owned-lifecycle", "LIB-09", "preview-and-confirm-strength-lifecycle", "strength-lifecycle-readback-visible", "owned_plan_lifecycle_receipts"],
  ["library.starter-detail", "LIB-10", "open-starter-detail", "starter-facts-visible", "starter_plan_catalog"],
  ["library.starter-activation", "LIB-11", "preview-and-confirm-starter-activation", "starter-activation-readback-visible", "starter_plan_activations"],
  ["library.template-update", "LIB-12", "review-template-update", "template-update-impact-visible", "template_update_receipts"],
  ["library.create-strength", "LIB-13", "create-and-save-strength-plan", "saved-strength-plan-visible-after-reopen", "owned_plans"],
  ["library.plan-editor", "LIB-14", "edit-and-save-strength-plan", "saved-strength-plan-edit-visible", "owned_plan_revisions"],
  ["library.editor-draft-guards", "LIB-15", "discard-strength-draft", "saved-plan-unchanged-after-reopen", "owned_plan_revisions"],
  ["library.schedule-editor", "LIB-16", "save-strength-schedule", "saved-strength-schedule-visible", "plan_schedule_slots"],
  ["library.replacement-impact", "LIB-17", "replace-strength-exercise", "replacement-impact-and-result-visible", "plan_exercise_replacements"],
  ["library.day-removal-impact", "LIB-18", "remove-strength-day", "day-removal-impact-visible", "plan_day_revisions"],
  ["library.builtin-exercise", "LIB-19", "open-bundled-exercise-instructions", "bundled-instructions-and-favorite-visible", "exercise_instruction_sets"],
  ["library.custom-exercise", "LIB-20", "edit-and-archive-custom-exercise", "archived-custom-exercise-visible", "custom_exercises"],
  ["library.create-exercise", "LIB-21", "create-custom-exercise", "created-custom-exercise-visible-after-reopen", "custom_exercises"],
  ["library.copy-metric-migration", "LIB-22", "copy-exercise-and-migrate-metric", "copied-metric-migration-visible", "custom_exercise_metric_migrations"],
  ["library.load-error-recovery", "LIB-23", "retry-library-load", "recovered-library-content-visible", "library_load_receipts"],
  ["library.running-detail", "LIB-24", "open-running-detail", "saved-running-facts-visible", "running_plans"],
  ["library.running-create-zero-sessions", "LIB-25", "create-save-and-reopen-empty-running-plan", "no-sessions-visible-after-reopen", "running_plan_aggregates", "inactive-after-atomic-commit", "true-empty-after-reopen", "no-source-drift"],
  ["library.running-goal-edit", "LIB-26", "edit-save-and-reopen-running-goal", "saved-running-goal-visible", "running_plan_revisions"],
  ["library.running-session-common", "LIB-27", "save-reopen-common-running-session-fields", "session-common-fields-visible", "running_session_revisions"],
  ["library.running-recovery", "LIB-28", "choose-fill-save-reopen-recovery", "recovery-session-visible", "running_session_revisions"],
  ["library.running-long", "LIB-29", "choose-fill-save-reopen-long-run", "long-run-session-visible", "running_session_revisions"],
  ["library.running-progression", "LIB-30", "choose-fill-save-reopen-progression", "progression-session-visible", "running_session_revisions"],
  ["library.running-tempo", "LIB-31", "choose-fill-save-reopen-tempo", "tempo-session-visible", "running_session_revisions"],
  ["library.running-intervals", "LIB-32", "choose-fill-save-reopen-intervals", "intervals-session-visible", "running_session_revisions"],
  ["library.running-hills", "LIB-33", "choose-fill-save-reopen-hills", "hills-session-visible", "running_session_revisions"],
  ["library.running-fartlek", "LIB-34", "choose-fill-save-reopen-fartlek", "fartlek-session-visible", "running_session_revisions"],
  ["library.running-session-lifecycle", "LIB-35", "edit-reorder-delete-and-retry-running-sessions", "stable-order-and-true-empty-readback-visible", "running_session_slots", "stable-roots-revisions-delete-reorder-true-empty-retry"],
  ["library.running-conflict", "LIB-36", "confirm-move-run-move-strength-and-keep-both", "calendar-and-today-projection-visible", "schedule_collision_projections", "move-run-move-strength-keep-both-one-exclusive-command"],
  ["library.running-create-typed-sessions", null, "choose-fill-save-reopen-all-seven-session-types", "seven-session-kinds-visible-after-reopen", "running_session_revisions", "seven-typed-session-branches", "one-aggregate-commit", "inactive-after-atomic-commit", "no-source-drift"],
  ["library.running-two-same-day-slots", null, "create-reorder-and-delete-same-weekday-slots", "same-weekday-order-visible-after-reopen", "running_session_slots", "same-weekday-order-retained", "portable-after-reopen", "no-activation"],
  ["library.accessibility-recovery", null, "exercise-200pct-dpad-back-escape-ime-and-reduced-motion", "focus-target-and-motion-readback-visible", "accessibility_runtime_profile", "action-bearing", "focus-return", "keyboard-dpad", "minimum-48dp", "text-scale-200", "reduced-motion", "offline-process-recovery"],
];

export type Phase17CaseActionContract = Readonly<{
  id: string;
  action: string;
  uiReadback: string;
  sourceProbe: string;
  rawReportRequired: true;
  cleanupRequired: true;
}>;

export const PHASE17_CASE_ACTION_CONTRACTS = Object.freeze(rows.map(([id, , action, uiReadback, sourceProbe]) => Object.freeze({ id, action, uiReadback, sourceProbe, rawReportRequired: true as const, cleanupRequired: true as const })));
export const PHASE17_LIBRARY_RUNNING_CASES = Object.freeze(rows.map(([id, requirement, , , , ...assertions]) => Object.freeze({ id, requirements: Object.freeze(requirement === null ? [] : [requirement]), assertions: Object.freeze(assertions) })));
export const PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS = Object.freeze(PHASE17_LIBRARY_RUNNING_CASES.map(({ id }) => id));
export const PHASE17_EVIDENCE_PATH = ".planning/phases/17-library-running-plans/evidence/phase17-library-running.json";
