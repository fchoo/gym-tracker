import { z } from "zod";

export const RUNNING_SESSION_KINDS = [
  "recovery",
  "long_run",
  "progression",
  "tempo",
  "intervals",
  "hills",
  "fartlek",
] as const;

export type RunningSessionKind = (typeof RUNNING_SESSION_KINDS)[number];

export type RunningBoundaryErrorKind = "validation" | "unsupported_version";

export class RunningBoundaryError extends Error {
  readonly retryable = false;
  readonly correlationCode = "GT-RUNNING01";

  constructor(
    readonly kind: RunningBoundaryErrorKind,
    readonly code: "running_goal_invalid" | "running_session_invalid" | "running_session_unsupported",
  ) {
    super(code);
    this.name = "RunningBoundaryError";
  }
}

const IdentifierSchema = z.string().min(1).max(128).refine((value) => value.trim().length > 0);
const PositiveIntegerSchema = z.number().int().positive().safe();
const NonnegativeIntegerSchema = z.number().int().nonnegative().safe();
const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const WeekdaySchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

const QuantitySchema = z.union([
  z.strictObject({ distanceMeters: PositiveIntegerSchema }),
  z.strictObject({ durationMs: PositiveIntegerSchema }),
]);

const RunningStepSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ordinal: NonnegativeIntegerSchema, kind: z.literal("distance"), distanceMeters: PositiveIntegerSchema }),
  z.strictObject({ ordinal: NonnegativeIntegerSchema, kind: z.literal("duration"), durationMs: PositiveIntegerSchema }),
  z.strictObject({ ordinal: NonnegativeIntegerSchema, kind: z.literal("recovery"), durationMs: PositiveIntegerSchema }),
]);

const RunningPhaseSchema = z.strictObject({
  ordinal: NonnegativeIntegerSchema,
  kind: z.enum(["warm_up", "work", "cool_down"]),
  steps: z.array(RunningStepSchema).min(1).max(100),
});

const AdvisoryTargetSchema = z.strictObject({
  paceMsPerKm: PositiveIntegerSchema.optional(),
  heartRateZone: z.number().int().min(1).max(5).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
}).refine((target) => Object.keys(target).length > 0);

const EmptyContextSchema = z.strictObject({});
const LongRunContextSchema = z.strictObject({
  finish: z.enum(["easy_throughout", "steady_finish", "progression_finish"]),
});
const ProgressionContextSchema = z.strictObject({
  stages: z.number().int().min(2).max(30),
  startTarget: AdvisoryTargetSchema,
  finishTarget: AdvisoryTargetSchema,
});
const TempoContextSchema = z.strictObject({
  format: z.literal("continuous"),
  work: QuantitySchema,
}).or(z.strictObject({
  format: z.literal("tempo_repeats"),
  repetitions: PositiveIntegerSchema.max(100),
  work: QuantitySchema,
  recovery: QuantitySchema,
}));
const IntervalsContextSchema = z.strictObject({
  repetitions: PositiveIntegerSchema.max(100),
  work: QuantitySchema,
  recovery: QuantitySchema,
});
const HillsContextSchema = z.strictObject({
  repetitions: PositiveIntegerSchema.max(100),
  work: QuantitySchema,
  returnRecovery: QuantitySchema,
});
const FartlekContextSchema = z.union([
  z.strictObject({
    format: z.literal("structured"),
    repetitions: PositiveIntegerSchema.max(100),
    work: QuantitySchema,
    recovery: QuantitySchema,
  }),
  z.strictObject({
    format: z.literal("unstructured"),
    repetitions: PositiveIntegerSchema.max(100),
    fastCue: z.string().trim().min(1).max(120),
    easyRecoveryCue: z.string().trim().min(1).max(120),
  }),
]);

const RevisionCommonSchema = z.strictObject({
  version: z.literal(1),
  id: IdentifierSchema,
  rootId: IdentifierSchema,
  planId: IdentifierSchema,
  revision: PositiveIntegerSchema,
  createdAtMs: NonnegativeIntegerSchema,
  phases: z.array(RunningPhaseSchema).max(100),
  advisoryTarget: AdvisoryTargetSchema.optional(),
});

