import {
  z,
} from "zod";

import {
  MetricIdentitySchema,
  parseMetricIdentity,
  parseMetricTarget,
  type MetricIdentity,
  type MetricTarget,
} from "../metrics";

export const ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION = 2 as const;

const RuleIdentifierSchema = z.string().min(1).max(128).refine(
  (value) => value.trim().length > 0,
);
const EntityIdentifierSchema = z.string().min(1).max(1_024).refine(
  (value) => value.trim().length > 0,
);
const RevisionSchema = z.number().int().nonnegative().safe();
const TimestampSchema = z.number().int().nonnegative().safe();
const NarrativeSchema = z.string().min(1).max(4_096).refine(
  (value) => value.trim().length > 0,
);

const ActionableRecommendationEvidenceSchema = z.strictObject({
  version: z.literal(ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION),
  rule: z.strictObject({
    id: RuleIdentifierSchema,
    version: z.number().int().positive().safe(),
  }),
  metricIdentity: MetricIdentitySchema,
  source: z.strictObject({
    sessionId: EntityIdentifierSchema,
    sessionExerciseId: EntityIdentifierSchema,
    sessionRevision: RevisionSchema,
    setIds: z.array(EntityIdentifierSchema).min(1).max(100),
  }).refine(
    ({ setIds }) => new Set(setIds).size === setIds.length,
  ),
  revisions: z.strictObject({
    source: RevisionSchema,
    target: RevisionSchema,
  }),
  targetScope: z.array(z.strictObject({
    id: EntityIdentifierSchema,
    revision: RevisionSchema,
  })).min(1).max(100).refine(
    (targets) => new Set(targets.map(({ id }) => id)).size === targets.length,
  ),
  currentTarget: z.unknown(),
  proposedTarget: z.unknown(),
  decision: NarrativeSchema,
  reasonCode: NarrativeSchema,
  reason: NarrativeSchema,
  confidence: NarrativeSchema,
  evaluator: z.unknown().optional(),
  lifecycle: z.strictObject({
    state: z.literal("pending"),
    createdAtMs: TimestampSchema,
  }),
});

export type ActionableRecommendationEvidence = Readonly<{
  version: typeof ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION;
  rule: Readonly<{ id: string; version: number }>;
  metricIdentity: MetricIdentity;
  source: Readonly<{
    sessionId: string;
    sessionExerciseId: string;
    sessionRevision: number;
    setIds: readonly string[];
  }>;
  revisions: Readonly<{ source: number; target: number }>;
  targetScope: readonly Readonly<{ id: string; revision: number }>[];
  currentTarget: MetricTarget;
  proposedTarget: MetricTarget;
  decision: string;
  reasonCode: string;
  reason: string;
  confidence: string;
  lifecycle: Readonly<{ state: "pending"; createdAtMs: number }>;
}>;

export type ActionableRecommendationEvidenceExpectation = Readonly<{
  rule: Readonly<{ id: string; version: number }>;
  metricIdentity: MetricIdentity;
  sourceRevision: number;
  targetRevision: number;
  targetId: string;
  sourceSessionRevision?: number;
  currentTarget: unknown;
  proposedTarget: unknown;
  createdAtMs: number;
}>;

export class RecommendationEvidenceError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-PROG02" as const;

  constructor(
    readonly code:
      | "recommendation_evidence_invalid"
      | "recommendation_evidence_mismatch",
  ) {
    super(code);
    this.name = "RecommendationEvidenceError";
  }
}

function sameIdentity(
  left: MetricIdentity,
  right: MetricIdentity,
): boolean {
  return left.profile === right.profile
    && left.contractVersion === right.contractVersion
    && left.exerciseMetricGeneration === right.exerciseMetricGeneration;
}

function parseTarget(
  identity: MetricIdentity,
  input: unknown,
): MetricTarget {
  try {
    return parseMetricTarget(identity, input);
  } catch {
    throw new RecommendationEvidenceError(
      "recommendation_evidence_invalid",
    );
  }
}

function sameTarget(
  left: MetricTarget,
  right: MetricTarget,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validExpectation(
  expected: ActionableRecommendationEvidenceExpectation,
): boolean {
  return RuleIdentifierSchema.safeParse(expected.rule.id).success
    && Number.isSafeInteger(expected.rule.version)
    && expected.rule.version >= 1
    && RevisionSchema.safeParse(expected.sourceRevision).success
    && RevisionSchema.safeParse(expected.targetRevision).success
    && EntityIdentifierSchema.safeParse(expected.targetId).success
    && (
      expected.sourceSessionRevision === undefined
      || RevisionSchema.safeParse(expected.sourceSessionRevision).success
    )
    && TimestampSchema.safeParse(expected.createdAtMs).success;
}

export function parseActionableRecommendationEvidence(input: Readonly<{
  evidence: unknown;
  expected: ActionableRecommendationEvidenceExpectation;
}>): ActionableRecommendationEvidence {
  if (!validExpectation(input.expected)) {
    throw new RecommendationEvidenceError(
      "recommendation_evidence_invalid",
    );
  }
  const parsed = ActionableRecommendationEvidenceSchema.safeParse(
    input.evidence,
  );
  if (!parsed.success) {
    throw new RecommendationEvidenceError(
      "recommendation_evidence_invalid",
    );
  }
  const identity = parseMetricIdentity(parsed.data.metricIdentity);
  const currentTarget = parseTarget(identity, parsed.data.currentTarget);
  const proposedTarget = parseTarget(identity, parsed.data.proposedTarget);
  const expectedIdentity = parseMetricIdentity(input.expected.metricIdentity);
  const expectedCurrentTarget = parseTarget(
    expectedIdentity,
    input.expected.currentTarget,
  );
  const expectedProposedTarget = parseTarget(
    expectedIdentity,
    input.expected.proposedTarget,
  );
  const targetScopeRevision = parsed.data.targetScope.find(
    ({ id }) => id === input.expected.targetId,
  )?.revision;
  if (
    parsed.data.rule.id !== input.expected.rule.id
    || parsed.data.rule.version !== input.expected.rule.version
    || !sameIdentity(identity, expectedIdentity)
    || parsed.data.revisions.source !== input.expected.sourceRevision
    || parsed.data.revisions.target !== input.expected.targetRevision
    || targetScopeRevision !== input.expected.targetRevision
    || (
      input.expected.sourceSessionRevision !== undefined
      && parsed.data.source.sessionRevision !== input.expected.sourceSessionRevision
    )
    || parsed.data.lifecycle.createdAtMs !== input.expected.createdAtMs
    || !sameTarget(currentTarget, expectedCurrentTarget)
    || !sameTarget(proposedTarget, expectedProposedTarget)
  ) {
    throw new RecommendationEvidenceError(
      "recommendation_evidence_mismatch",
    );
  }
  return {
    ...parsed.data,
    metricIdentity: identity,
    currentTarget,
    proposedTarget,
  };
}
