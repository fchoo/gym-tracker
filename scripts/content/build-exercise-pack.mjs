import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const execFile = promisify(execFileCallback);
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const REVIEW_OVERLAY_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.review.json",
);
const PACK_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.json",
);
const FOUNDATION_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/full-body-foundation.v1.json",
);

export const PINNED_SOURCE = Object.freeze({
  namespace: "kinetic-place.exercises-db",
  repository: "https://github.com/kinetic-place/exercises-db.git",
  commit: "1783421f145e546fa168c591a0e4d11cae6f23df",
  files: Object.freeze({
    "en/exercises.json":
      "1a9f8edf72a6780ed2d0404a2792f0848b568a51634d2a03ab1408d4c27210d5",
    "en/muscle_groups.json":
      "b4a7c50798714ef7ccef91f6190d828073e96ed8e61abffe1db9e3500f2fd54e",
    "en/equipment.json":
      "0bb60c40e078ad73210793c11aaed80c2f8dd6a9316b0d67ba724519d84f6ef0",
    LICENSE:
      "497dedffb4292e2b74e250f159ad8d70136564d6ccf13be604642350d34538e0",
  }),
  license: "MIT",
  attribution: "Copyright (c) 2026 Kinetic.place",
});

const SOURCE_FILE_PATHS = Object.keys(PINNED_SOURCE.files);
const UUID_SCHEMA = z.string().uuid();
const SHA256_SCHEMA = z.string().regex(/^[a-f0-9]{64}$/u);
const BOUNDED_TEXT_SCHEMA = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value.trim() === value);
const BOUNDED_IDENTIFIER_SCHEMA = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u);
const POSITIVE_SAFE_INTEGER_SCHEMA = z.number().int().positive().safe();
const REVIEW_STATUS_SCHEMA = z.literal("pending_owner_acceptance");
const EXERCISE_TYPE_SCHEMA = z.enum([
  "strength",
  "olympic_weightlifting",
  "stretching",
  "cardio",
  "plyometrics",
  "strongman",
  "powerlifting",
]);
const MOVEMENT_CLASS_SCHEMA = z.enum(["compound", "isolation"]);
const METRIC_PROFILE_SCHEMA = z.enum([
  "load_reps",
  "bodyweight_reps",
  "added_load_reps",
  "assisted_reps",
  "timed_hold",
  "fixed_distance",
  "fixed_time",
  "intervals",
  "unscored",
]);

const MetricIdentitySchema = z.strictObject({
  profile: METRIC_PROFILE_SCHEMA,
  contractVersion: POSITIVE_SAFE_INTEGER_SCHEMA,
  exerciseMetricGeneration: POSITIVE_SAFE_INTEGER_SCHEMA,
});

const SourceMuscleRelationSchema = z.strictObject({
  id: UUID_SCHEMA,
  slug: BOUNDED_IDENTIFIER_SCHEMA,
  name: BOUNDED_TEXT_SCHEMA,
  type: z.enum(["primary", "secondary"]),
});

const SourceEquipmentRelationSchema = z.strictObject({
  id: UUID_SCHEMA,
  name: BOUNDED_TEXT_SCHEMA,
  type: z.enum(["weight", "resistance"]),
  usageType: z.enum(["single", "double", "multiple"]),
  numItems: z.number().int().positive().safe().nullable(),
});

const SourceExerciseSchema = z.strictObject({
  id: UUID_SCHEMA,
  name: BOUNDED_TEXT_SCHEMA,
  type: z.literal("reps"),
  difficultyLevel: z.enum(["beginner", "intermediate", "expert"]),
  forceType: z.enum(["push", "pull", "static"]),
  mechanics: z.enum(["compound", "isolation"]),
  category: z.enum([
    "strength",
    "olympicWeightlifting",
    "stretching",
    "cardio",
    "plyometrics",
    "strongman",
    "powerlifting",
  ]),
  instructions: z.array(
    z.string().max(2_000).refine((value) => value.trim() === value),
  ).min(1).max(40).refine((instructions) =>
    instructions.some((instruction) => instruction.length > 0)
  ),
  muscleGroups: z.array(SourceMuscleRelationSchema).min(1).max(20),
  equipment: z.array(SourceEquipmentRelationSchema).max(12),
});

const SourceMuscleSchema = z.strictObject({
  id: UUID_SCHEMA,
  slug: BOUNDED_IDENTIFIER_SCHEMA,
  name: BOUNDED_TEXT_SCHEMA,
});

