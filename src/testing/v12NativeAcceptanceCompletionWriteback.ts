import {
  createOwnedPlanRuntimePort,
  sessionExerciseWriteBackRequestId,
} from "../bootstrap/ownedPlanRuntime";
import { createCustomExercise } from "../domains/library/customExerciseCommands";
import {
  activateStarterPlan,
  createStarterPlanActivationConfirmationToken,
  parseAcceptedStarterPlanPack,
  type AcceptedStarterTemplate,
} from "../domains/plans/activateStarterPlan";
import { addExercise } from "../domains/workout/sessionExerciseCommands";
import { finishCompleted } from "../domains/workout/finishWorkout";
import { startWorkout } from "../domains/workout/startWorkout";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";
import { createContentRepository } from "../platform/sqlite/repositories/contentRepository";
import { createCustomExerciseRepository } from "../platform/sqlite/repositories/customExerciseRepository";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import { createStarterPlanRepository } from "../platform/sqlite/repositories/starterPlanRepository";
import { createWorkoutOutcomeRepository } from "../platform/sqlite/repositories/workoutOutcomeRepository";
import { createWorkoutRepository } from "../platform/sqlite/repositories/workoutRepository";
import starterPlansAsset from "../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../artifacts/review/phase2/starter-plans-acceptance.json";
import { parseAcceptedPhase2Catalog } from "./contracts/phase2Content.contract";

const NONCE = /^[a-f0-9]{48}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const CASE_ID = "workout.completion-writeback" as const;
const SEED_AT_MS = 1_900_000_000_000;

type Hash = (value: string) => Promise<string>;

type DurableReceipt = Readonly<{
  request_id: string;
  request_sha256: string;
  expected_revision: number;
  result_plan_id: string;
  result_revision: number;
  result_json: string;
  committed_at_ms: number;
}>;

type SourceOccurrence = Readonly<{
  id: string;
  plan_day_id: string;
  exercise_id: string;
  ordinal: number;
  revision: number;
}>;

type SourceTarget = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  revision: number;
}>;

type DurableResult = Readonly<{
  outcome: "committed";
  operation: "session_exercise_edits";
  planId: string;
  planRevision: number;
  sourceSessionId: string;
  currentWorkoutUnaffected: true;
}>;

export type V12CompletionWritebackActionProof = Readonly<{
  outcome: "committed" | "already_committed";
  committed_effects: number;
  durable_receipt_sha256: string;
  authoritative_source: Readonly<{
    table: "owned_plan_day_exercises";
    identity_sha256: string;
    state_sha256: string;
    plan_revision: number;
  }>;
}>;

export type V12CompletionWritebackAcceptanceProof = Readonly<{
  schema_version: 1;
  case_id: typeof CASE_ID;
  nonce_sha256: string;
  seed_plan_revision: number;
  request: Readonly<{
    request_id: string;
    request_sha256: string;
  }>;
  receipt: Readonly<{
    receipt_id: string;
    receipt_sha256: string;
  }>;
  action: V12CompletionWritebackActionProof;
}>;

