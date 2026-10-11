import { parseImportedActivityLocalId } from "../activities/activityDetails";
import type { RunningSessionKind } from "./contracts";

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const LOCAL_TIME = /^\d{2}:\d{2}$/u;

export type RunningActivityMatchAction = "match" | "unmatch" | "reassign";

export type RunningActivityMatchInput = Readonly<{
  requestId: string;
  requestSha256: string;
  action: RunningActivityMatchAction;
  activityId: string;
  expectedActivityRevision: number;
  expectedAcceptedPayloadSha256: string;
  opportunityId: string;
  expectedOpportunityRevision: number;
  expectedRelationRevision: number;
  planId: string;
  scheduleId: string;
  scheduleVersionId: string;
  expectedScheduleRevision: number;
  planDayId: string;
  expectedPlanDayRevision: number;
  slotId: string;
  slotRevisionId: string;
  expectedSlotRevision: number;
  sessionRevisionId: string;
  expectedSessionRevision: number;
  occurredAtMs: number;
  expectedCurrentOpportunityId?: string;
}>;

export type RunningActivityMatchCandidate = Readonly<{
  activityId: string;
  expectedActivityRevision: number;
  expectedAcceptedPayloadSha256: string;
  opportunityId: string;
  expectedOpportunityRevision: number;
  planId: string;
  planName: string;
  scheduleId: string;
  scheduleVersionId: string;
  expectedScheduleRevision: number;
  planDayId: string;
  expectedPlanDayRevision: number;
  slotId: string;
  slotRevisionId: string;
  expectedSlotRevision: number;
  slotOrdinal: number;
  sessionRevisionId: string;
  expectedSessionRevision: number;
  sessionKind: RunningSessionKind;
  localDate: string;
  localTime: string | null;
  timezone: string;
  targetSummary: string;
  state: "planned";
  expectedRelationRevision: number;
}>;

export type RunningActivityMatchReadResult =
  | Readonly<{
    kind: "ready";
    activityId: string;
    candidates: readonly RunningActivityMatchCandidate[];
  }>
  | Readonly<{ kind: "missing" | "activity_unavailable" | "no_candidates"; activityId: string }>
  | Readonly<{
    kind: "already_matched";
    activityId: string;
    opportunityId: string;
    relationRevision: number;
  }>;

export type RunningActivityMatchResult = Readonly<{
  kind: "matched" | "unmatched" | "reassigned" | "replayed" | "conflict";
  activityId: string;
  opportunityId: string;
  relationRevision: number;
}>;

export type RunningActivityMatchRepository = Readonly<{
  confirm(input: RunningActivityMatchInput): Promise<RunningActivityMatchResult>;
}>;

export type RunningActivityMatchQueryRepository = Readonly<{
  readCandidates(activityId: string): Promise<RunningActivityMatchReadResult>;
}>;

export type RunningActivityMatchSha256 = (value: string) => Promise<string>;

export class RunningActivityMatchCommandError extends Error {
  constructor() {
    super("running_activity_match_invalid");
    this.name = "RunningActivityMatchCommandError";
  }
}

function validRevision(value: number, minimum = 0): boolean {
  return Number.isSafeInteger(value) && value >= minimum;
}

function validCandidate(input: RunningActivityMatchCandidate): boolean {
  return parseImportedActivityLocalId(input.activityId) !== null
    && [
      input.opportunityId,
      input.planId,
      input.scheduleId,
      input.scheduleVersionId,
      input.planDayId,
      input.slotId,
      input.slotRevisionId,
      input.sessionRevisionId,
    ].every((value) => ID.test(value))
    && input.planName.trim().length > 0
    && input.planName.length <= 160
    && SHA256.test(input.expectedAcceptedPayloadSha256)
    && validRevision(input.expectedActivityRevision, 1)
    && input.expectedOpportunityRevision === 1
    && validRevision(input.expectedScheduleRevision, 1)
    && validRevision(input.expectedPlanDayRevision)
    && validRevision(input.expectedSlotRevision, 1)
    && validRevision(input.slotOrdinal)
    && validRevision(input.expectedSessionRevision, 1)
    && validRevision(input.expectedRelationRevision)
    && ["recovery", "long_run", "progression", "tempo", "intervals", "hills", "fartlek"].includes(input.sessionKind)
    && LOCAL_DATE.test(input.localDate)
    && (input.localTime === null || LOCAL_TIME.test(input.localTime))
    && input.timezone.trim().length > 0
    && input.timezone.length <= 120
    && input.targetSummary.trim().length > 0
    && input.targetSummary.length <= 240
    && input.state === "planned";
}

