const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export type RunningActivityMatchAction = "match" | "unmatch" | "reassign";

export type RunningActivityMatchInput = Readonly<{
  requestId: string;
  requestSha256: string;
  action: RunningActivityMatchAction;
  activityId: string;
  expectedActivityRevision: number;
  opportunityId: string;
  expectedOpportunityRevision: number;
  expectedRelationRevision: number;
  scheduleId: string;
  scheduleVersionId: string;
  slotId: string;
  sessionRevisionId: string;
  occurredAtMs: number;
  expectedCurrentOpportunityId?: string;
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

export class RunningActivityMatchCommandError extends Error {
  constructor() {
    super("running_activity_match_invalid");
    this.name = "RunningActivityMatchCommandError";
  }
}

function validRevision(value: number, minimum = 0): boolean {
  return Number.isSafeInteger(value) && value >= minimum;
}

function assertInput(input: RunningActivityMatchInput): void {
  const ids = [input.requestId, input.activityId, input.opportunityId, input.scheduleId, input.scheduleVersionId, input.slotId, input.sessionRevisionId];
  if (!SHA256.test(input.requestSha256) || ids.some((value) => !ID.test(value))
    || !validRevision(input.expectedActivityRevision, 1)
    || !validRevision(input.expectedOpportunityRevision, 1)
    || !validRevision(input.expectedRelationRevision)
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