const SourceEquipmentSchema = z.strictObject({
  id: UUID_SCHEMA,
  name: BOUNDED_TEXT_SCHEMA,
  type: z.enum(["weight", "resistance"]),
  usageType: z.enum(["single", "double", "multiple"]),
});

const SourceBundleSchema = z.strictObject({
  commit: z.literal(PINNED_SOURCE.commit),
  fileSha256: z.strictObject({
    "en/exercises.json": z.literal(
      PINNED_SOURCE.files["en/exercises.json"],
    ),
    "en/muscle_groups.json": z.literal(
      PINNED_SOURCE.files["en/muscle_groups.json"],
    ),
    "en/equipment.json": z.literal(
      PINNED_SOURCE.files["en/equipment.json"],
    ),
    LICENSE: z.literal(PINNED_SOURCE.files.LICENSE),
  }),
  exercises: z.array(SourceExerciseSchema).min(1).max(2_000),
  muscleGroups: z.array(SourceMuscleSchema).min(1).max(100),
  equipment: z.array(SourceEquipmentSchema).min(1).max(100),
});

const IncludedReviewEntrySchema = z.strictObject({
  upstreamId: UUID_SCHEMA,
  disposition: z.literal("include_candidate"),
  appId: UUID_SCHEMA,
  canonicalName: BOUNDED_TEXT_SCHEMA,
  aliases: z.array(BOUNDED_TEXT_SCHEMA).max(16),
  exerciseType: EXERCISE_TYPE_SCHEMA,
  movementClass: MOVEMENT_CLASS_SCHEMA,
  primaryMuscles: z.array(BOUNDED_IDENTIFIER_SCHEMA).min(1).max(20),
  secondaryMuscles: z.array(BOUNDED_IDENTIFIER_SCHEMA).max(20),
  equipment: z.array(BOUNDED_IDENTIFIER_SCHEMA).max(12),
  metricIdentity: MetricIdentitySchema,
  reviewStatus: REVIEW_STATUS_SCHEMA,
});

const ExcludedReviewEntrySchema = z.strictObject({
  upstreamId: UUID_SCHEMA,
  disposition: z.literal("exclude_candidate"),
  reasonCode: z.enum([
    "initial_300_candidate_scope",
    "linked_to_legacy_candidate",
    "ambiguous_legacy_near_match",
    "normalized_name_collision",
  ]),
  reviewStatus: REVIEW_STATUS_SCHEMA,
});

const LegacyExerciseSchema = z.strictObject({
  id: UUID_SCHEMA,
  canonicalName: BOUNDED_TEXT_SCHEMA,
  aliases: z.array(BOUNDED_TEXT_SCHEMA).max(16),
  exerciseType: EXERCISE_TYPE_SCHEMA,
  movementClass: MOVEMENT_CLASS_SCHEMA,
  primaryMuscles: z.array(BOUNDED_IDENTIFIER_SCHEMA).min(1).max(20),
  secondaryMuscles: z.array(BOUNDED_IDENTIFIER_SCHEMA).max(20),
  equipment: z.array(BOUNDED_IDENTIFIER_SCHEMA).max(12),
  metricIdentity: MetricIdentitySchema,
  reviewStatus: REVIEW_STATUS_SCHEMA,
});

const LegacyDispositionSchema = z.strictObject({
  legacyId: UUID_SCHEMA,
  legacyName: BOUNDED_TEXT_SCHEMA,
  disposition: z.enum(["link_candidate", "preserve_original"]),
  linkedUpstreamId: UUID_SCHEMA.optional(),
  upstreamCandidates: z.array(UUID_SCHEMA).max(20),
  reasonCode: z.enum([
    "exact_semantic_match_candidate",
    "ambiguous_upstream_near_matches",
    "no_accepted_upstream_link",
  ]),
  reviewStatus: REVIEW_STATUS_SCHEMA,
}).superRefine((value, context) => {
  if (
    value.disposition === "link_candidate"
    && value.linkedUpstreamId === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "linkedUpstreamId is required",
      path: ["linkedUpstreamId"],
    });
  }
  if (
    value.disposition === "preserve_original"
    && value.linkedUpstreamId !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "linkedUpstreamId is not permitted",
      path: ["linkedUpstreamId"],
    });
  }
});

const ReviewOverlaySchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceCommit: z.literal(PINNED_SOURCE.commit),
  reviewStatus: REVIEW_STATUS_SCHEMA,
  entries: z.array(
    z.discriminatedUnion("disposition", [
      IncludedReviewEntrySchema,
      ExcludedReviewEntrySchema,
    ]),
  ).min(1).max(2_000),
  legacyExercises: z.array(LegacyExerciseSchema).max(100),
  legacyIdentityDispositions: z.array(LegacyDispositionSchema).max(100),
});

