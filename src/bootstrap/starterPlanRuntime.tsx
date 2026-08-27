import type {
  AcceptedStarterPack,
  AcceptedStarterTemplate,
  StarterPlanCopyChoice,
} from "../domains/plans";
import {
  parseAcceptedStarterPlanPack,
} from "../domains/plans";
import type {
  InitialRotationScheduleBinding,
  InitialWeekdayScheduleBinding,
} from "../domains/scheduling";

export type StarterPlanRuntimeSummary = Readonly<{
  id: string;
  ordinal: number;
  name: string;
  daysPerWeek: number;
  goal: string;
  experience: string;
  equipment: readonly string[];
  estimateMinutes: number;
}>;

export const STARTER_TEMPLATE_UPDATE_MODE = "update";

export type StarterPlanRuntimeCatalog = Readonly<{
  pack: AcceptedStarterPack;
  summaries: readonly StarterPlanRuntimeSummary[];
  templates: readonly AcceptedStarterTemplate[];
}>;

export type StarterPlanRuntimeOwnedCopy = Readonly<{
  planId: string;
  name: string;
  state: "Active" | "Inactive";
  scheduleSummary: string;
  planRevision: number;
  scheduleRevision: number;
}>;

export type StarterPlanRuntimeActivationPreview = Readonly<{
  template: AcceptedStarterTemplate;
  startLocalDate: string;
  timeZone: string;
  activeScheduleRevision: number | null;
  copies: readonly StarterPlanRuntimeOwnedCopy[];
  activeWorkout: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }> | null;
}>;

export type StarterPlanRuntimeActivationCommand = Readonly<{
  templateId: string;
  startLocalDate: string;
  timeZone: string;
  mode: "weekday" | "rotation";
  bindings:
    | readonly InitialWeekdayScheduleBinding[]
    | readonly InitialRotationScheduleBinding[];
  copyChoice: StarterPlanCopyChoice | null;
  expectedActiveScheduleRevision: number | null;
}>;

export type StarterPlanTemplateUpdatePreview = Readonly<{
  ownedPlanId: string;
  ownedPlanName: string;
  ownedPlanRevision: number;
  activeScheduleRevision: number | null;
  template: AcceptedStarterTemplate;
  sections: readonly Readonly<{
    title: string;
    changes: readonly Readonly<{
      kind: "Added" | "Removed" | "Changed" | "Unchanged";
      detail: string;
    }>[];
  }>[];
}>;

export function starterFactLabel(value: string): string {
  return value.split(/[-_]/u).map((word) =>
    `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`
  ).join(" ");
}

export async function createStarterPlanRuntimeCatalog(
  input: Readonly<{
    starterPackBytes: string;
    acceptanceBytes: string;
    sha256(value: string): Promise<string>;
  }>,
): Promise<StarterPlanRuntimeCatalog> {
  const pack = await parseAcceptedStarterPlanPack(input);
  const templates = Object.freeze([...pack.templates]);
  const summaries = Object.freeze(templates.map((template) => Object.freeze({
    id: template.id,
    ordinal: template.ordinal,
    name: template.displayName,
    daysPerWeek: template.daysPerWeek,
    goal: template.goal,
    experience: starterFactLabel(template.experience),
    equipment: Object.freeze(template.equipment.map(starterFactLabel)),
    estimateMinutes: template.estimatedDurationMinutes,
  })));

  return Object.freeze({
    pack,
    summaries,
    templates,
  });
}

export function findStarterPlan(
  catalog: StarterPlanRuntimeCatalog,
  templateId: string,
): AcceptedStarterTemplate | null {
  return catalog.templates.find(({ id }) => id === templateId) ?? null;
}

type SourceTemplate = Readonly<{
  displayName?: unknown;
  days?: unknown;
  scheduleSuggestion?: unknown;
  progressionSummary?: unknown;
}>;

function sourceTemplate(value: string): SourceTemplate {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("starter_source_template_invalid");
  }
  return parsed;
}

function recordList(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Readonly<Record<string, unknown>> =>
        typeof item === "object" && item !== null && !Array.isArray(item)
      )
    : [];
}

function namedMap(
  values: readonly Readonly<Record<string, unknown>>[],
  nameKey: string,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  return new Map(values.flatMap((value) =>
    typeof value.id === "string" && typeof value[nameKey] === "string"
      ? [[value.id, value]]
      : []
  ));
}

function diffNamedRecords(
  previous: readonly Readonly<Record<string, unknown>>[],
  current: readonly Readonly<Record<string, unknown>>[],
  nameKey: string,
  itemLabel: string,
): readonly Readonly<{
  kind: "Added" | "Removed" | "Changed" | "Unchanged";
  detail: string;
}>[] {
  const previousById = namedMap(previous, nameKey);
  const currentById = namedMap(current, nameKey);
  const identifiers = [...new Set([
    ...previousById.keys(),
    ...currentById.keys(),
  ])].sort((left, right) => left.localeCompare(right, "en"));
  const changes: Array<Readonly<{
    kind: "Added" | "Removed" | "Changed" | "Unchanged";
    detail: string;
  }>> = [];
  for (const identifier of identifiers) {
    const before = previousById.get(identifier);
    const after = currentById.get(identifier);
    if (before === undefined && after !== undefined) {
      changes.push({
        kind: "Added",
        detail: `${itemLabel} ${String(after[nameKey])} added`,
      });
      continue;
    }
    if (before !== undefined && after === undefined) {
      changes.push({
        kind: "Removed",
        detail: `${itemLabel} ${String(before[nameKey])} removed`,
      });
      continue;
    }
    if (
      before !== undefined
      && after !== undefined
      && JSON.stringify(before) !== JSON.stringify(after)
    ) {
      changes.push({
        kind: "Changed",
        detail: `${itemLabel} ${String(before[nameKey])} changed`,
      });
    }
  }
  return changes.length === 0
    ? [{ kind: "Unchanged", detail: `No accepted ${itemLabel.toLowerCase()} changes` }]
    : changes;
}

