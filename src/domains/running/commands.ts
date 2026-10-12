import { createHash } from "node:crypto";

import {
  parseRunningPlanAggregate,
  parseRunningGoal,
  parseRunningSessionRevision,
  type RunningPlanAggregate,
  type RunningGoal,
  type RunningSessionRevision,
} from "./contracts";

const SHA256 = /^[a-f0-9]{64}$/u;

export type RunningCommandErrorCode =
  | "running_command_hash_invalid"
  | "running_command_identity_invalid"
  | "running_command_order_invalid"
  | "running_command_revision_invalid"
  | "running_target_invalid";

export class RunningCommandError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-RUNNING02" as const;

  constructor(readonly code: RunningCommandErrorCode) {
    super(code);
    this.name = "RunningCommandError";
  }
}

export type RunningSlotRevisionDraft = Readonly<{
  id: string;
  rootId: string;
  weekday: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  revision: number;
  ordinal: number;
  sessionRootId: string;
  sessionRevisionId: string;
}>;

export type SaveRunningSourceGraphInput = Readonly<{
  requestId: string;
  requestSha256: string;
  operation: "create" | "edit" | "copy";
  planId: string;
  expectedPlanRevision: number;
  createdAtMs: number;
  goal: RunningGoal;
  sessions: readonly RunningSessionRevision[];
  slots: readonly RunningSlotRevisionDraft[];
  /** Aggregate editors publish the complete current membership; lower-level
   * authoring callers may append a partial graph without retiring siblings. */
  completeMembership?: boolean;
}>;

export type RunningSourceGraphRepository = Readonly<{
  saveSourceGraph(input: SaveRunningSourceGraphInput): Promise<Readonly<Record<string, unknown>>>;
}>;

/** A target is a revision of the existing Running goal, never a Progress-owned
 * projection.  Keeping the full goal in the envelope makes the request
 * canonical and permits the repository receipt to replay it exactly. */
export type SaveRunningTargetInput = Readonly<{
  requestId: string;
  requestSha256: string;
  planId: string;
  expectedPlanRevision: number;
  expectedGoalRevision: number;
  savedAtMs: number;
  goal: RunningGoal;
}>;

export type CreateInactiveRunningPlanInput = Readonly<{
  requestId: string;
  requestSha256: string;
  plan: Omit<RunningPlanAggregate, "active" | "lifecycle">;
}>;

export type RunningAggregateRepository = Readonly<{
  createInactiveAggregate(input: CreateInactiveRunningPlanInput): Promise<RunningPlanAggregate>;
  readAggregate(planId: string): Promise<RunningPlanAggregate | null>;
}>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalRunningRequestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function identifier(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 128;
}

function assertInput(input: SaveRunningSourceGraphInput): void {
  if (!identifier(input.requestId) || !identifier(input.planId) || !SHA256.test(input.requestSha256)) {
    throw new RunningCommandError(input.requestId ? "running_command_hash_invalid" : "running_command_identity_invalid");
  }
  if (!Number.isSafeInteger(input.expectedPlanRevision) || input.expectedPlanRevision < 0 || !Number.isSafeInteger(input.createdAtMs) || input.createdAtMs < 0) {
    throw new RunningCommandError("running_command_revision_invalid");
  }
  const roots = new Set<string>();
  const revisions = new Set<string>();
  for (const session of input.sessions) {
    parseRunningSessionRevision(session);
    if (session.planId !== input.planId || !identifier(session.rootId) || roots.has(session.rootId) || revisions.has(session.id)) throw new RunningCommandError("running_command_identity_invalid");
    roots.add(session.rootId); revisions.add(session.id);
  }
  parseRunningGoal(input.goal);
  if (input.goal.planId !== input.planId) throw new RunningCommandError("running_command_identity_invalid");
  const slots = new Set<string>();
  const perDay = new Set<string>();
  for (const slot of input.slots) {
    if (!identifier(slot.id) || !identifier(slot.rootId) || slots.has(slot.rootId) || !roots.has(slot.sessionRootId) || !revisions.has(slot.sessionRevisionId)) throw new RunningCommandError("running_command_identity_invalid");
    if (!Number.isSafeInteger(slot.revision) || slot.revision < 1 || !Number.isSafeInteger(slot.ordinal) || slot.ordinal < 0 || perDay.has(`${slot.weekday}:${slot.ordinal}`)) throw new RunningCommandError("running_command_order_invalid");
    slots.add(slot.rootId); perDay.add(`${slot.weekday}:${slot.ordinal}`);
  }
}

export async function saveRunningSourceGraph(
  repository: RunningSourceGraphRepository,
  input: SaveRunningSourceGraphInput,
): Promise<Readonly<Record<string, unknown>>> {
  assertInput(input);
  return repository.saveSourceGraph(input);
}

function assertRunningTarget(input: SaveRunningTargetInput): void {
  if (!identifier(input.requestId) || !identifier(input.planId) || !SHA256.test(input.requestSha256)) {
    throw new RunningCommandError(input.requestId ? "running_command_hash_invalid" : "running_command_identity_invalid");
  }
  if (!Number.isSafeInteger(input.expectedPlanRevision) || input.expectedPlanRevision < 1
    || !Number.isSafeInteger(input.expectedGoalRevision) || input.expectedGoalRevision < 1
    || !Number.isSafeInteger(input.savedAtMs) || input.savedAtMs < 0) {
    throw new RunningCommandError("running_command_revision_invalid");
  }
  parseRunningGoal(input.goal);
  if (input.goal.planId !== input.planId || input.goal.revision !== input.expectedGoalRevision + 1
    || input.goal.createdAtMs !== input.savedAtMs
    || input.goal.targetDurationMs === undefined
    || input.goal.targetDurationMs < 60_000 || input.goal.targetDurationMs >= 86_400_000) {
    throw new RunningCommandError("running_target_invalid");
  }
}

/**
 * Stages one goal-only source revision.  It deliberately reuses the Running
 * graph writer: the generic writer already owns the exclusive plan revision,
 * immutable receipt and source-history transaction.  No UI or Progress table
 * receives an independent target mutation.
 */
export async function saveRunningTarget(
  repository: RunningSourceGraphRepository,
  input: SaveRunningTargetInput,
): Promise<Readonly<Record<string, unknown>>> {
  assertRunningTarget(input);
  return repository.saveSourceGraph({
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    operation: "edit",
    planId: input.planId,
    expectedPlanRevision: input.expectedPlanRevision,
    createdAtMs: input.savedAtMs,
    goal: input.goal,
    sessions: [],
    slots: [],
  });
}

export async function createInactiveRunningPlan(
  repository: RunningAggregateRepository,
  input: CreateInactiveRunningPlanInput,
): Promise<RunningPlanAggregate> {
  if (!identifier(input.requestId) || !SHA256.test(input.requestSha256)) {
    throw new RunningCommandError("running_command_hash_invalid");
  }
  const plan = parseRunningPlanAggregate({ ...input.plan, active: false, lifecycle: "inactive" });
  return repository.createInactiveAggregate({ ...input, plan });
}