const ExercisePackRowSchema = z.strictObject({
  id: UUID_SCHEMA,
  canonicalName: BOUNDED_TEXT_SCHEMA,
  aliases: z.array(BOUNDED_TEXT_SCHEMA).max(16),
  exerciseType: EXERCISE_TYPE_SCHEMA,
  movementClass: MOVEMENT_CLASS_SCHEMA,
  primaryMuscles: z.array(BOUNDED_IDENTIFIER_SCHEMA).min(1).max(20),
  secondaryMuscles: z.array(BOUNDED_IDENTIFIER_SCHEMA).max(20),
  equipment: z.array(BOUNDED_IDENTIFIER_SCHEMA).max(12),
  metricIdentity: MetricIdentitySchema,
  availability: z.literal("available_candidate"),
  reviewStatus: REVIEW_STATUS_SCHEMA,
  source: z.strictObject({
    namespace: z.enum([
      "gym-tracker.original",
      PINNED_SOURCE.namespace,
    ]),
    sourceRevision: z.union([
      z.literal("1"),
      z.literal(PINNED_SOURCE.commit),
    ]),
    upstreamId: UUID_SCHEMA.nullable(),
    license: z.enum(["Original", PINNED_SOURCE.license]),
    attribution: z.enum([
      "Original Gym Tracker program",
      PINNED_SOURCE.attribution,
    ]),
    legacyLinkStatus: z.enum([
      "not_applicable",
      "link_candidate",
      "preserve_original",
    ]),
    linkedUpstreamId: UUID_SCHEMA.nullable(),
  }),
});

const ExercisePackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  metadata: z.strictObject({
    namespace: z.literal("gym-tracker.exercise-library"),
    revision: z.literal(1),
    reviewStatus: REVIEW_STATUS_SCHEMA,
    normalizationVersion: z.literal(1),
    metricSchemaVersion: z.literal(1),
    source: z.strictObject({
      namespace: z.literal(PINNED_SOURCE.namespace),
      repository: z.literal(PINNED_SOURCE.repository),
      commit: z.literal(PINNED_SOURCE.commit),
      fileSha256: z.strictObject({
        "en/exercises.json": SHA256_SCHEMA,
        "en/muscle_groups.json": SHA256_SCHEMA,
        "en/equipment.json": SHA256_SCHEMA,
        LICENSE: SHA256_SCHEMA,
      }),
      license: z.literal(PINNED_SOURCE.license),
      attribution: z.literal(PINNED_SOURCE.attribution),
    }),
    counts: z.strictObject({
      visible: z.number().int().nonnegative().safe(),
      upstreamIncluded: z.number().int().nonnegative().safe(),
      upstreamExcluded: z.number().int().nonnegative().safe(),
      legacyPreserved: z.number().int().nonnegative().safe(),
      unresolved: z.literal(0),
    }),
  }),
  exercises: z.array(ExercisePackRowSchema).max(2_100),
});

const LEGACY_IDS = Object.freeze([
  "5f140001-7e35-4a6d-9100-000000000001",
  "5f140001-7e35-4a6d-9100-000000000002",
  "5f140001-7e35-4a6d-9100-000000000003",
  "5f140001-7e35-4a6d-9100-000000000004",
  "5f140001-7e35-4a6d-9100-000000000005",
  "5f140001-7e35-4a6d-9100-000000000006",
  "5f140001-7e35-4a6d-9100-000000000007",
  "5f140001-7e35-4a6d-9100-000000000008",
  "5f140001-7e35-4a6d-9100-000000000009",
  "5f140001-7e35-4a6d-9100-00000000000a",
]);