function assertInput(input: RunningActivityMatchInput): void {
  const ids = [input.requestId, input.activityId, input.opportunityId, input.planId,
    input.scheduleId, input.scheduleVersionId, input.planDayId, input.slotId,
    input.slotRevisionId, input.sessionRevisionId];
  if (!SHA256.test(input.requestSha256)
    || !SHA256.test(input.expectedAcceptedPayloadSha256)
    || ids.some((value) => typeof value !== "string" || !ID.test(value))
    || !validRevision(input.expectedActivityRevision, 1)
    || input.expectedOpportunityRevision !== 1
    || !validRevision(input.expectedRelationRevision)
    || !validRevision(input.expectedScheduleRevision, 1)
    || !validRevision(input.expectedPlanDayRevision)
    || !validRevision(input.expectedSlotRevision, 1)
    || !validRevision(input.expectedSessionRevision, 1)
    || !validRevision(input.occurredAtMs)
    || !["match", "unmatch", "reassign"].includes(input.action)) {
    throw new RunningActivityMatchCommandError();
  }
  if (input.action === "match" && input.expectedCurrentOpportunityId !== undefined) {
    throw new RunningActivityMatchCommandError();
  }
  if (input.action !== "match" && (input.expectedCurrentOpportunityId === undefined || !ID.test(input.expectedCurrentOpportunityId))) {
    throw new RunningActivityMatchCommandError();
  }
}

export async function confirmRunningActivityMatch(
  repository: RunningActivityMatchRepository,
  input: RunningActivityMatchInput,
): Promise<RunningActivityMatchResult> {
  assertInput(input);
  return repository.confirm(input);
}

export async function queryRunningActivityMatchCandidates(
  repository: RunningActivityMatchQueryRepository,
  activityId: string,
): Promise<RunningActivityMatchReadResult> {
  const localActivityId = parseImportedActivityLocalId(activityId);
  if (localActivityId === null) {
    return Object.freeze({ kind: "missing", activityId: "invalid-local-activity" });
  }
  const result = await repository.readCandidates(localActivityId);
  if (result.kind === "ready" && result.candidates.some((candidate) => !validCandidate(candidate))) {
    throw new RunningActivityMatchCommandError();
  }
  return result;
}

export async function prepareRunningActivityMatchInput(
  input: Readonly<{
    action: RunningActivityMatchAction;
    candidate: RunningActivityMatchCandidate;
    requestId: string;
    occurredAtMs: number;
    expectedCurrentOpportunityId?: string;
  }>,
  sha256: RunningActivityMatchSha256,
): Promise<RunningActivityMatchInput> {
  if (!validCandidate(input.candidate) || !ID.test(input.requestId) || !validRevision(input.occurredAtMs)) {
    throw new RunningActivityMatchCommandError();
  }
  const candidate = input.candidate;
  const requestFacts = {
    action: input.action,
    requestId: input.requestId,
    activityId: candidate.activityId,
    expectedActivityRevision: candidate.expectedActivityRevision,
    expectedAcceptedPayloadSha256: candidate.expectedAcceptedPayloadSha256,
    opportunityId: candidate.opportunityId,
    expectedOpportunityRevision: candidate.expectedOpportunityRevision,
    expectedRelationRevision: candidate.expectedRelationRevision,
    planId: candidate.planId,
    scheduleId: candidate.scheduleId,
    scheduleVersionId: candidate.scheduleVersionId,
    expectedScheduleRevision: candidate.expectedScheduleRevision,
    planDayId: candidate.planDayId,
    expectedPlanDayRevision: candidate.expectedPlanDayRevision,
    slotId: candidate.slotId,
    slotRevisionId: candidate.slotRevisionId,
    expectedSlotRevision: candidate.expectedSlotRevision,
    sessionRevisionId: candidate.sessionRevisionId,
    expectedSessionRevision: candidate.expectedSessionRevision,
    occurredAtMs: input.occurredAtMs,
    ...(input.expectedCurrentOpportunityId === undefined
      ? {}
      : { expectedCurrentOpportunityId: input.expectedCurrentOpportunityId }),
  } as const;
  const requestSha256 = await sha256(JSON.stringify({ version: 1, ...requestFacts }));
  const prepared = Object.freeze({ ...requestFacts, requestSha256 });
  assertInput(prepared);
  return prepared;
}