type Seed = Readonly<{
  planId: string;
  planDayId: string;
  sessionId: string;
  customExerciseId: string;
}>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(",")}}`;
}

async function digest(sha256: Hash, value: unknown): Promise<string> {
  const result = await sha256(stableJson(value));
  if (!HASH.test(result)) throw new Error("v12_completion_writeback_hash_invalid");
  return result;
}

function activatedAtMs(nonce: string): number {
  return SEED_AT_MS + Number.parseInt(nonce.slice(0, 8), 16);
}

function identities(nonce: string) {
  const prefix = `v12:completion-writeback:${nonce}`;
  return Object.freeze({
    activationRequestId: `${prefix}:starter`,
    customExerciseId: `${prefix}:exercise`,
    customExerciseRequestId: `${prefix}:exercise-seed`,
    editRequestId: `${prefix}:exercise-edit`,
    sessionExerciseId: `${prefix}:session-exercise`,
    sessionSetId: `${prefix}:session-set`,
  });
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function acceptedSchedule(template: AcceptedStarterTemplate) {
  if (template.scheduleSuggestion.mode === "rotation") {
    return Object.freeze({
      startLocalDate: "2030-03-04",
      timeZone: "UTC",
      mode: "rotation" as const,
      bindings: template.scheduleSuggestion.rotation.map(
        (planDaySourceId, ordinal) => ({ planDaySourceId, ordinal }),
      ),
    });
  }
  const suggestion = template.scheduleSuggestion;
  return Object.freeze({
    startLocalDate: "2030-03-04",
    timeZone: "UTC",
    mode: "weekday" as const,
    bindings: suggestion.cycleWeeks.flatMap((week, weekIndex) =>
      week.map((binding, ordinal) => ({
        planDaySourceId: binding.dayId,
        ordinal: suggestion.cycleWeeks.slice(0, weekIndex)
          .reduce((count, value) => count + value.length, 0) + ordinal,
        weekIndex,
        weekday: binding.weekday,
      }))
    ),
  });
}

async function seedCompletionWritebackGraph(input: Readonly<{
  kernel: SqliteKernel;
  nonce: string;
  sha256: Hash;
}>): Promise<Seed> {
  const ids = identities(input.nonce);
  const activationTime = activatedAtMs(input.nonce);
  await createContentRepository(input.kernel).importAcceptedCatalog({
    catalog: await parseAcceptedPhase2Catalog(input.sha256),
  });
  const starterPackBytes = prettyJson(starterPlansAsset);
  const acceptanceBytes = prettyJson(starterPlansAcceptanceAsset);
  const pack = await parseAcceptedStarterPlanPack({
    starterPackBytes,
    acceptanceBytes,
    sha256: input.sha256,
  });
  const template = pack.templates.find(({ id }) => id === "full-body-foundation");
  if (template === undefined) {
    throw new Error("v12_completion_writeback_starter_template_missing");
  }
  const scheduleInput = acceptedSchedule(template);
  const plans = createPlansWorkoutRepository(input.kernel);
  let [activationReceipt] = await input.kernel.queryAll<Readonly<{
    result_plan_id: string;
  }>>(
    `SELECT result_plan_id FROM starter_plan_activation_requests
     WHERE request_id = ?`,
    [ids.activationRequestId],
  );
  if (activationReceipt === undefined) {
    const activation = await activateStarterPlan({
      kind: "accepted",
      starterPackBytes,
      acceptanceBytes,
      sha256: input.sha256,
      repository: createStarterPlanRepository(input.kernel),
      requestId: ids.activationRequestId,
      activatedAtMs: activationTime,
      expectedActiveScheduleRevision: null,
      confirmationToken: createStarterPlanActivationConfirmationToken({
        assetSha256: pack.assetSha256,
        templateId: template.id,
        templateRevision: template.revision,
        ...scheduleInput,
        bindings: scheduleInput.bindings as never,
        copyChoice: null,
      }),
      templateId: template.id,
      templateRevision: template.revision,
      ...scheduleInput,
      bindings: scheduleInput.bindings as never,
      copyChoice: null,
    });
    activationReceipt = { result_plan_id: activation.plan.id };
  }
  const planId = activationReceipt.result_plan_id;
  const planDayId = (await input.kernel.queryAll<Readonly<{ id: string }>>(
    "SELECT id FROM plan_days WHERE plan_id = ? AND ordinal = 0",
    [planId],
  ))[0]?.id;
  if (planDayId === undefined) {
    throw new Error("v12_completion_writeback_plan_day_missing");
  }

  const startedAtMs = activationTime + 1_000;
  let [session] = await input.kernel.queryAll<Readonly<{
    id: string;
    status: string;
  }>>(
    `SELECT id, status FROM workout_sessions
     WHERE plan_id = ? AND plan_day_id = ? AND source = 'scheduled_day'
       AND started_at_ms = ?`,
    [planId, planDayId, startedAtMs],
  );
  if (session === undefined) {
    const started = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId,
        planDayId,
        localDate: "2030-03-04",
        timezone: "UTC",
        startedAtMs,
        commandIdentity: `${CASE_ID}:${input.nonce}`,
      },
    });
    session = { id: started.id, status: started.status };
  }

  const [customExercise] = await input.kernel.queryAll<Readonly<{ id: string }>>(
    "SELECT id FROM exercises WHERE id = ? AND origin = 'custom'",
    [ids.customExerciseId],
  );
  if (customExercise === undefined) {
    await createCustomExercise({
      repository: createCustomExerciseRepository(input.kernel),
      invalidate: async () => undefined,
      input: {
        requestId: ids.customExerciseRequestId,
        exerciseId: ids.customExerciseId,
        name: "V12 completion acceptance exercise",
        aliases: ["V12 completion acceptance"],
        exerciseType: "strength",
        movementClass: "compound",
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: ["glutes"],
        equipment: ["barbell"],
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        defaultRestSeconds: 60,
        progression: { kind: "manual_hold", version: 1 },
        createdAtMs: activationTime + 2_000,
      },
    });
  }

  if (session.status === "in_progress") {
    const workout = createWorkoutRepository(input.kernel);
    const [editReceipt] = await input.kernel.queryAll<Readonly<{
      request_id: string;
    }>>(
      `SELECT request_id FROM workout_session_exercise_edit_receipts
       WHERE request_id = ?`,
      [ids.editRequestId],
    );
    if (editReceipt === undefined) {
      const active = await workout.getActiveWorkout(session.id);
      const editIdentity = Object.freeze({
        requestId: ids.editRequestId,
        sessionId: session.id,
        customExerciseId: ids.customExerciseId,
        sessionExerciseId: ids.sessionExerciseId,
        sessionSetId: ids.sessionSetId,
        expectedSessionRevision: active.revision,
      });
      await addExercise({
        repository: workout,
        input: {
          requestId: ids.editRequestId,
          requestSha256: await digest(input.sha256, editIdentity),
          sessionId: session.id,
          expectedSessionRevision: active.revision,
          occurredAtMs: activationTime + 3_000,
          libraryExerciseId: ids.customExerciseId,
          sessionExerciseId: ids.sessionExerciseId,
          setId: ids.sessionSetId,
        },
      });
    }

    await input.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_sets SET status = 'skipped', revision = revision + 1
         WHERE session_exercise_id IN (
           SELECT id FROM session_exercises WHERE session_id = ?
         ) AND status IN ('planned', 'draft')`,
        [session.id],
      );
      await transaction.execute(
        `UPDATE session_exercises SET status = 'skipped', revision = revision + 1
         WHERE session_id = ? AND status IN ('planned', 'active')`,
        [session.id],
      );
    });
    const beforeFinish = await workout.getActiveWorkout(session.id);
    await finishCompleted({
      repository: createWorkoutOutcomeRepository(input.kernel),
      input: {
        sessionId: session.id,
        expectedSessionRevision: beforeFinish.revision,
        endedAtMs: activationTime + 4_000,
      },
    });
  }

  const [completed] = await input.kernel.queryAll<Readonly<{
    source: string;
    status: string;
    modified_from_plan: number;
  }>>(
    `SELECT source, status, modified_from_plan FROM workout_sessions
     WHERE id = ?`,
    [session.id],
  );
  const [schedule] = await input.kernel.queryAll<Readonly<{
    lifecycle: string;
  }>>(
    `SELECT lifecycle FROM owned_plan_schedules WHERE plan_id = ?`,
    [planId],
  );
  if (completed?.source !== "scheduled_day") {
    throw new Error("v12_completion_writeback_seed_source_invalid");
  }
  if (completed.status !== "completed") {
    throw new Error("v12_completion_writeback_seed_completion_invalid");
  }
  if (completed.modified_from_plan !== 1) {
    throw new Error("v12_completion_writeback_seed_edit_invalid");
  }
  if (schedule?.lifecycle !== "active") {
    throw new Error("v12_completion_writeback_seed_schedule_invalid");
  }
  return Object.freeze({
    planId,
    planDayId,
    sessionId: session.id,
    customExerciseId: ids.customExerciseId,
  });
}

