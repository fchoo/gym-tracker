import type { AcceptedStarterTemplate } from "../domains/plans";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";
import {
  createLibrarySectionPreferencePort,
  type LibraryRuntimeSectionPreference,
} from "./librarySectionPreferencePort";
import type { StarterPlanRuntimeSummary } from "./starterPlanRuntime";

export type LibraryRuntimePlanSummary = Readonly<{
  id: string;
  name: string;
  sport: "Running" | "Strength";
  daysPerWeek: number;
  status?: "Active" | "Draft" | "Archived" | "Inactive";
  scheduleSummary?: string;
  missingRequirement?: string | null;
  templateUpdateTemplateId?: string;
}>;

export type LibraryRuntimeStarterPlanSummary = StarterPlanRuntimeSummary;

export type LibraryRuntimeSnapshot = Readonly<{
  sectionPreference: LibraryRuntimeSectionPreference;
  plans: Readonly<{
    active: LibraryRuntimePlanSummary | null;
    activePlans: readonly LibraryRuntimePlanSummary[];
    owned: readonly LibraryRuntimePlanSummary[];
    starters: readonly LibraryRuntimeStarterPlanSummary[];
  }>;
  exerciseFilterOptions: Readonly<{
    exerciseTypes: readonly string[];
    muscles: readonly string[];
    equipment: readonly string[];
  }>;
}>;

/** The screen renders these exact source-owned action affordances. */
export const LIBRARY_ACTION_SHEET_CONFIGURATION = Object.freeze({
  heading: "Library actions",
  triggerLabel: "Actions",
  sheetTestId: "library-actions-sheet-frame",
  actions: Object.freeze([
    Object.freeze({ id: "create-plan", label: "Create plan", tone: "primary", enabled: true }),
    Object.freeze({ id: "create-exercise", label: "Create exercise", tone: "secondary", enabled: true }),
    Object.freeze({ id: "import-plan", label: "Import plan, unavailable, Later", tone: "secondary", enabled: false }),
  ]),
});

/**
 * The Library action sheet delegates modal focus and reduced-motion behavior to
 * BottomSheet.  This projection names the real screen affordances so callers
 * can validate recovery against the same runtime configuration.
 */
export const LIBRARY_ACCESSIBILITY_RECOVERY_PROFILE = Object.freeze({
  actionSheetTestId: LIBRARY_ACTION_SHEET_CONFIGURATION.sheetTestId,
  focusRestore: "library-actions-trigger",
  supportedSections: Object.freeze(["plans", "exercises"] as const),
  minimumTouchTargetDp: 48,
  respectsReducedMotion: true,
});

type LibraryPlanRow = Readonly<{
  id: string;
  name: string;
  days_per_week: number;
  is_active: number;
  lifecycle: "draft" | "ready" | "archived" | null;
  missing_requirement: string | null;
  schedule_lifecycle: "active" | "inactive" | null;
  legacy_schedule_id: string | null;
  source_namespace: string | null;
  upstream_id: string | null;
  source_revision: number | null;
  plan_kind: "running" | "strength";
}>;

type LibraryTaxonomyRow = Readonly<{
  kind: "exercise_type" | "muscle" | "equipment";
  slug: string;
}>;

function libraryPlanStatus(row: LibraryPlanRow): LibraryRuntimePlanSummary["status"] {
  if (row.is_active === 1 || row.schedule_lifecycle === "active") return "Active";
  if (row.lifecycle === "archived") return "Archived";
  if (row.lifecycle === "draft") return "Draft";
  return "Inactive";
}

