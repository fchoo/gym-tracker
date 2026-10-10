export type ScheduleCollisionChoice = "move_running" | "move_strength" | "keep_both";

export type ScheduleCollisionOccurrence = Readonly<{
  occurrenceId: string;
  planId: string;
  planName: string;
  scheduleId: string;
  scheduleVersionId: string;
  scheduleRevision: number;
  occurrenceRevision: number;
  localDate: string;
  movedLocalDate: string;
}>;

export type ScheduleCollisionPreview = Readonly<{
  running: ScheduleCollisionOccurrence;
  strength: ScheduleCollisionOccurrence;
  confirmationToken: string;
}>;

export type CommitScheduleCollisionChoiceInput = Readonly<{
  requestId: string;
  choice: ScheduleCollisionChoice;
  preview: ScheduleCollisionPreview;
  committedAtMs: number;
}>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function collisionPreviewPayload(preview: Omit<ScheduleCollisionPreview, "confirmationToken">): string {
  return stableJson(preview);
}

export async function createScheduleCollisionPreviewToken(input: Readonly<{
  preview: Omit<ScheduleCollisionPreview, "confirmationToken">;
  sha256(value: string): Promise<string>;
}>): Promise<string> {
  return `schedule-collision-preview-v1:${await input.sha256(collisionPreviewPayload(input.preview))}`;
}

export function canonicalScheduleCollisionRequest(input: CommitScheduleCollisionChoiceInput): string {
  return stableJson({
    choice: input.choice,
    committedAtMs: input.committedAtMs,
    preview: input.preview,
    requestId: input.requestId,
  });
}