const LEGACY_CURATION = Object.freeze({
  "Back Squat": {
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "squat-rack"],
    linkCandidate: "605ab3e8-4491-4737-aa22-f06598adadf5",
    upstreamCandidates: [
      "cd608649-3d7f-4bbb-8a71-bafd08db7cb0",
      "605ab3e8-4491-4737-aa22-f06598adadf5",
    ],
  },
  "Bench Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["barbell", "bench"],
    linkCandidate: "d586b5aa-c2f4-4cb5-8038-d10b03c3b763",
    upstreamCandidates: ["d586b5aa-c2f4-4cb5-8038-d10b03c3b763"],
  },
  "Lat Pulldown": {
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["cable"],
    upstreamCandidates: [
      "8e10b953-e3a3-4b00-82ef-cd9c71be64e9",
      "244273ca-007b-4f42-a3cf-c6fa17f3b4e2",
      "3b92f71e-2a8d-4cb1-bbaa-8b07218ffb87",
      "eb499497-bc63-451d-9e3d-4e1ca6bfd6dc",
    ],
  },
  "Romanian Deadlift": {
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower-back"],
    equipment: ["barbell"],
    linkCandidate: "15f4d417-d0fc-4e5d-b274-2f83a89f1c68",
    upstreamCandidates: ["15f4d417-d0fc-4e5d-b274-2f83a89f1c68"],
  },
  Plank: {
    primaryMuscles: ["abdominals"],
    secondaryMuscles: [],
    equipment: ["body-only"],
    linkCandidate: "e415dbf1-eb35-4d84-a126-bf4b4f3bb295",
    upstreamCandidates: ["e415dbf1-eb35-4d84-a126-bf4b4f3bb295"],
  },
  Deadlift: {
    primaryMuscles: ["lower-back", "hamstrings"],
    secondaryMuscles: ["glutes", "quadriceps", "traps"],
    equipment: ["barbell"],
    linkCandidate: "13a0f0b4-8dc3-49fd-8cc8-984ed8864684",
    upstreamCandidates: [
      "13a0f0b4-8dc3-49fd-8cc8-984ed8864684",
      "042ce42d-96e8-4801-8407-9279396cbd18",
    ],
  },
  "Overhead Press": {
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps"],
    equipment: ["barbell"],
    upstreamCandidates: [
      "789b15bb-5770-4eb9-91a4-d416097eb4bf",
      "a876c8d8-7630-4887-9b5f-2384b9a4c7fa",
    ],
  },
  "Seated Cable Row": {
    primaryMuscles: ["middle-back"],
    secondaryMuscles: ["lats", "biceps", "shoulders"],
    equipment: ["cable"],
    linkCandidate: "1069769c-bde1-4d35-957f-070c23350968",
    upstreamCandidates: ["1069769c-bde1-4d35-957f-070c23350968"],
  },
  "Reverse Lunge": {
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell"],
    upstreamCandidates: [
      "2782e2b0-3c8d-4f9f-8a25-649ae6823668",
      "ff896ffe-c2c5-4037-82d1-fe8524d31d0a",
    ],
  },
  "Side Plank": {
    primaryMuscles: ["abdominals"],
    secondaryMuscles: [],
    equipment: ["body-only"],
    upstreamCandidates: ["7942be37-f65d-46a2-9488-1b300c79d88c"],
  },
});

const SUPPORTED_CONTRACTS = new Set([
  "load_reps:1",
  "bodyweight_reps:1",
  "added_load_reps:1",
  "assisted_reps:1",
  "timed_hold:1",
  "timed_hold:2",
  "fixed_distance:1",
  "fixed_time:1",
  "intervals:1",
  "unscored:1",
]);

export class ExercisePackValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = "ExercisePackValidationError";
    this.code = code;
  }
}

