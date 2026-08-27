import {
  z,
} from "zod";

import {
  METRIC_PROFILES,
  getMetricContract,
} from "../metrics";

const PINNED_SOURCE_COMMIT =
  "1783421f145e546fa168c591a0e4d11cae6f23df" as const;
const PINNED_SOURCE_NAMESPACE = "kinetic-place.exercises-db" as const;
const CATALOG_NAMESPACE = "gym-tracker.exercise-library" as const;
const LEGACY_SOURCE_NAMESPACE = "gym-tracker.original" as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

const Sha256Schema = z.string().regex(SHA256_PATTERN);
const UuidSchema = z.string().uuid();
const PositiveSafeIntegerSchema = z.number().int().positive().safe();
const NonnegativeSafeIntegerSchema = z.number().int().nonnegative().safe();
const BoundedTextSchema = z.string()
  .min(1)
  .max(120)
  .refine((value) => value.trim() === value);
const BoundedIdentifierSchema = z.string()
  .min(1)
  .max(80)
  .regex(IDENTIFIER_PATTERN);
const ReviewStatusSchema = z.literal("pending_owner_acceptance");
const ExerciseTypeSchema = z.enum([
  "strength",
  "olympic_weightlifting",
  "stretching",
  "cardio",
  "plyometrics",
  "strongman",
  "powerlifting",
]);
const MovementClassSchema = z.enum(["compound", "isolation"]);
const MetricIdentitySchema = z.strictObject({
  profile: z.enum(METRIC_PROFILES),
  contractVersion: PositiveSafeIntegerSchema,
  exerciseMetricGeneration: PositiveSafeIntegerSchema,
});

const CatalogExerciseSchema = z.strictObject({
  id: UuidSchema,
  canonicalName: BoundedTextSchema,
  aliases: z.array(BoundedTextSchema).max(16),
  exerciseType: ExerciseTypeSchema,
  movementClass: MovementClassSchema,
  primaryMuscles: z.array(BoundedIdentifierSchema).min(1).max(20),
  secondaryMuscles: z.array(BoundedIdentifierSchema).max(20),
  equipment: z.array(BoundedIdentifierSchema).max(12),
  metricIdentity: MetricIdentitySchema,
  availability: z.literal("available_candidate"),
  reviewStatus: ReviewStatusSchema,
  source: z.strictObject({
    namespace: z.enum([
      LEGACY_SOURCE_NAMESPACE,
      PINNED_SOURCE_NAMESPACE,
    ]),
    sourceRevision: z.union([
      z.literal("1"),
      z.literal(PINNED_SOURCE_COMMIT),
    ]),
    upstreamId: UuidSchema.nullable(),
    license: z.enum(["Original", "MIT"]),
    attribution: z.enum([
      "Original Gym Tracker program",
      "Copyright (c) 2026 Kinetic.place",
    ]),
    legacyLinkStatus: z.enum([
      "not_applicable",
      "link_candidate",
      "preserve_original",
    ]),
    linkedUpstreamId: UuidSchema.nullable(),
  }),
});

const CatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  metadata: z.strictObject({
    namespace: z.literal(CATALOG_NAMESPACE),
    revision: PositiveSafeIntegerSchema,
    reviewStatus: ReviewStatusSchema,
    normalizationVersion: z.literal(1),
    metricSchemaVersion: z.literal(1),
    source: z.strictObject({
      namespace: z.literal(PINNED_SOURCE_NAMESPACE),
      repository: z.literal(
        "https://github.com/kinetic-place/exercises-db.git",
      ),
      commit: z.literal(PINNED_SOURCE_COMMIT),
      fileSha256: z.strictObject({
        "en/exercises.json": Sha256Schema,
        "en/muscle_groups.json": Sha256Schema,
        "en/equipment.json": Sha256Schema,
        LICENSE: Sha256Schema,
      }),
      license: z.literal("MIT"),
      attribution: z.literal("Copyright (c) 2026 Kinetic.place"),
    }),
    counts: z.strictObject({
      visible: NonnegativeSafeIntegerSchema,
      upstreamIncluded: NonnegativeSafeIntegerSchema,
      upstreamExcluded: NonnegativeSafeIntegerSchema,
      legacyPreserved: NonnegativeSafeIntegerSchema,
      unresolved: z.literal(0),
    }),
  }),
  exercises: z.array(CatalogExerciseSchema).min(300).max(2_100),
});