function flattenedExercises(
  days: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
  return days.flatMap((day) => recordList(day.exercises));
}

function projectedOccurrences(
  days: readonly Readonly<Record<string, unknown>>[],
  key: "target" | "policy",
): readonly Readonly<Record<string, unknown>>[] {
  return flattenedExercises(days).flatMap((occurrence) =>
    typeof occurrence.id === "string"
      ? [{
          id: occurrence.id,
          displayName: typeof occurrence.catalogName === "string"
            ? occurrence.catalogName
            : occurrence.id,
          [key]: occurrence[key],
        }]
      : []
  );
}

export function createStarterTemplateUpdatePreview(input: Readonly<{
  ownedPlanId: string;
  ownedPlanName: string;
  ownedPlanRevision: number;
  activeScheduleRevision: number | null;
  previousSourceJson: string;
  template: AcceptedStarterTemplate;
}>): StarterPlanTemplateUpdatePreview {
  const previous = sourceTemplate(input.previousSourceJson);
  const current = sourceTemplate(input.template.sourceJson);
  const previousDays = recordList(previous.days);
  const currentDays = recordList(current.days);
  const scheduleChanged = JSON.stringify(previous.scheduleSuggestion)
    !== JSON.stringify(current.scheduleSuggestion);
  const progressionChanged = JSON.stringify({
    summary: previous.progressionSummary,
    policies: projectedOccurrences(previousDays, "policy"),
  }) !== JSON.stringify({
    summary: current.progressionSummary,
    policies: projectedOccurrences(currentDays, "policy"),
  });

  return Object.freeze({
    ownedPlanId: input.ownedPlanId,
    ownedPlanName: input.ownedPlanName,
    ownedPlanRevision: input.ownedPlanRevision,
    activeScheduleRevision: input.activeScheduleRevision,
    template: input.template,
    sections: Object.freeze([
      Object.freeze({
        title: "Days",
        changes: Object.freeze(diffNamedRecords(
          previousDays,
          currentDays,
          "displayName",
          "Day",
        )),
      }),
      Object.freeze({
        title: "Exercises",
        changes: Object.freeze(diffNamedRecords(
          flattenedExercises(previousDays),
          flattenedExercises(currentDays),
          "catalogName",
          "Exercise",
        )),
      }),
      Object.freeze({
        title: "Targets",
        changes: Object.freeze(diffNamedRecords(
          projectedOccurrences(previousDays, "target"),
          projectedOccurrences(currentDays, "target"),
          "displayName",
          "Target for",
        )),
      }),
      Object.freeze({
        title: "Schedule defaults",
        changes: Object.freeze([scheduleChanged
          ? {
              kind: "Changed" as const,
              detail: "Suggested schedule bindings changed",
            }
          : {
              kind: "Unchanged" as const,
              detail: "No accepted schedule-default changes",
            }]),
      }),
      Object.freeze({
        title: "Progression policies",
        changes: Object.freeze([progressionChanged
          ? {
              kind: "Changed" as const,
              detail: "Progression summary or occurrence policies changed",
            }
          : {
              kind: "Unchanged" as const,
              detail: "No accepted progression-policy changes",
            }]),
      }),
    ]),
  });
}

export function legacyFullBodySourceJson(
  legacyAsset: Readonly<{
    metadata: Readonly<{
      displayName: string;
      progressionPolicy: string;
      schedule: Readonly<{
        mode: string;
        cycle: ReadonlyArray<ReadonlyArray<Readonly<{
          weekday: string;
          day: string;
        }>>>;
      }>;
    }>;
    days: readonly Readonly<{
      name: string;
      exercises: readonly Readonly<{
        name: string;
        metricProfile: string;
        restSeconds: number;
        target: unknown;
        policy: unknown;
        warmups: readonly unknown[];
      }>[];
    }>[];
  }>,
  template: AcceptedStarterTemplate,
): string {
  const currentDays = new Map(
    template.days.map((day) => [day.displayName, day]),
  );
  const days = legacyAsset.days.map((legacyDay, dayIndex) => {
    const currentDay = currentDays.get(legacyDay.name);
    const currentOccurrences = new Map(
      currentDay?.exercises.map((occurrence) => [
        occurrence.catalogName,
        occurrence,
      ]) ?? [],
    );
    return {
      id: currentDay?.id ?? `legacy-day-${dayIndex + 1}`,
      displayName: legacyDay.name,
      exercises: legacyDay.exercises.map((legacyOccurrence, index) => ({
        id: currentOccurrences.get(legacyOccurrence.name)?.id
          ?? `legacy-occurrence-${dayIndex + 1}-${index + 1}`,
        catalogName: legacyOccurrence.name,
        metricIdentity: {
          profile: legacyOccurrence.metricProfile,
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        target: legacyOccurrence.target,
        warmups: legacyOccurrence.warmups,
        restSeconds: legacyOccurrence.restSeconds,
        policy: legacyOccurrence.policy,
      })),
    };
  });
  const dayIds = new Map(days.map((day) => [day.displayName, day.id]));
  return JSON.stringify({
    displayName: legacyAsset.metadata.displayName,
    days,
    scheduleSuggestion: {
      mode: "weekday",
      cycleWeeks: legacyAsset.metadata.schedule.cycle.map((week) =>
        week.map((binding) => ({
          weekday: binding.weekday,
          dayId: dayIds.get(binding.day) ?? binding.day,
        }))
      ),
    },
    progressionSummary: legacyAsset.metadata.progressionPolicy,
  });
}
