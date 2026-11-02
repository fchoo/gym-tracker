import {
  DEFAULT_WORKOUT_PREFERENCE,
  WorkoutPreferenceConflictError,
  type WorkoutPreference,
  type WorkoutPreferenceRepository,
  type WorkoutPreferenceWrite,
  validateWorkoutPreferenceWrite,
  workoutPreferenceKey,
} from "../../../domains/workout/workoutPreferences";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";

type PreferenceRow = Readonly<{
  value_json: string;
  revision: number;
}>;

type StoredPreference = Readonly<{
  version: 1;
  planId: string;
  defaultRestSeconds: number;
  weightIncrementGrams: number;
}>;

function parseStored(planId: string, row: PreferenceRow | undefined): WorkoutPreference {
  if (row === undefined) {
    return Object.freeze({ version: 1, planId, revision: 0, ...DEFAULT_WORKOUT_PREFERENCE });
  }
  let value: StoredPreference;
  try { value = JSON.parse(row.value_json) as StoredPreference; } catch {
    throw new WorkoutPreferenceConflictError("workout_preference_conflict");
  }
  try {
    validateWorkoutPreferenceWrite({
      planId: value.planId,
      expectedRevision: row.revision,
      defaultRestSeconds: value.defaultRestSeconds,
      weightIncrementGrams: value.weightIncrementGrams,
      updatedAtMs: 0,
    });
  } catch {
    throw new WorkoutPreferenceConflictError("workout_preference_conflict");
  }
  if (value.version !== 1 || value.planId !== planId) {
    throw new WorkoutPreferenceConflictError("workout_preference_conflict");
  }
  return Object.freeze({ version: 1, planId, revision: row.revision,
    defaultRestSeconds: value.defaultRestSeconds,
    weightIncrementGrams: value.weightIncrementGrams as WorkoutPreference["weightIncrementGrams"] });
}

async function assertStrengthPlan(
  transaction: Pick<SqliteTransactionExecutor, "queryAll">,
  planId: string,
): Promise<void> {
  const [plan] = await transaction.queryAll<{ id: string }>(
    "SELECT id FROM plans WHERE id = ? AND plan_kind = 'strength'", [planId],
  );
  if (plan === undefined) throw new WorkoutPreferenceConflictError("workout_preference_conflict");
}

export function createWorkoutPreferenceRepository(
  kernel: SqliteKernel,
): WorkoutPreferenceRepository {
  return Object.freeze({
    async read(planId) {
      return kernel.write(async (transaction) => {
        await assertStrengthPlan(transaction, planId);
        const [row] = await transaction.queryAll<PreferenceRow>(
          "SELECT value_json, revision FROM app_settings WHERE key = ?", [workoutPreferenceKey(planId)],
        );
        return parseStored(planId, row);
      });
    },
    async write(raw) {
      const input = validateWorkoutPreferenceWrite(raw);
      return kernel.write(async (transaction) => {
        await assertStrengthPlan(transaction, input.planId);
        const key = workoutPreferenceKey(input.planId);
        const [existing] = await transaction.queryAll<PreferenceRow>(
          "SELECT value_json, revision FROM app_settings WHERE key = ?", [key],
        );
        const value = JSON.stringify({ version: 1, planId: input.planId,
          defaultRestSeconds: input.defaultRestSeconds, weightIncrementGrams: input.weightIncrementGrams });
        if (existing === undefined) {
          if (input.expectedRevision !== 0) throw new WorkoutPreferenceConflictError("workout_preference_conflict");
          await transaction.execute(
            "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
            [key, value, input.updatedAtMs],
          );
        } else {
          const update = await transaction.execute(
            "UPDATE app_settings SET value_version = 1, value_json = ?, revision = revision + 1, updated_at_ms = ? WHERE key = ? AND revision = ?",
            [value, input.updatedAtMs, key, input.expectedRevision],
          );
          if (update.changes !== 1) throw new WorkoutPreferenceConflictError("workout_preference_conflict");
        }
        const [committed] = await transaction.queryAll<PreferenceRow>(
          "SELECT value_json, revision FROM app_settings WHERE key = ?", [key],
        );
        return parseStored(input.planId, committed);
      });
    },
  });
}