const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  reviewStatus: ReviewStatusSchema,
  source: z.strictObject({
    namespace: z.literal(PINNED_SOURCE_NAMESPACE),
    repository: z.literal(
      "https://github.com/kinetic-place/exercises-db.git",
    ),
    commit: z.literal(PINNED_SOURCE_COMMIT),
    fileSha256: z.strictObject({
      "en/exercises.json": Sha256Schema,
      "en/muscle_groups.json": Sha256Schema,
      "en/equipment.json": Sha256Schema,
      LICENSE: Sha256Schema,
    }),
  }),
  artifacts: z.strictObject({
    overlayPath: z.literal(
      "assets/content/exercise-library.v1.review.json",
    ),
    packPath: z.literal("assets/content/exercise-library.v1.json"),
    licensePath: z.literal(
      "assets/content/third-party/kinetic-place-exercises-db.MIT.txt",
    ),
  }),
  overlaySha256: Sha256Schema,
  packSha256: Sha256Schema,
  licenseSha256: Sha256Schema,
  normalizationVersion: z.literal(1),
  metricSchemaVersion: z.literal(1),
  counts: z.strictObject({
    visible: NonnegativeSafeIntegerSchema,
    upstreamIncluded: NonnegativeSafeIntegerSchema,
    upstreamExcluded: NonnegativeSafeIntegerSchema,
    legacyPreserved: NonnegativeSafeIntegerSchema,
    unresolved: z.literal(0),
  }),
  license: z.literal("MIT"),
  attribution: z.literal("Copyright (c) 2026 Kinetic.place"),
});

const AcceptanceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  accepted: z.literal(true),
  reviewer: z.literal("owner"),
  reviewerResponse: z.literal("approved"),
  reviewedAt: z.string().datetime({ offset: true }),
  sourceCommit: z.literal(PINNED_SOURCE_COMMIT),
  overlaySha256: Sha256Schema,
  packSha256: Sha256Schema,
  manifestSha256: Sha256Schema,
  reviewSha256: Sha256Schema,
  licenseSha256: Sha256Schema,
  counts: z.strictObject({
    visible: NonnegativeSafeIntegerSchema,
    upstreamIncluded: NonnegativeSafeIntegerSchema,
    legacyPreserved: NonnegativeSafeIntegerSchema,
    upstreamExcluded: NonnegativeSafeIntegerSchema,
    linkedLegacyCandidates: NonnegativeSafeIntegerSchema,
    preservedLegacyOriginals: NonnegativeSafeIntegerSchema,
    unresolved: z.literal(0),
  }),
});

export type CatalogExercise = z.infer<typeof CatalogExerciseSchema>;
export type ExerciseCatalog = z.infer<typeof CatalogSchema> & Readonly<{
  acceptance: z.infer<typeof AcceptanceSchema>;
  manifest: z.infer<typeof ManifestSchema>;
}>;

export type CatalogHashPort = (
  value: string,
) => Promise<string>;

export type ParseExerciseCatalogInput = Readonly<{
  catalogBytes: string;
  manifestBytes: string;
  acceptanceBytes: string;
  sha256: CatalogHashPort;
}>;

export type ContentInvalidationScope =
  | Readonly<{ scope: "exercise-library" }>
  | Readonly<{ scope: "exercise-detail"; exerciseId: string }>;

export type ContentUpdateResult = Readonly<{
  outcome: "committed";
  revision: number;
  packSha256: string;
  added: number;
  updated: number;
  newlyUnavailable: number;
  invalidationScopes: readonly ContentInvalidationScope[];
}>;

export type CatalogBoundaryErrorCode =
  | "catalog_hash_mismatch"
  | "catalog_identity_conflict"
  | "catalog_invalid"
  | "catalog_not_accepted"
  | "catalog_relation_invalid"
  | "catalog_version_unsupported";

export class CatalogBoundaryError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-CATALOG01" as const;

  constructor(readonly code: CatalogBoundaryErrorCode) {
    super(code);
    this.name = "CatalogBoundaryError";
  }
}