async function readPlanRevision(
  kernel: SqliteKernel,
  planId: string,
): Promise<number> {
  const [plan] = await kernel.queryAll<Readonly<{ revision: number }>>(
    "SELECT revision FROM plans WHERE id = ?",
    [planId],
  );
  if (plan === undefined) throw new Error("v12_completion_writeback_plan_missing");
  return plan.revision;
}

async function readReceipt(
  kernel: SqliteKernel,
  requestId: string,
): Promise<DurableReceipt | undefined> {
  return (await kernel.queryAll<DurableReceipt>(
    `SELECT request_id, request_sha256, expected_revision, result_plan_id,
            result_revision, result_json, committed_at_ms
     FROM owned_plan_mutation_requests WHERE request_id = ?`,
    [requestId],
  ))[0];
}

function parseDurableResult(receipt: DurableReceipt): DurableResult {
  let value: unknown;
  try {
    value = JSON.parse(receipt.result_json);
  } catch {
    throw new Error("v12_completion_writeback_receipt_invalid");
  }
  const result = value as Partial<DurableResult> | null;
  if (result === null || typeof result !== "object"
    || result.outcome !== "committed"
    || result.operation !== "session_exercise_edits"
    || typeof result.planId !== "string"
    || !Number.isSafeInteger(result.planRevision)
    || typeof result.sourceSessionId !== "string"
    || result.currentWorkoutUnaffected !== true) {
    throw new Error("v12_completion_writeback_receipt_invalid");
  }
  return result as DurableResult;
}