function fail(code) {
  throw new ExercisePackValidationError(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}

function sortedUnique(values) {
  return unique(values).sort(compareCodePoints);
}

function compareCodePoints(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizeSearchTerm(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function slugify(value) {
  return normalizeSearchTerm(value).replace(/\s+/gu, "-");
}

function stableAppUuid(upstreamId) {
  const bytes = Buffer.from(
    sha256(`${PINNED_SOURCE.namespace}:${upstreamId}`).slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function parseSourceBundle(input) {
  const result = SourceBundleSchema.safeParse(input);
  if (!result.success) {
    fail("source_bundle_invalid");
  }
  const source = result.data;
  const exerciseIds = source.exercises.map(({ id }) => id);
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    fail("source_identity_conflict");
  }
  const muscleIds = new Set(source.muscleGroups.map(({ id }) => id));
  const equipmentIds = new Set(source.equipment.map(({ id }) => id));
  for (const exercise of source.exercises) {
    if (
      exercise.muscleGroups.some(({ id }) => !muscleIds.has(id))
      || exercise.equipment.some(({ id }) => !equipmentIds.has(id))
    ) {
      fail("source_relation_invalid");
    }
  }
  return source;
}

export function parseReviewOverlay(input) {
  const result = ReviewOverlaySchema.safeParse(input);
  if (!result.success) {
    fail("review_overlay_invalid");
  }
  return result.data;
}

function validateMetricIdentity(metricIdentity) {
  if (
    !SUPPORTED_CONTRACTS.has(
      `${metricIdentity.profile}:${metricIdentity.contractVersion}`,
    )
  ) {
    fail("metric_identity_unsupported");
  }
}

function validateOverlayAgainstSource(source, overlay, requiredLegacyIds) {
  const sourceIds = new Set(source.exercises.map(({ id }) => id));
  const overlayIds = overlay.entries.map(({ upstreamId }) => upstreamId);
  if (
    new Set(overlayIds).size !== overlayIds.length
    || overlayIds.length !== source.exercises.length
    || overlayIds.some((id) => !sourceIds.has(id))
  ) {
    fail("review_source_coverage_invalid");
  }
  const legacyIds = overlay.legacyExercises.map(({ id }) => id);
  const requiredLegacyIdSet = new Set(requiredLegacyIds);
  if (
    new Set(legacyIds).size !== legacyIds.length
    || requiredLegacyIdSet.size !== requiredLegacyIds.length
    || legacyIds.length !== requiredLegacyIds.length
    || legacyIds.some((id) => !requiredLegacyIdSet.has(id))
  ) {
    fail("exercise_identity_conflict");
  }
  const dispositionsByLegacyId = new Map(
    overlay.legacyIdentityDispositions.map((entry) => [
      entry.legacyId,
      entry,
    ]),
  );
  if (
    dispositionsByLegacyId.size !== overlay.legacyExercises.length
    || legacyIds.some((id) => !dispositionsByLegacyId.has(id))
  ) {
    fail("legacy_disposition_invalid");
  }
  for (const disposition of overlay.legacyIdentityDispositions) {
    if (
      !legacyIds.includes(disposition.legacyId)
      || disposition.upstreamCandidates.some((id) => !sourceIds.has(id))
      || (
        disposition.linkedUpstreamId !== undefined
        && !disposition.upstreamCandidates.includes(
          disposition.linkedUpstreamId,
        )
      )
    ) {
      fail("legacy_disposition_invalid");
    }
  }
}

function toUpstreamPackRow(sourceRow, reviewEntry) {
  return {
    id: reviewEntry.appId,
    canonicalName: reviewEntry.canonicalName,
    aliases: [...reviewEntry.aliases],
    exerciseType: reviewEntry.exerciseType,
    movementClass: reviewEntry.movementClass,
    primaryMuscles: [...reviewEntry.primaryMuscles],
    secondaryMuscles: [...reviewEntry.secondaryMuscles],
    equipment: [...reviewEntry.equipment],
    metricIdentity: { ...reviewEntry.metricIdentity },
    availability: "available_candidate",
    reviewStatus: reviewEntry.reviewStatus,
    source: {
      namespace: PINNED_SOURCE.namespace,
      sourceRevision: PINNED_SOURCE.commit,
      upstreamId: sourceRow.id,
      license: PINNED_SOURCE.license,
      attribution: PINNED_SOURCE.attribution,
      legacyLinkStatus: "not_applicable",
      linkedUpstreamId: null,
    },
  };
}

function toLegacyPackRow(legacyExercise, disposition) {
  return {
    id: legacyExercise.id,
    canonicalName: legacyExercise.canonicalName,
    aliases: [...legacyExercise.aliases],
    exerciseType: legacyExercise.exerciseType,
    movementClass: legacyExercise.movementClass,
    primaryMuscles: [...legacyExercise.primaryMuscles],
    secondaryMuscles: [...legacyExercise.secondaryMuscles],
    equipment: [...legacyExercise.equipment],
    metricIdentity: { ...legacyExercise.metricIdentity },
    availability: "available_candidate",
    reviewStatus: legacyExercise.reviewStatus,
    source: {
      namespace: "gym-tracker.original",
      sourceRevision: "1",
      upstreamId: null,
      license: "Original",
      attribution: "Original Gym Tracker program",
      legacyLinkStatus: disposition.disposition,
      linkedUpstreamId: disposition.linkedUpstreamId ?? null,
    },
  };
}

function validateRows(rows) {
  const appIds = rows.map(({ id }) => id);
  if (new Set(appIds).size !== appIds.length) {
    fail("exercise_identity_conflict");
  }
  if (
    rows.some(({ id, source }) =>
      source.upstreamId !== null && id === source.upstreamId
    )
  ) {
    fail("exercise_identity_conflict");
  }
  const searchTerms = new Map();
  for (const row of rows) {
    validateMetricIdentity(row.metricIdentity);
    if (
      new Set(row.primaryMuscles).size !== row.primaryMuscles.length
      || new Set(row.secondaryMuscles).size !== row.secondaryMuscles.length
      || row.primaryMuscles.some((muscle) =>
        row.secondaryMuscles.includes(muscle)
      )
      || new Set(row.equipment).size !== row.equipment.length
    ) {
      fail("exercise_taxonomy_invalid");
    }
    for (const term of [row.canonicalName, ...row.aliases]) {
      const normalized = normalizeSearchTerm(term);
      const existingId = searchTerms.get(normalized);
      if (normalized.length === 0 || existingId !== undefined) {
        fail("exercise_search_term_conflict");
      }
      searchTerms.set(normalized, row.id);
    }
  }
}

export function buildExercisePack(
  sourceInput,
  overlayInput,
  {
    minimumVisibleCount = 300,
    requiredLegacyIds = LEGACY_IDS,
  } = {},
) {
  const source = parseSourceBundle(sourceInput);
  const overlay = parseReviewOverlay(overlayInput);
  validateOverlayAgainstSource(source, overlay, requiredLegacyIds);
  const sourceById = new Map(source.exercises.map((row) => [row.id, row]));
  const dispositionsByLegacyId = new Map(
    overlay.legacyIdentityDispositions.map((entry) => [
      entry.legacyId,
      entry,
    ]),
  );
  const includedEntries = overlay.entries.filter(
    ({ disposition }) => disposition === "include_candidate",
  );
  const rows = [
    ...includedEntries.map((entry) =>
      toUpstreamPackRow(sourceById.get(entry.upstreamId), entry)
    ),
    ...overlay.legacyExercises.map((entry) =>
      toLegacyPackRow(entry, dispositionsByLegacyId.get(entry.id))
    ),
  ].sort((left, right) => compareCodePoints(left.id, right.id));
  if (rows.length < minimumVisibleCount) {
    fail("exercise_count_below_minimum");
  }
  validateRows(rows);
  const pack = {
    schemaVersion: 1,
    metadata: {
      namespace: "gym-tracker.exercise-library",
      revision: 1,
      reviewStatus: "pending_owner_acceptance",
      normalizationVersion: 1,
      metricSchemaVersion: 1,
      source: {
        namespace: PINNED_SOURCE.namespace,
        repository: PINNED_SOURCE.repository,
        commit: PINNED_SOURCE.commit,
        fileSha256: { ...PINNED_SOURCE.files },
        license: PINNED_SOURCE.license,
        attribution: PINNED_SOURCE.attribution,
      },
      counts: {
        visible: rows.length,
        upstreamIncluded: includedEntries.length,
        upstreamExcluded: overlay.entries.length - includedEntries.length,
        legacyPreserved: overlay.legacyExercises.length,
        unresolved: 0,
      },
    },
    exercises: rows,
  };
  return parseExercisePack(pack);
}

export function parseExercisePack(input) {
  const result = ExercisePackSchema.safeParse(input);
  if (!result.success) {
    fail("exercise_pack_invalid");
  }
  const pack = result.data;
  if (
    pack.metadata.counts.visible !== pack.exercises.length
    || pack.metadata.counts.upstreamIncluded
      + pack.metadata.counts.legacyPreserved !== pack.exercises.length
  ) {
    fail("exercise_pack_count_invalid");
  }
  validateRows(pack.exercises);
  return pack;
}

export function serializeDeterministicJson(input) {
  return `${JSON.stringify(input, null, 2)}\n`;
}

async function fetchSourceFile(repositoryDirectory, path) {
  const { stdout } = await execFile(
    "/usr/bin/git",
    ["-C", repositoryDirectory, "show", `FETCH_HEAD:${path}`],
    {
      encoding: path === "LICENSE" ? "utf8" : "buffer",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, "utf8");
}

export async function loadPinnedSource() {
  const directory = await mkdtemp(join(tmpdir(), "exercise-source-"));
  try {
    await execFile("/usr/bin/git", ["-C", directory, "init", "-q"]);
    await execFile(
      "/usr/bin/git",
      [
        "-C",
        directory,
        "remote",
        "add",
        "origin",
        PINNED_SOURCE.repository,
      ],
    );
    await execFile(
      "/usr/bin/git",
      [
        "-C",
        directory,
        "fetch",
        "--quiet",
        "--depth=1",
        "origin",
        PINNED_SOURCE.commit,
      ],
      {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
        },
        timeout: 60_000,
      },
    );
    const { stdout: fetchedCommit } = await execFile(
      "/usr/bin/git",
      ["-C", directory, "rev-parse", "FETCH_HEAD"],
      { encoding: "utf8" },
    );
    if (fetchedCommit.trim() !== PINNED_SOURCE.commit) {
      fail("source_commit_mismatch");
    }
    const fileBytes = Object.fromEntries(
      await Promise.all(
        SOURCE_FILE_PATHS.map(async (path) => [
          path,
          await fetchSourceFile(directory, path),
        ]),
      ),
    );
    for (const path of SOURCE_FILE_PATHS) {
      if (sha256(fileBytes[path]) !== PINNED_SOURCE.files[path]) {
        fail("source_hash_mismatch");
      }
    }
    return parseSourceBundle({
      commit: PINNED_SOURCE.commit,
      fileSha256: { ...PINNED_SOURCE.files },
      exercises: JSON.parse(fileBytes["en/exercises.json"].toString("utf8")),
      muscleGroups: JSON.parse(
        fileBytes["en/muscle_groups.json"].toString("utf8"),
      ),
      equipment: JSON.parse(
        fileBytes["en/equipment.json"].toString("utf8"),
      ),
    });
  } catch (error) {
    if (error instanceof ExercisePackValidationError) {
      throw error;
    }
    fail("source_fetch_failed");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export async function writeExercisePackAtomically(
  outputPath,
  bytes,
  { beforeRename } = {},
) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${createHash("sha256")
      .update(bytes)
      .digest("hex")
      .slice(0, 12)}.tmp`,
  );
  const file = await open(temporaryPath, "wx");
  try {
    await file.writeFile(bytes, "utf8");
    await file.sync();
    await file.close();
    if (beforeRename !== undefined) {
      await beforeRename();
    }
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await file.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function exerciseTypeFromSource(category) {
  return category === "olympicWeightlifting"
    ? "olympic_weightlifting"
    : category;
}

function metricIdentityFromSource(sourceRow) {
  if (sourceRow.category === "cardio") {
    return {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    };
  }
  if (sourceRow.category === "stretching" || sourceRow.forceType === "static") {
    return {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 1,
    };
  }
  if (
    sourceRow.equipment.some(({ name }) => name === "Body Only")
    || sourceRow.category === "plyometrics"
  ) {
    return {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    };
  }
  return {
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  };
}

function createLegacyExercise(foundationExercise) {
  const curation = LEGACY_CURATION[foundationExercise.name];
  if (curation === undefined) {
    fail("legacy_curation_missing");
  }
  return {
    id: foundationExercise.exerciseId,
    canonicalName: foundationExercise.name,
    aliases: [],
    exerciseType: "strength",
    movementClass: "compound",
    primaryMuscles: [...curation.primaryMuscles],
    secondaryMuscles: [...curation.secondaryMuscles],
    equipment: [...curation.equipment],
    metricIdentity: {
      profile: foundationExercise.metricProfile,
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    reviewStatus: "pending_owner_acceptance",
  };
}

function createLegacyDisposition(legacyExercise) {
  const curation = LEGACY_CURATION[legacyExercise.canonicalName];
  if (curation.linkCandidate !== undefined) {
    return {
      legacyId: legacyExercise.id,
      legacyName: legacyExercise.canonicalName,
      disposition: "link_candidate",
      linkedUpstreamId: curation.linkCandidate,
      upstreamCandidates: [...curation.upstreamCandidates],
      reasonCode: "exact_semantic_match_candidate",
      reviewStatus: "pending_owner_acceptance",
    };
  }
  return {
    legacyId: legacyExercise.id,
    legacyName: legacyExercise.canonicalName,
    disposition: "preserve_original",
    upstreamCandidates: [...curation.upstreamCandidates],
    reasonCode: curation.upstreamCandidates.length > 0
      ? "ambiguous_upstream_near_matches"
      : "no_accepted_upstream_link",
    reviewStatus: "pending_owner_acceptance",
  };
}

function createIncludedReviewEntry(sourceRow) {
  const primaryMuscles = sortedUnique(
    sourceRow.muscleGroups
      .filter(({ type }) => type === "primary")
      .map(({ slug }) => slug),
  );
  const secondaryMuscles = sortedUnique(
    sourceRow.muscleGroups
      .filter(({ type }) => type === "secondary")
      .map(({ slug }) => slug)
      .filter((slug) => !primaryMuscles.includes(slug)),
  );
  return {
    upstreamId: sourceRow.id,
    disposition: "include_candidate",
    appId: stableAppUuid(sourceRow.id),
    canonicalName: sourceRow.name,
    aliases: [],
    exerciseType: exerciseTypeFromSource(sourceRow.category),
    movementClass: sourceRow.mechanics,
    primaryMuscles,
    secondaryMuscles,
    equipment: sortedUnique(sourceRow.equipment.map(({ name }) =>
      slugify(name)
    )),
    metricIdentity: metricIdentityFromSource(sourceRow),
    reviewStatus: "pending_owner_acceptance",
  };
}

export async function createCandidateReviewOverlay(source) {
  const foundation = JSON.parse(await readFile(FOUNDATION_PATH, "utf8"));
  const legacyExercises = foundation.days
    .flatMap(({ exercises }) => exercises)
    .map(createLegacyExercise);
  if (
    legacyExercises.length !== LEGACY_IDS.length
    || LEGACY_IDS.some((id) =>
      !legacyExercises.some((exercise) => exercise.id === id)
    )
  ) {
    fail("legacy_identity_missing");
  }
  const legacyIdentityDispositions = legacyExercises
    .map(createLegacyDisposition)
    .sort((left, right) => compareCodePoints(
      left.legacyId,
      right.legacyId,
    ));
  const duplicateCandidateIds = new Set(
    legacyIdentityDispositions.flatMap(({ upstreamCandidates }) =>
      upstreamCandidates
    ),
  );
  const linkedCandidateIds = new Set(
    legacyIdentityDispositions
      .map(({ linkedUpstreamId }) => linkedUpstreamId)
      .filter((id) => id !== undefined),
  );
  const reservedSearchTerms = new Set(
    legacyExercises.flatMap(({ canonicalName, aliases }) =>
      [canonicalName, ...aliases].map(normalizeSearchTerm)
    ),
  );
  const selectedIds = new Set();
  const sourceRows = [...source.exercises].sort((left, right) =>
    compareCodePoints(left.name, right.name) || compareCodePoints(
      left.id,
      right.id,
    )
  );
  for (const sourceRow of sourceRows) {
    if (selectedIds.size >= 300) {
      break;
    }
    const normalizedName = normalizeSearchTerm(sourceRow.name);
    if (
      duplicateCandidateIds.has(sourceRow.id)
      || reservedSearchTerms.has(normalizedName)
    ) {
      continue;
    }
    selectedIds.add(sourceRow.id);
    reservedSearchTerms.add(normalizedName);
  }
  if (selectedIds.size !== 300) {
    fail("candidate_selection_incomplete");
  }
  const entries = source.exercises
    .map((sourceRow) => {
      if (selectedIds.has(sourceRow.id)) {
        return createIncludedReviewEntry(sourceRow);
      }
      let reasonCode = "initial_300_candidate_scope";
      if (linkedCandidateIds.has(sourceRow.id)) {
        reasonCode = "linked_to_legacy_candidate";
      } else if (duplicateCandidateIds.has(sourceRow.id)) {
        reasonCode = "ambiguous_legacy_near_match";
      } else if (
        reservedSearchTerms.has(normalizeSearchTerm(sourceRow.name))
      ) {
        reasonCode = "normalized_name_collision";
      }
      return {
        upstreamId: sourceRow.id,
        disposition: "exclude_candidate",
        reasonCode,
        reviewStatus: "pending_owner_acceptance",
      };
    })
    .sort((left, right) => compareCodePoints(
      left.upstreamId,
      right.upstreamId,
    ));
  return parseReviewOverlay({
    schemaVersion: 1,
    sourceCommit: PINNED_SOURCE.commit,
    reviewStatus: "pending_owner_acceptance",
    entries,
    legacyExercises: legacyExercises.sort((left, right) =>
      compareCodePoints(left.id, right.id)
    ),
    legacyIdentityDispositions,
  });
}

async function refreshCandidateArtifacts() {
  const source = await loadPinnedSource();
  const overlay = await createCandidateReviewOverlay(source);
  const pack = buildExercisePack(source, overlay);
  await writeExercisePackAtomically(
    REVIEW_OVERLAY_PATH,
    serializeDeterministicJson(overlay),
  );
  await writeExercisePackAtomically(
    PACK_PATH,
    serializeDeterministicJson(pack),
  );
  process.stdout.write(`${JSON.stringify({
    status: "generated_pending_owner_acceptance",
    visibleCount: pack.metadata.counts.visible,
    upstreamIncluded: pack.metadata.counts.upstreamIncluded,
    upstreamExcluded: pack.metadata.counts.upstreamExcluded,
    legacyPreserved: pack.metadata.counts.legacyPreserved,
    unresolved: pack.metadata.counts.unresolved,
  })}\n`);
}

if (
  process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length === 3 && process.argv[2] === "--refresh") {
    await refreshCandidateArtifacts();
  } else {
    process.stderr.write(
      "Usage: node scripts/content/build-exercise-pack.mjs --refresh\n",
    );
    process.exitCode = 2;
  }
}