function fail(code: CatalogBoundaryErrorCode): never {
  throw new CatalogBoundaryError(code);
}

function parseJson(bytes: string): unknown {
  try {
    return JSON.parse(bytes) as unknown;
  } catch {
    return fail("catalog_invalid");
  }
}

function schemaVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  return (input as Record<string, unknown>).schemaVersion;
}

function ensureVersionOne(...inputs: readonly unknown[]): void {
  if (inputs.some((input) => schemaVersion(input) !== 1)) {
    fail("catalog_version_unsupported");
  }
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : 1;
}

export function normalizeExerciseSearchTextV1(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function validateSource(exercise: CatalogExercise): void {
  const source = exercise.source;
  if (source.namespace === LEGACY_SOURCE_NAMESPACE) {
    if (
      source.sourceRevision !== "1"
      || source.upstreamId !== null
      || source.license !== "Original"
      || source.attribution !== "Original Gym Tracker program"
      || source.legacyLinkStatus === "not_applicable"
      || (
        source.legacyLinkStatus === "link_candidate"
        && source.linkedUpstreamId === null
      )
      || (
        source.legacyLinkStatus === "preserve_original"
        && source.linkedUpstreamId !== null
      )
    ) {
      fail("catalog_relation_invalid");
    }
    return;
  }

  if (
    source.sourceRevision !== PINNED_SOURCE_COMMIT
    || source.upstreamId === null
    || source.license !== "MIT"
    || source.attribution !== "Copyright (c) 2026 Kinetic.place"
    || source.legacyLinkStatus !== "not_applicable"
    || source.linkedUpstreamId !== null
    || exercise.id === source.upstreamId
  ) {
    fail("catalog_relation_invalid");
  }
}

function validateExercises(exercises: readonly CatalogExercise[]): void {
  const ids = new Set<string>();
  const sourceIdentities = new Set<string>();
  const searchTerms = new Set<string>();
  let previousId: string | undefined;

  for (const exercise of exercises) {
    if (
      ids.has(exercise.id)
      || (
        previousId !== undefined
        && compareCodePoints(previousId, exercise.id) >= 0
      )
    ) {
      fail("catalog_identity_conflict");
    }
    ids.add(exercise.id);
    previousId = exercise.id;

    try {
      getMetricContract(exercise.metricIdentity);
    } catch {
      fail("catalog_invalid");
    }

    const primaryMuscles = new Set(exercise.primaryMuscles);
    const secondaryMuscles = new Set(exercise.secondaryMuscles);
    if (
      primaryMuscles.size !== exercise.primaryMuscles.length
      || secondaryMuscles.size !== exercise.secondaryMuscles.length
      || exercise.primaryMuscles.some((muscle) =>
        secondaryMuscles.has(muscle)
      )
      || new Set(exercise.equipment).size !== exercise.equipment.length
    ) {
      fail("catalog_relation_invalid");
    }

    validateSource(exercise);
    if (exercise.source.upstreamId !== null) {
      const sourceIdentity = [
        exercise.source.namespace,
        exercise.source.upstreamId,
      ].join(":");
      if (sourceIdentities.has(sourceIdentity)) {
        fail("catalog_identity_conflict");
      }
      sourceIdentities.add(sourceIdentity);
    }

    for (const term of [exercise.canonicalName, ...exercise.aliases]) {
      const normalized = normalizeExerciseSearchTextV1(term);
      if (normalized.length === 0 || searchTerms.has(normalized)) {
        fail("catalog_identity_conflict");
      }
      searchTerms.add(normalized);
    }
  }
}

function equalRecord(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => left[key] === right[key]);
}

function equalStringRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => left[key] === right[key]);
}