async function readLibraryPlans(
  kernel: SqliteKernel,
  starterPlans: readonly LibraryRuntimeStarterPlanSummary[],
  templates: readonly AcceptedStarterTemplate[],
): Promise<LibraryRuntimeSnapshot["plans"]> {
  const rows = await kernel.queryAll<LibraryPlanRow>(
    `SELECT plan.id,
            plan.name,
            plan.days_per_week,
            plan.is_active,
            state.lifecycle,
            state.missing_requirement,
            schedule.lifecycle AS schedule_lifecycle,
            legacy_schedule.id AS legacy_schedule_id,
            plan.source_namespace,
            plan.upstream_id,
            source.source_revision,
            plan.plan_kind
     FROM plans plan
     LEFT JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
     LEFT JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
     LEFT JOIN plan_schedules legacy_schedule ON legacy_schedule.plan_id = plan.id
     LEFT JOIN owned_plan_starter_sources source ON source.plan_id = plan.id
     WHERE plan.origin IN ('custom', 'copied')
     ORDER BY plan.name COLLATE NOCASE, plan.id`,
  );
  const summaries = rows.map((row) => {
    const template = templates.find(({ id }) => id === row.upstream_id);
    const sourceRevision = row.source_revision
      ?? (row.source_namespace === "gym-tracker.original" ? 1 : null);
    return Object.freeze({
      id: row.id,
      name: row.name,
      sport: row.plan_kind === "running" ? "Running" : "Strength",
      daysPerWeek: row.days_per_week,
      status: libraryPlanStatus(row)!,
      scheduleSummary: row.schedule_lifecycle === "active"
        ? "Active schedule"
        : row.schedule_lifecycle === "inactive"
          ? "Inactive schedule"
          : row.legacy_schedule_id !== null
            ? row.is_active === 1 ? "Active Weekday schedule" : "Inactive Weekday schedule"
            : "Not scheduled",
      missingRequirement: row.missing_requirement,
      ...(template !== undefined && sourceRevision !== null && sourceRevision < template.revision
        ? { templateUpdateTemplateId: template.id }
        : {}),
    });
  });
  const activePlans = summaries.filter(({ status }) => status === "Active");
  const activeSports = new Set<string>();
  for (const activePlan of activePlans) {
    if (activeSports.has(activePlan.sport)) throw new Error("library_active_plan_contract_invalid");
    activeSports.add(activePlan.sport);
  }
  return Object.freeze({
    active: activePlans[0] ?? null,
    activePlans: Object.freeze(activePlans),
    owned: Object.freeze(summaries),
    starters: starterPlans,
  });
}

async function readLibraryFilterOptions(kernel: SqliteKernel): Promise<LibraryRuntimeSnapshot["exerciseFilterOptions"]> {
  const rows = await kernel.queryAll<LibraryTaxonomyRow>(
    `SELECT kind, slug
     FROM taxonomy_terms
     WHERE kind IN ('exercise_type', 'muscle', 'equipment')
     ORDER BY kind, display_name COLLATE NOCASE, slug`,
  );
  return Object.freeze({
    exerciseTypes: Object.freeze(rows.filter(({ kind }) => kind === "exercise_type").map(({ slug }) => slug)),
    muscles: Object.freeze(rows.filter(({ kind }) => kind === "muscle").map(({ slug }) => slug)),
    equipment: Object.freeze(rows.filter(({ kind }) => kind === "equipment").map(({ slug }) => slug)),
  });
}

/** Production Library read boundary used by the runtime and semantic acceptance. */
export async function readLibraryRuntimeSnapshot(input: Readonly<{
  kernel: SqliteKernel;
  nowMs: () => number;
  starterPlans: readonly LibraryRuntimeStarterPlanSummary[];
  templates: readonly AcceptedStarterTemplate[];
}>): Promise<LibraryRuntimeSnapshot> {
  const [sectionPreference, plans, exerciseFilterOptions] = await Promise.all([
    createLibrarySectionPreferencePort(input.kernel, input.nowMs).read(),
    readLibraryPlans(input.kernel, input.starterPlans, input.templates),
    readLibraryFilterOptions(input.kernel),
  ]);
  return Object.freeze({ sectionPreference, plans, exerciseFilterOptions });
}
