export const PHASE17_REQUIRED_LIBRARY_REQUIREMENTS = Object.freeze(Array.from({ length: 36 }, (_, i) => `LIB-${String(i + 1).padStart(2, "0")}`));

export type Phase17ProofMode = "mutating" | "read_only";

type CaseRow = readonly [
  id: string,
  requirement: string | null,
  proofMode: Phase17ProofMode,
  action: string,
  uiReadback: string,
  sourceProbe: string,
  ...assertions: string[]
];

// This is deliberately a one-row-per-ledger-case matrix, rather than a product/profile
// Cartesian expansion.  The action is a product-port interaction; sourceProbe is the
// post-action authoritative SQLite readback required before a native result can pass.
const rows: readonly CaseRow[] = [
  ["library.remembered-state", "LIB-01", "read_only", "return-to-library", "selected-section-restored", "library_view_state"],
  ["library.plan-groups", "LIB-02", "read_only", "filter-plan-group", "filtered-plan-group-visible", "owned_plans"],
  ["library.exercise-search", "LIB-03", "read_only", "search-exercises", "matching-exercise-result-visible", "exercise_search_index"],
  ["library.exercise-favorites", "LIB-04", "mutating", "toggle-exercise-favorite", "favorite-section-updated", "exercise_preferences"],
  ["library.actions-sheet", "LIB-05", "read_only", "open-library-actions", "library-actions-sheet-visible", "library_action_state"],
  ["library.neutral-plan-chooser", "LIB-06", "read_only", "open-neutral-plan-chooser", "strength-and-running-unselected", "plan_create_intent", "neutral-chooser-no-command-no-preselection"],
  ["library.true-no-plans", "LIB-07", "mutating", "create-and-return-to-empty-library", "no-plans-empty-state-visible", "owned_plans"],
  ["library.owned-summary", "LIB-08", "read_only", "open-strength-detail", "strength-summary-facts-visible", "owned_plans"],
  ["library.owned-lifecycle", "LIB-09", "mutating", "preview-and-confirm-strength-lifecycle", "strength-lifecycle-readback-visible", "owned_plan_lifecycle_receipts"],
  ["library.starter-detail", "LIB-10", "mutating", "create-inactive-starter-editable-copy", "starter-editable-copy-visible", "owned_plan_revisions"],
  ["library.starter-activation", "LIB-11", "mutating", "preview-and-confirm-starter-activation", "starter-activation-readback-visible", "starter_plan_activations"],
  ["library.template-update", "LIB-12", "mutating", "create-independent-template-update-copy", "template-update-copy-visible", "owned_plan_revisions"],
  ["library.create-strength", "LIB-13", "mutating", "create-and-save-strength-plan", "saved-strength-plan-visible-after-reopen", "owned_plans"],
  ["library.plan-editor", "LIB-14", "mutating", "edit-and-save-strength-plan", "saved-strength-plan-edit-visible", "owned_plan_revisions"],
  ["library.editor-draft-guards", "LIB-15", "read_only", "discard-strength-draft", "saved-plan-unchanged-after-reopen", "owned_plan_revisions"],
  ["library.schedule-editor", "LIB-16", "mutating", "save-strength-schedule", "saved-strength-schedule-visible", "plan_schedule_slots"],
  ["library.replacement-impact", "LIB-17", "mutating", "replace-strength-exercise", "replacement-impact-and-result-visible", "plan_exercise_replacements"],
  ["library.day-removal-impact", "LIB-18", "mutating", "remove-strength-day", "day-removal-impact-visible", "plan_day_revisions"],
  ["library.builtin-exercise", "LIB-19", "read_only", "open-bundled-exercise-instructions", "bundled-instructions-and-favorite-visible", "exercise_instruction_sets"],
  ["library.custom-exercise", "LIB-20", "mutating", "edit-and-archive-custom-exercise", "archived-custom-exercise-visible", "custom_exercises"],
  ["library.create-exercise", "LIB-21", "mutating", "create-custom-exercise", "created-custom-exercise-visible-after-reopen", "custom_exercises"],
  ["library.copy-metric-migration", "LIB-22", "mutating", "copy-exercise-and-migrate-metric", "copied-metric-migration-visible", "custom_exercise_metric_migrations"],
  ["library.load-error-recovery", "LIB-23", "read_only", "retry-library-load", "recovered-library-content-visible", "owned_plans"],
  ["library.running-detail", "LIB-24", "read_only", "open-running-detail", "saved-running-facts-visible", "running_plans"],
  ["library.running-create-zero-sessions", "LIB-25", "mutating", "create-save-and-reopen-empty-running-plan", "no-sessions-visible-after-reopen", "running_plan_aggregates", "inactive-after-atomic-commit", "true-empty-after-reopen", "no-source-drift"],
  ["library.running-goal-edit", "LIB-26", "mutating", "edit-save-and-reopen-running-goal", "saved-running-goal-visible", "running_plan_revisions"],
  ["library.running-session-common", "LIB-27", "mutating", "save-reopen-common-running-session-fields", "session-common-fields-visible", "running_session_revisions"],
  ["library.running-recovery", "LIB-28", "mutating", "choose-fill-save-reopen-recovery", "recovery-session-visible", "running_session_revisions"],
  ["library.running-long", "LIB-29", "mutating", "choose-fill-save-reopen-long-run", "long-run-session-visible", "running_session_revisions"],
  ["library.running-progression", "LIB-30", "mutating", "choose-fill-save-reopen-progression", "progression-session-visible", "running_session_revisions"],
  ["library.running-tempo", "LIB-31", "mutating", "choose-fill-save-reopen-tempo", "tempo-session-visible", "running_session_revisions"],
  ["library.running-intervals", "LIB-32", "mutating", "choose-fill-save-reopen-intervals", "intervals-session-visible", "running_session_revisions"],
  ["library.running-hills", "LIB-33", "mutating", "choose-fill-save-reopen-hills", "hills-session-visible", "running_session_revisions"],
  ["library.running-fartlek", "LIB-34", "mutating", "choose-fill-save-reopen-fartlek", "fartlek-session-visible", "running_session_revisions"],
  ["library.running-session-lifecycle", "LIB-35", "mutating", "edit-reorder-delete-and-retry-running-sessions", "stable-order-and-true-empty-readback-visible", "running_session_slots", "stable-roots-revisions-delete-reorder-true-empty-retry"],
  ["library.running-conflict", "LIB-36", "mutating", "confirm-move-run-move-strength-and-keep-both", "calendar-and-today-projection-visible", "schedule_collision_projections", "move-run-move-strength-keep-both-one-exclusive-command"],
  ["library.running-create-typed-sessions", null, "mutating", "choose-fill-save-reopen-all-seven-session-types", "seven-session-kinds-visible-after-reopen", "running_session_revisions", "seven-typed-session-branches", "one-aggregate-commit", "inactive-after-atomic-commit", "no-source-drift"],
  ["library.running-two-same-day-slots", null, "mutating", "create-reorder-and-delete-same-weekday-slots", "same-weekday-order-visible-after-reopen", "running_session_slots", "same-weekday-order-retained", "portable-after-reopen", "no-activation"],
  ["library.accessibility-recovery", null, "read_only", "exercise-200pct-dpad-back-escape-ime-and-reduced-motion", "focus-target-and-motion-readback-visible", "accessibility_runtime_profile", "action-bearing", "focus-return", "keyboard-dpad", "minimum-48dp", "text-scale-200", "reduced-motion", "offline-process-recovery"],
];