async function readDurableSourceState(input: Readonly<{
  kernel: SqliteKernel;
  seed: Seed;
  receipt: DurableReceipt;
}>): Promise<Readonly<{
  occurrenceId: string;
  targetId: string;
  state: Readonly<{ occurrence: SourceOccurrence; target: SourceTarget }>;
}>> {
  const occurrences = await input.kernel.queryAll<SourceOccurrence>(
    `SELECT id, plan_day_id, exercise_id, ordinal, revision
       FROM owned_plan_day_exercises
      WHERE plan_day_id = ? AND exercise_id = ?
        AND id LIKE ?
      ORDER BY ordinal, id`,
    [input.seed.planDayId, input.seed.customExerciseId,
      `session-writeback:${input.receipt.request_sha256}:occurrence:%`],
  );
  const occurrence = occurrences[0];
  if (occurrences.length !== 1 || occurrence === undefined) {
    throw new Error("v12_completion_writeback_source_postcondition_missing");
  }
  const targets = await input.kernel.queryAll<SourceTarget>(
    `SELECT id, plan_day_exercise_id, ordinal, revision
       FROM owned_plan_working_set_targets
      WHERE plan_day_exercise_id = ?
      ORDER BY ordinal, id`,
    [occurrence.id],
  );
  const target = targets[0];
  const occurrenceId = `session-writeback:${input.receipt.request_sha256}:occurrence:${occurrence.ordinal}`;
  const targetId = `session-writeback:${input.receipt.request_sha256}:target:${occurrence.ordinal}:0`;
  if (targets.length !== 1 || target === undefined
    || occurrence.id !== occurrenceId || target.id !== targetId
    || target.plan_day_exercise_id !== occurrence.id || target.ordinal !== 0) {
    throw new Error("v12_completion_writeback_source_postcondition_missing");
  }
  return Object.freeze({
    occurrenceId,
    targetId,
    state: Object.freeze({ occurrence, target }),
  });
}

async function completionWritebackProof(input: Readonly<{
  kernel: SqliteKernel;
  nonce: string;
  sha256: Hash;
  seed: Seed;
  requestId: string;
  receipt: DurableReceipt;
  outcome: "committed" | "already_committed";
}>): Promise<V12CompletionWritebackAcceptanceProof> {
  const result = parseDurableResult(input.receipt);
  if (input.receipt.request_id !== input.requestId
    || !HASH.test(input.receipt.request_sha256)
    || !Number.isSafeInteger(input.receipt.expected_revision)
    || input.receipt.expected_revision < 1
    || input.receipt.result_plan_id !== input.seed.planId
    || input.receipt.result_revision !== input.receipt.expected_revision + 1
    || input.receipt.committed_at_ms !== activatedAtMs(input.nonce) + 5_000
    || result.planId !== input.seed.planId
    || result.planRevision !== input.receipt.result_revision
    || result.sourceSessionId !== input.seed.sessionId) {
    throw new Error("v12_completion_writeback_receipt_invalid");
  }
  const source = await readDurableSourceState({
    kernel: input.kernel,
    seed: input.seed,
    receipt: input.receipt,
  });
  const planRevision = await readPlanRevision(input.kernel, input.seed.planId);
  if (planRevision !== input.receipt.result_revision
    || source.state.occurrence.exercise_id !== input.seed.customExerciseId
    || source.state.occurrence.plan_day_id !== input.seed.planDayId) {
    throw new Error("v12_completion_writeback_source_postcondition_invalid");
  }
  const receiptSha256 = await digest(input.sha256, input.receipt);
  const identitySha256 = await digest(input.sha256, {
    occurrenceId: source.occurrenceId,
    targetId: source.targetId,
  });
  const stateSha256 = await digest(input.sha256, source.state);
  const observedEffects = [
    input.receipt.request_id === input.requestId,
    planRevision === input.receipt.expected_revision + 1,
    source.state.occurrence.exercise_id === input.seed.customExerciseId,
    source.state.target.plan_day_exercise_id === source.state.occurrence.id,
  ].filter(Boolean).length;
  if (input.outcome === "committed" && observedEffects < 1) {
    throw new Error("v12_completion_writeback_committed_effect_missing");
  }
  const authoritativeSource = Object.freeze({
    table: "owned_plan_day_exercises" as const,
    identity_sha256: identitySha256,
    state_sha256: stateSha256,
    plan_revision: planRevision,
  });
  return Object.freeze({
    schema_version: 1 as const,
    case_id: CASE_ID,
    nonce_sha256: await digest(input.sha256, input.nonce),
    seed_plan_revision: input.receipt.expected_revision,
    request: Object.freeze({
      request_id: input.receipt.request_id,
      request_sha256: input.receipt.request_sha256,
    }),
    receipt: Object.freeze({
      receipt_id: input.receipt.request_id,
      receipt_sha256: receiptSha256,
    }),
    action: Object.freeze({
      outcome: input.outcome,
      committed_effects: input.outcome === "committed" ? observedEffects : 0,
      durable_receipt_sha256: receiptSha256,
      authoritative_source: authoritativeSource,
    }),
  });
}