function validateCrossFileFacts(
  catalog: z.infer<typeof CatalogSchema>,
  manifest: z.infer<typeof ManifestSchema>,
  acceptance: z.infer<typeof AcceptanceSchema>,
): void {
  const upstreamCount = catalog.exercises.filter(
    ({ source }) => source.namespace === PINNED_SOURCE_NAMESPACE,
  ).length;
  const legacyRows = catalog.exercises.filter(
    ({ source }) => source.namespace === LEGACY_SOURCE_NAMESPACE,
  );
  const catalogCounts = catalog.metadata.counts;
  const baseCounts = {
    visible: catalogCounts.visible,
    upstreamIncluded: catalogCounts.upstreamIncluded,
    upstreamExcluded: catalogCounts.upstreamExcluded,
    legacyPreserved: catalogCounts.legacyPreserved,
    unresolved: catalogCounts.unresolved,
  };
  const acceptedBaseCounts = {
    visible: acceptance.counts.visible,
    upstreamIncluded: acceptance.counts.upstreamIncluded,
    upstreamExcluded: acceptance.counts.upstreamExcluded,
    legacyPreserved: acceptance.counts.legacyPreserved,
    unresolved: acceptance.counts.unresolved,
  };

  if (
    catalogCounts.visible !== catalog.exercises.length
    || catalogCounts.upstreamIncluded !== upstreamCount
    || catalogCounts.legacyPreserved !== legacyRows.length
    || catalogCounts.upstreamIncluded + catalogCounts.legacyPreserved
      !== catalog.exercises.length
    || !equalRecord(baseCounts, manifest.counts)
    || !equalRecord(baseCounts, acceptedBaseCounts)
    || acceptance.counts.linkedLegacyCandidates !== legacyRows.filter(
      ({ source }) => source.legacyLinkStatus === "link_candidate",
    ).length
    || acceptance.counts.preservedLegacyOriginals !== legacyRows.filter(
      ({ source }) => source.legacyLinkStatus === "preserve_original",
    ).length
    || manifest.source.commit !== catalog.metadata.source.commit
    || manifest.source.namespace !== catalog.metadata.source.namespace
    || manifest.source.repository !== catalog.metadata.source.repository
    || !equalStringRecord(
      manifest.source.fileSha256,
      catalog.metadata.source.fileSha256,
    )
    || manifest.license !== catalog.metadata.source.license
    || manifest.attribution !== catalog.metadata.source.attribution
    || manifest.normalizationVersion !== catalog.metadata.normalizationVersion
    || manifest.metricSchemaVersion !== catalog.metadata.metricSchemaVersion
    || manifest.overlaySha256 !== acceptance.overlaySha256
    || manifest.licenseSha256 !== acceptance.licenseSha256
  ) {
    fail("catalog_relation_invalid");
  }
}

export async function parseExerciseCatalog(
  input: ParseExerciseCatalogInput,
): Promise<ExerciseCatalog> {
  const acceptanceInput = parseJson(input.acceptanceBytes);
  if (
    typeof acceptanceInput !== "object"
    || acceptanceInput === null
    || (acceptanceInput as Record<string, unknown>).accepted !== true
    || (acceptanceInput as Record<string, unknown>).reviewerResponse
      !== "approved"
  ) {
    fail("catalog_not_accepted");
  }
  const catalogInput = parseJson(input.catalogBytes);
  const manifestInput = parseJson(input.manifestBytes);
  ensureVersionOne(catalogInput, manifestInput, acceptanceInput);

  const acceptanceResult = AcceptanceSchema.safeParse(acceptanceInput);
  if (!acceptanceResult.success) {
    fail("catalog_not_accepted");
  }
  const acceptance = acceptanceResult.data;
  const [packSha256, manifestSha256] = await Promise.all([
    input.sha256(input.catalogBytes),
    input.sha256(input.manifestBytes),
  ]);
  if (
    packSha256 !== acceptance.packSha256
    || manifestSha256 !== acceptance.manifestSha256
  ) {
    fail("catalog_hash_mismatch");
  }

  const catalogResult = CatalogSchema.safeParse(catalogInput);
  const manifestResult = ManifestSchema.safeParse(manifestInput);
  if (!catalogResult.success || !manifestResult.success) {
    fail("catalog_invalid");
  }
  const catalog = catalogResult.data;
  const manifest = manifestResult.data;
  if (manifest.packSha256 !== packSha256) {
    fail("catalog_hash_mismatch");
  }

  validateExercises(catalog.exercises);
  validateCrossFileFacts(catalog, manifest, acceptance);
  return {
    ...catalog,
    acceptance,
    manifest,
  };
}