export const RunningSessionRevisionV1Schema = z.discriminatedUnion("sessionKind", [
  RevisionCommonSchema.extend({ sessionKind: z.literal("recovery"), contextual: EmptyContextSchema }),
  RevisionCommonSchema.extend({ sessionKind: z.literal("long_run"), contextual: LongRunContextSchema }),
  RevisionCommonSchema.extend({ sessionKind: z.literal("progression"), contextual: ProgressionContextSchema }),
  RevisionCommonSchema.extend({ sessionKind: z.literal("tempo"), contextual: TempoContextSchema }),
  RevisionCommonSchema.extend({ sessionKind: z.literal("intervals"), contextual: IntervalsContextSchema }),
  RevisionCommonSchema.extend({ sessionKind: z.literal("hills"), contextual: HillsContextSchema }),
  RevisionCommonSchema.extend({ sessionKind: z.literal("fartlek"), contextual: FartlekContextSchema }),
]).superRefine((revision, context) => {
  const phaseOrdinals = revision.phases.map((phase) => phase.ordinal);
  if (new Set(phaseOrdinals).size !== phaseOrdinals.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "phase ordinals must be unique" });
  }
  for (const phase of revision.phases) {
    const stepOrdinals = phase.steps.map((step) => step.ordinal);
    if (new Set(stepOrdinals).size !== stepOrdinals.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "step ordinals must be unique" });
    }
  }
});

export type RunningSessionRevision = z.infer<typeof RunningSessionRevisionV1Schema>;

export const RunningSessionRootV1Schema = z.strictObject({
  version: z.literal(1),
  id: IdentifierSchema,
  planId: IdentifierSchema,
  sessionKind: z.enum(RUNNING_SESSION_KINDS),
  currentRevision: PositiveIntegerSchema,
  createdAtMs: NonnegativeIntegerSchema,
});

export type RunningSessionRoot = z.infer<typeof RunningSessionRootV1Schema>;

const BenchmarkSchema = z.strictObject({
  source: z.enum(["owner_selected", "imported_activity", "personal_history", "manual"]),
  distanceMeters: PositiveIntegerSchema,
  durationMs: PositiveIntegerSchema,
  localDate: LocalDateSchema,
});

export const RunningGoalV1Schema = z.strictObject({
  version: z.literal(1),
  id: IdentifierSchema,
  planId: IdentifierSchema,
  revision: PositiveIntegerSchema,
  goalDistanceMeters: PositiveIntegerSchema,
  targetDurationMs: PositiveIntegerSchema.optional(),
  targetLocalDate: LocalDateSchema.optional(),
  benchmark: BenchmarkSchema.optional(),
  benchmarks: z.strictObject({
    twoPointFourKm: BenchmarkSchema.optional(),
    tenKilometres: BenchmarkSchema.optional(),
    halfMarathon: BenchmarkSchema.optional(),
  }).optional(),
  trainingDays: z.array(WeekdaySchema).min(1).max(7).superRefine((days, context) => {
    if (new Set(days).size !== days.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "training days must be unique" });
    }
  }),
  /** Added fields remain optional at the persistence boundary so revisions
   * created before Phase 17 can be read without fabricated values. The editor
   * requires these facts before it issues a new revisioned save. */
  runsPerWeek: z.number().int().min(1).max(7).optional(),
  longRunDay: WeekdaySchema.optional(),
  currentWeeklyDistanceMeters: z.number().positive().finite().optional(),
  createdAtMs: NonnegativeIntegerSchema,
});

export type RunningGoal = z.infer<typeof RunningGoalV1Schema>;

/**
 * The authoring aggregate is the only Running shape exposed above the SQLite
 * boundary.  Session roots and slots deliberately remain source facts so a
 * later edit can append a revision without changing either durable identity.
 */