/**
 * Produces a privacy-safe proof for the real completion write-back command.
 * Fixture SQL only terminalizes the nonce-owned workout; the action and replay
 * remain exclusively owned by the app's completed-workout runtime port.
 */
export async function runV12NativeAcceptanceCompletionWriteback(input: Readonly<{
  kernel: SqliteKernel;
  nonce: string;
  sha256: Hash;
}>): Promise<V12CompletionWritebackAcceptanceProof> {
  if (!NONCE.test(input.nonce)) {
    throw new Error("v12_completion_writeback_nonce_invalid");
  }
  const seed = await seedCompletionWritebackGraph(input);
  const requestId = await sessionExerciseWriteBackRequestId({
    sourceSessionId: seed.sessionId,
    sha256: input.sha256,
  });
  const existingReceipt = await readReceipt(input.kernel, requestId);
  if (existingReceipt !== undefined) {
    return completionWritebackProof({
      ...input,
      seed,
      requestId,
      receipt: existingReceipt,
      outcome: "already_committed",
    });
  }
  const runtime = createOwnedPlanRuntimePort(input.kernel, {
    nowMs: () => activatedAtMs(input.nonce) + 5_000,
    randomUUID: () => `completion-writeback-${input.nonce.slice(0, 16)}`,
    sha256: input.sha256,
  });
  const preview = await runtime.previewSessionExerciseEdits({
    sessionId: seed.sessionId,
  });
  if (preview === null || preview.planId !== seed.planId
    || preview.planDayId !== seed.planDayId) {
    throw new Error("v12_completion_writeback_preview_missing");
  }
  const manual = preview.composition.find((entry) =>
    entry.source === "manual" && entry.exerciseId === seed.customExerciseId
  );
  if (manual === undefined || manual.targets.length !== 1) {
    throw new Error("v12_completion_writeback_composition_invalid");
  }
  const seedPlanRevision = await readPlanRevision(input.kernel, seed.planId);
  const preexistingSource = await input.kernel.queryAll<Readonly<{
    id: string;
  }>>(
    `SELECT id FROM owned_plan_day_exercises
     WHERE plan_day_id = ? AND exercise_id = ? AND ordinal = ?`,
    [seed.planDayId, seed.customExerciseId, manual.ordinal],
  );
  if (preexistingSource.length !== 0) {
    throw new Error("v12_completion_writeback_source_preexisted");
  }

  const command = Object.freeze({
    sourceSessionId: preview.sourceSessionId,
    expectedPlanRevision: preview.expectedPlanRevision,
    previewToken: preview.previewToken,
    composition: preview.composition,
  });
  const firstResult = await runtime.applySessionExerciseEdits(command);
  if (firstResult.outcome !== "committed") {
    throw new Error("v12_completion_writeback_first_not_committed");
  }
  const firstReceipt = await readReceipt(input.kernel, requestId);
  if (firstReceipt === undefined || firstReceipt.result_plan_id !== seed.planId
    || firstReceipt.expected_revision !== seedPlanRevision
    || firstReceipt.result_revision !== seedPlanRevision + 1) {
    throw new Error("v12_completion_writeback_receipt_missing");
  }
  return completionWritebackProof({
    ...input,
    seed,
    requestId,
    receipt: firstReceipt,
    outcome: "committed",
  });
}
