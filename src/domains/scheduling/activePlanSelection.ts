/**
 * A UI selection is an identity-bearing value, never a query for "the active
 * plan".  Persisted writers must revalidate this complete tuple before use.
 */
export type StrengthOccurrenceContext = Readonly<{
  kind: "strength";
  opportunityId: string;
  planId: string;
  planDayId: string;
  scheduleId: string;
  scheduleVersionId: string;
  localDate: string;
  timeZone: string;
  sourceRevisions: Readonly<{
    plan: number;
    day: number;
    schedule: number;
    opportunity: number;
  }>;
}>;

export function selectStrengthOccurrence(input: Readonly<{
  contexts: readonly StrengthOccurrenceContext[];
  opportunityId?: string;
}>): StrengthOccurrenceContext {
  if (input.opportunityId === undefined) {
    throw new Error("selected_strength_occurrence_ambiguous");
  }
  const matches = input.contexts.filter((context) =>
    context.opportunityId === input.opportunityId
  );
  if (matches.length !== 1) {
    throw new Error("selected_strength_occurrence_unavailable");
  }
  return matches[0]!;
}