export type RunningPlanSession = Readonly<{
  slot: Readonly<{
    id: string;
    rootId: string;
    weekday: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
    revision: number;
    ordinal: number;
  }>;
  session: RunningSessionRevision;
}>;

export type RunningPlanAggregate = Readonly<{
  version: 1;
  id: string;
  name: string;
  revision: number;
  active: boolean;
  lifecycle: "inactive" | "active" | "archived";
  createdAtMs: number;
  goal: RunningGoal;
  sessions: readonly RunningPlanSession[];
}>;

export function parseRunningSessionRevision(input: unknown): RunningSessionRevision {
  const result = RunningSessionRevisionV1Schema.safeParse(input);
  if (!result.success) {
    throw new RunningBoundaryError("validation", "running_session_invalid");
  }
  return result.data;
}

export function parseRunningGoal(input: unknown): RunningGoal {
  const result = RunningGoalV1Schema.safeParse(input);
  if (!result.success) {
    throw new RunningBoundaryError("validation", "running_goal_invalid");
  }
  return result.data;
}

export function parseRunningPlanAggregate(input: unknown): RunningPlanAggregate {
  const aggregate = input as RunningPlanAggregate;
  if (
    aggregate?.version !== 1 || typeof aggregate.id !== "string" || aggregate.id.trim() === ""
    || typeof aggregate.name !== "string" || aggregate.name.trim() === "" || typeof aggregate.active !== "boolean"
    || (aggregate.lifecycle !== "inactive" && aggregate.lifecycle !== "active" && aggregate.lifecycle !== "archived")
    || (aggregate.active && aggregate.lifecycle !== "active")
    || (!aggregate.active && aggregate.lifecycle === "active")
    || !Number.isSafeInteger(aggregate.revision) || aggregate.revision < 1
    || !Number.isSafeInteger(aggregate.createdAtMs) || aggregate.createdAtMs < 0
    || !Array.isArray(aggregate.sessions)
  ) throw new RunningBoundaryError("validation", "running_goal_invalid");
  const goal = parseRunningGoal(aggregate.goal);
  if (goal.planId !== aggregate.id) throw new RunningBoundaryError("validation", "running_goal_invalid");
  const slotKeys = new Set<string>();
  const sessionRoots = new Set<string>();
  for (const entry of aggregate.sessions) {
    const session = parseRunningSessionRevision(entry.session);
    if (session.planId !== aggregate.id || sessionRoots.has(session.rootId)) {
      throw new RunningBoundaryError("validation", "running_session_invalid");
    }
    sessionRoots.add(session.rootId);
    const slot = entry.slot;
    if (!slot || typeof slot.id !== "string" || typeof slot.rootId !== "string"
      || !WeekdaySchema.safeParse(slot.weekday).success || !Number.isSafeInteger(slot.ordinal) || slot.ordinal < 0
      || !Number.isSafeInteger(slot.revision) || slot.revision < 1) {
      throw new RunningBoundaryError("validation", "running_session_invalid");
    }
    const key = `${slot.weekday}:${slot.ordinal}`;
    if (slotKeys.has(key)) throw new RunningBoundaryError("validation", "running_session_invalid");
    slotKeys.add(key);
  }
  return Object.freeze({ ...aggregate, goal, sessions: Object.freeze(aggregate.sessions.map((entry) => Object.freeze({
    slot: Object.freeze({ ...entry.slot }), session: parseRunningSessionRevision(entry.session),
  }))) });
}

export type RunningReadiness = Readonly<{
  ready: boolean;
  reason: "ready" | "missing_recovery" | "missing_slots";
}>;

/** The first activation gate is intentionally strict and deliberately small. */
export function evaluateRunningReadiness(input: Readonly<{
  hasRecoveryRevision: boolean;
  slotCount: number;
}>): RunningReadiness {
  if (!input.hasRecoveryRevision) return Object.freeze({ ready: false, reason: "missing_recovery" });
  if (!Number.isSafeInteger(input.slotCount) || input.slotCount < 1) return Object.freeze({ ready: false, reason: "missing_slots" });
  return Object.freeze({ ready: true, reason: "ready" });
}