export type Phase17CaseActionContract = Readonly<{
  id: string;
  proofMode: Phase17ProofMode;
  action: string;
  uiReadback: string;
  sourceProbe: string;
  rawReportRequired: true;
  cleanupRequired: true;
  /** Mutations must expose this deterministic request/receipt identity. */
  actionReceiptRequired: boolean;
}>;

/**
 * Family A's mutating journeys are backed by the owning domain's persisted
 * receipt, never by the dev-test action envelope.  The probe implementation
 * also reads the named authoritative post-state rows at the receipt result
 * identifiers and revisions.  Keeping this one explicit row per product
 * command makes a new mutating ledger case fail review until it declares its
 * own durable evidence contract.
 */
export const PHASE17_FAMILY_A_MUTATION_RECEIPTS = Object.freeze([
  ["library.exercise-favorites", "custom_exercise_mutation_receipts", "favorite_and_preference_revision"],
  ["library.true-no-plans", "owned_plan_mutation_requests", "created_plan_revision"],
  ["library.owned-lifecycle", "owned_plan_mutation_requests", "lifecycle_plan_revision"],
  ["library.starter-detail", "owned_plan_mutation_requests", "inactive_starter_copy_plan_and_schedule_revision"],
  ["library.starter-activation", "starter_plan_activation_requests", "activated_plan_and_schedule_revision"],
  ["library.template-update", "owned_plan_mutation_requests", "independent_template_update_copy_plan_and_schedule_revision"],
  ["library.create-strength", "owned_plan_mutation_requests", "created_plan_revision"],
  ["library.plan-editor", "owned_plan_mutation_requests", "saved_plan_revision"],
  ["library.schedule-editor", "owned_plan_schedule_events", "saved_schedule_and_plan_revision"],
  ["library.replacement-impact", "owned_plan_schedule_events", "replacement_plan_and_schedule_revision"],
  ["library.day-removal-impact", "owned_plan_schedule_events", "day_removal_plan_and_schedule_revision"],
  ["library.custom-exercise", "custom_exercise_mutation_receipts", "archived_exercise_revision"],
  ["library.create-exercise", "custom_exercise_mutation_receipts", "created_exercise_revision"],
  ["library.copy-metric-migration", "metric_profile_migration_events", "migrated_exercise_generation_and_revision"],
] as const);

export type Phase17FamilyAMutationReceipt = Readonly<{
  caseId: (typeof PHASE17_FAMILY_A_MUTATION_RECEIPTS)[number][0];
  receiptTable: (typeof PHASE17_FAMILY_A_MUTATION_RECEIPTS)[number][1];
  resultComparator: (typeof PHASE17_FAMILY_A_MUTATION_RECEIPTS)[number][2];
}>;

export const PHASE17_CASE_ACTION_CONTRACTS = Object.freeze(rows.map(([id, , proofMode, action, uiReadback, sourceProbe]) => Object.freeze({ id, proofMode, action, uiReadback, sourceProbe, rawReportRequired: true as const, cleanupRequired: true as const, actionReceiptRequired: proofMode === "mutating" })));
export const PHASE17_LIBRARY_RUNNING_CASES = Object.freeze(rows.map(([id, requirement, , , , , ...assertions]) => Object.freeze({ id, requirements: Object.freeze(requirement === null ? [] : [requirement]), assertions: Object.freeze(assertions) })));
export const PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS = Object.freeze(PHASE17_LIBRARY_RUNNING_CASES.map(({ id }) => id));
export const PHASE17_EVIDENCE_PATH = ".planning/phases/17-library-running-plans/evidence/phase17-library-running.json";
