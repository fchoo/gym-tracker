import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");

export const STARTER_PACK_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/starter-plans.v2.json",
);
export const STARTER_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/starter-plans.v2.manifest.json",
);

const CATALOG_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.json",
);
const CATALOG_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.manifest.json",
);
const CATALOG_ACCEPTANCE_PATH = join(
  REPOSITORY_ROOT,
  "artifacts/review/phase2/exercise-library-acceptance.json",
);
const FOUNDATION_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/full-body-foundation.v1.json",
);
const METRIC_REGISTRY_PATH = join(
  REPOSITORY_ROOT,
  "src/domains/metrics/registry.ts",
);
const RESEARCH_PATH = join(
  REPOSITORY_ROOT,
  ".planning/phases/02-owned-library-and-planning/02-RESEARCH.md",
);
const CONTEXT_PATH = join(
  REPOSITORY_ROOT,
  ".planning/phases/02-owned-library-and-planning/02-CONTEXT.md",
);

export const STARTER_TEMPLATE_ORDER = Object.freeze([
  "full-body-foundation",
  "upper-lower",
  "push-pull-legs",
  "minimal-equipment-full-body",
  "strength-conditioning",
  "gym-body-part-split",
]);

export const REQUIRED_METRIC_PROFILES = Object.freeze([
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

const REVIEW_STATUS = "pending_owner_acceptance";
const AUTHORITY_STATUS = "candidate_not_accepted";
const SHA256_SCHEMA = z.string().regex(/^[a-f0-9]{64}$/u);
const UUID_SCHEMA = z.string().uuid();
const POSITIVE_SAFE_INTEGER_SCHEMA = z.number().int().positive().safe();
const NONNEGATIVE_SAFE_INTEGER_SCHEMA = z.number().int().nonnegative().safe();
const BOUNDED_IDENTIFIER_SCHEMA = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/u);
const BOUNDED_TEXT_SCHEMA = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value);
const METRIC_PROFILE_SCHEMA = z.enum(REQUIRED_METRIC_PROFILES);

const MetricIdentitySchema = z.strictObject({
  profile: METRIC_PROFILE_SCHEMA,
  contractVersion: POSITIVE_SAFE_INTEGER_SCHEMA,
  exerciseMetricGeneration: POSITIVE_SAFE_INTEGER_SCHEMA,
});

const LoadRepsTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("load_reps"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  loadGrams: NONNEGATIVE_SAFE_INTEGER_SCHEMA,
  minReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  maxReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  incrementGrams: POSITIVE_SAFE_INTEGER_SCHEMA,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

const BodyweightRepsTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("bodyweight_reps"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  minReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  maxReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  variationId: BOUNDED_IDENTIFIER_SCHEMA,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

const AddedLoadRepsTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("added_load_reps"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  addedLoadGrams: NONNEGATIVE_SAFE_INTEGER_SCHEMA,
  minReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  maxReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  incrementGrams: POSITIVE_SAFE_INTEGER_SCHEMA,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

const AssistedRepsTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("assisted_reps"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  assistanceGrams: NONNEGATIVE_SAFE_INTEGER_SCHEMA,
  minReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  maxReps: POSITIVE_SAFE_INTEGER_SCHEMA,
  decrementGrams: POSITIVE_SAFE_INTEGER_SCHEMA,
  assistanceEquipmentId: BOUNDED_IDENTIFIER_SCHEMA,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

const TimedHoldV1TargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("timed_hold"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  durationSeconds: POSITIVE_SAFE_INTEGER_SCHEMA,
  perSide: z.boolean(),
});

const TimedHoldV2TargetSchema = z.strictObject({
  version: z.literal(2),
  profile: z.literal("timed_hold"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  durationMs: POSITIVE_SAFE_INTEGER_SCHEMA,
  perSide: z.boolean(),
});

const FixedDistanceTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("fixed_distance"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  plannedDistanceMeters: POSITIVE_SAFE_INTEGER_SCHEMA,
});

const FixedTimeTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("fixed_time"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  plannedDurationMs: POSITIVE_SAFE_INTEGER_SCHEMA,
});

const IntervalsTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("intervals"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  protocolId: BOUNDED_IDENTIFIER_SCHEMA,
  comparatorId: z.literal("rounds_then_work"),
  comparatorVersion: POSITIVE_SAFE_INTEGER_SCHEMA,
  plannedRounds: POSITIVE_SAFE_INTEGER_SCHEMA,
  workIntervalMs: POSITIVE_SAFE_INTEGER_SCHEMA,
  restIntervalMs: NONNEGATIVE_SAFE_INTEGER_SCHEMA,
});

const UnscoredTargetSchema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("unscored"),
  plannedSets: POSITIVE_SAFE_INTEGER_SCHEMA.max(20),
  completionRequired: z.literal(true),
});

const TargetSchema = z.union([
  LoadRepsTargetSchema,
  BodyweightRepsTargetSchema,
  AddedLoadRepsTargetSchema,
  AssistedRepsTargetSchema,
  TimedHoldV1TargetSchema,
  TimedHoldV2TargetSchema,
  FixedDistanceTargetSchema,
  FixedTimeTargetSchema,
  IntervalsTargetSchema,
  UnscoredTargetSchema,
]);

const WarmupSchema = z.strictObject({
  ordinal: POSITIVE_SAFE_INTEGER_SCHEMA,
  loadGrams: NONNEGATIVE_SAFE_INTEGER_SCHEMA,
  reps: POSITIVE_SAFE_INTEGER_SCHEMA,
});

const PolicySchema = z.strictObject({
  kind: z.enum(["automatic", "manual_hold", "plan_authored"]),
  id: BOUNDED_IDENTIFIER_SCHEMA,
  version: POSITIVE_SAFE_INTEGER_SCHEMA,
  decisionRule: BOUNDED_TEXT_SCHEMA,
  reviewStatus: z.literal(REVIEW_STATUS),
});

const SubstitutionDecisionSchema = z.strictObject({
  status: z.literal("no_substitution"),
  substitutions: z.tuple([]),
  rationale: BOUNDED_TEXT_SCHEMA,
  reviewStatus: z.literal(REVIEW_STATUS),
});

const MetricOverrideSchema = z.strictObject({
  fromCatalog: MetricIdentitySchema,
  toPlanOccurrence: MetricIdentitySchema,
  rationale: BOUNDED_TEXT_SCHEMA,
  reviewStatus: z.literal(REVIEW_STATUS),
}).nullable();

const ExerciseInputSchema = z.strictObject({
  id: BOUNDED_IDENTIFIER_SCHEMA,
  ordinal: POSITIVE_SAFE_INTEGER_SCHEMA,
  exerciseId: UUID_SCHEMA,
  catalogName: BOUNDED_TEXT_SCHEMA,
  metricIdentity: MetricIdentitySchema,
  target: TargetSchema,
  warmups: z.array(WarmupSchema).max(10),
  restSeconds: NONNEGATIVE_SAFE_INTEGER_SCHEMA.max(3_600),
  policy: PolicySchema,
  contentRationale: BOUNDED_TEXT_SCHEMA,
  substitutionDecision: SubstitutionDecisionSchema,
});

const ExerciseOutputSchema = ExerciseInputSchema.extend({
  catalogMetricIdentity: MetricIdentitySchema,
  metricOverride: MetricOverrideSchema,
});

const DayInputSchema = z.strictObject({
  id: BOUNDED_IDENTIFIER_SCHEMA,
  ordinal: POSITIVE_SAFE_INTEGER_SCHEMA,
  displayName: BOUNDED_TEXT_SCHEMA,
  exercises: z.array(ExerciseInputSchema).min(1).max(30),
});

const DayOutputSchema = DayInputSchema.extend({
  exercises: z.array(ExerciseOutputSchema).min(1).max(30),
});

const WeekdayBindingSchema = z.strictObject({
  weekday: z.enum([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]),
  dayId: BOUNDED_IDENTIFIER_SCHEMA,
});

const ScheduleSuggestionSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("weekday"),
    cycleWeeks: z.array(
      z.array(WeekdayBindingSchema).min(1).max(7),
    ).min(1).max(8),
  }),
  z.strictObject({
    mode: z.literal("rotation"),
    rotation: z.array(BOUNDED_IDENTIFIER_SCHEMA).min(1).max(14),
  }),
]);

const SourceNoteSchema = z.strictObject({
  id: BOUNDED_IDENTIFIER_SCHEMA,
  text: BOUNDED_TEXT_SCHEMA,
  provenance: z.enum([
    "approved_phase1_fixture",
    "original_gym_tracker_candidate",
  ]),
  reviewStatus: z.literal(REVIEW_STATUS),
});

const TemplateInputSchema = z.strictObject({
  id: BOUNDED_IDENTIFIER_SCHEMA,
  revision: z.literal(2),
  ordinal: POSITIVE_SAFE_INTEGER_SCHEMA.max(6),
  displayName: BOUNDED_TEXT_SCHEMA,
  goal: BOUNDED_TEXT_SCHEMA,
  experience: z.enum(["beginner_returning", "intermediate", "all_levels"]),
  audience: BOUNDED_TEXT_SCHEMA,
  equipment: z.array(BOUNDED_IDENTIFIER_SCHEMA).min(1).max(20),
  estimatedDurationMinutes: POSITIVE_SAFE_INTEGER_SCHEMA.max(240),
  daysPerWeek: POSITIVE_SAFE_INTEGER_SCHEMA.max(7),
  scheduleSuggestion: ScheduleSuggestionSchema,
  progressionSummary: BOUNDED_TEXT_SCHEMA,
  sourceNotes: z.array(SourceNoteSchema).min(1).max(10),
  reviewStatus: z.literal(REVIEW_STATUS),
  authorityStatus: z.literal(AUTHORITY_STATUS),
  days: z.array(DayInputSchema).min(1).max(14),
});

const TemplateOutputSchema = TemplateInputSchema.extend({
  days: z.array(DayOutputSchema).min(1).max(14),
});

const StarterPackSchema = z.strictObject({
  schemaVersion: z.literal(2),
  metadata: z.strictObject({
    namespace: z.literal("gym-tracker.starter-plans"),
    revision: z.literal(2),
    reviewStatus: z.literal(REVIEW_STATUS),
    authorityStatus: z.literal(AUTHORITY_STATUS),
    definitionSha256: SHA256_SCHEMA,
    sources: z.strictObject({
      catalogPath: z.literal("assets/content/exercise-library.v1.json"),
      catalogSha256: SHA256_SCHEMA,
      catalogManifestPath: z.literal(
        "assets/content/exercise-library.v1.manifest.json",
      ),
      catalogManifestSha256: SHA256_SCHEMA,
      catalogAcceptancePath: z.literal(
        "artifacts/review/phase2/exercise-library-acceptance.json",
      ),
      catalogAcceptanceSha256: SHA256_SCHEMA,
      fullBodyFoundationPath: z.literal(
        "assets/content/full-body-foundation.v1.json",
      ),
      fullBodyFoundationSha256: SHA256_SCHEMA,
      metricRegistryPath: z.literal("src/domains/metrics/registry.ts"),
      metricRegistrySha256: SHA256_SCHEMA,
      researchPath: z.literal(
        ".planning/phases/02-owned-library-and-planning/02-RESEARCH.md",
      ),
      researchSha256: SHA256_SCHEMA,
      contextPath: z.literal(
        ".planning/phases/02-owned-library-and-planning/02-CONTEXT.md",
      ),
      contextSha256: SHA256_SCHEMA,
    }),
    counts: z.strictObject({
      templates: z.literal(6),
      days: POSITIVE_SAFE_INTEGER_SCHEMA,
      exercises: POSITIVE_SAFE_INTEGER_SCHEMA,
      profiles: z.literal(9),
      metricOverrides: NONNEGATIVE_SAFE_INTEGER_SCHEMA,
      substitutions: z.literal(0),
      unresolved: z.literal(0),
      inferred: z.literal(0),
    }),
  }),
  templates: z.array(TemplateOutputSchema).length(6),
});

const StarterManifestSchema = z.strictObject({
  schemaVersion: z.literal(2),
  reviewStatus: z.literal(REVIEW_STATUS),
  authorityStatus: z.literal(AUTHORITY_STATUS),
  sources: StarterPackSchema.shape.metadata.shape.sources,
  artifacts: z.strictObject({
    packPath: z.literal("assets/content/starter-plans.v2.json"),
    manifestPath: z.literal(
      "assets/content/starter-plans.v2.manifest.json",
    ),
  }),
  definitionSha256: SHA256_SCHEMA,
  packSha256: SHA256_SCHEMA,
  counts: StarterPackSchema.shape.metadata.shape.counts,
  profileCoverage: z.array(
    z.strictObject({
      profile: METRIC_PROFILE_SCHEMA,
      identities: z.array(
        z.strictObject({
          contractVersion: POSITIVE_SAFE_INTEGER_SCHEMA,
          exerciseMetricGeneration: POSITIVE_SAFE_INTEGER_SCHEMA,
        }),
      ).min(1),
    }),
  ).length(9),
});

export class StarterPlanValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = "StarterPlanValidationError";
    this.code = code;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function byOrdinalThenId(left, right) {
  return left.ordinal - right.ordinal
    || compareCodePoints(left.id, right.id);
}

function metricIdentityKey(identity) {
  return [
    identity.profile,
    identity.contractVersion,
    identity.exerciseMetricGeneration,
  ].join(":");
}

function contractKey(identity) {
  return `${identity.profile}:${identity.contractVersion}`;
}

function equalMetricIdentity(left, right) {
  return metricIdentityKey(left) === metricIdentityKey(right);
}

export function serializeDeterministicJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function noSubstitution(rationale) {
  return {
    status: "no_substitution",
    substitutions: [],
    rationale,
    reviewStatus: REVIEW_STATUS,
  };
}

function automaticLoadPolicy() {
  return {
    kind: "automatic",
    id: "load_reps.double_progression.v1",
    version: 1,
    decisionRule:
      "Increase by the target increment only after all planned working sets "
      + "reach the upper repetition bound with acceptable recorded effort.",
    reviewStatus: REVIEW_STATUS,
  };
}

function manualHoldPolicy(
  profile,
  decisionRule,
  id = `${profile}.manual_hold.v1`,
) {
  return {
    kind: "manual_hold",
    id,
    version: 1,
    decisionRule,
    reviewStatus: REVIEW_STATUS,
  };
}

function planAuthoredPolicy(profile, decisionRule) {
  return {
    kind: "plan_authored",
    id: `${profile}.plan_authored.v1`,
    version: 1,
    decisionRule,
    reviewStatus: REVIEW_STATUS,
  };
}

function sourceNote(id, text, provenance) {
  return {
    id,
    text,
    provenance,
    reviewStatus: REVIEW_STATUS,
  };
}

function occurrence({
  id,
  ordinal,
  exerciseId,
  catalogName,
  metricIdentity,
  target,
  restSeconds,
  policy,
  contentRationale,
  warmups = [],
}) {
  return {
    id,
    ordinal,
    exerciseId,
    catalogName,
    metricIdentity,
    target,
    warmups,
    restSeconds,
    policy,
    contentRationale,
    substitutionDecision: noSubstitution(
      "No exercise substitution is proposed; this occurrence uses the "
      + "named accepted catalog identity directly.",
    ),
  };
}

const IDS = Object.freeze({
  backSquat: "5f140001-7e35-4a6d-9100-000000000001",
  benchPress: "5f140001-7e35-4a6d-9100-000000000002",
  latPulldown: "5f140001-7e35-4a6d-9100-000000000003",
  romanianDeadlift: "5f140001-7e35-4a6d-9100-000000000004",
  plank: "5f140001-7e35-4a6d-9100-000000000005",
  deadlift: "5f140001-7e35-4a6d-9100-000000000006",
  overheadPress: "5f140001-7e35-4a6d-9100-000000000007",
  seatedCableRow: "5f140001-7e35-4a6d-9100-000000000008",
  reverseLunge: "5f140001-7e35-4a6d-9100-000000000009",
  sidePlank: "5f140001-7e35-4a6d-9100-00000000000a",
  bandAssistedPullUp: "790c1dfb-3682-5279-a503-bb03346652d5",
  dumbbellBenchPress: "ec8f11ef-a8ef-537b-bb93-f7755dcd1277",
  dumbbellRow: "d1d30978-5aee-579a-89ab-e0709f24f544",
  dumbbellShoulderPress: "ebb494af-a738-5d33-ba92-4ec91430cdf4",
  dumbbellLunges: "7f4c1357-6a58-5b47-86ac-82949fc24a96",
  dumbbellStepUps: "00fda844-429f-58c8-9c8c-134b730a480b",
  barbellHipThrust: "93a5f590-1625-53a2-bdbc-5d7cc9abfa84",
  frontBarbellSquat: "442020b1-cd5e-5a08-80d7-76416b719618",
  bentOverBarbellRow: "fba8296b-d743-5b04-8103-3560fccb0a8d",
  dumbbellLateralRaise: "15e76d11-1d7b-57f3-ac66-a258621e6245",
  barbellCurl: "a5d202ec-d2ee-552a-b5d9-9eb97493b244",
  chinUp: "b9ece936-be86-5988-b201-0025a9dc228e",
  dip: "495a4b20-62d6-5d5d-9bee-174b678a1f03",
  bodyweightSquat: "0a00fe8a-1cf0-5f2d-babd-02a09a40d129",
  bodyweightWalkingLunge: "ad22eaa8-b379-5ed5-b14b-7bed75aae6bd",
  deadBug: "acd0a998-9d1e-5a71-95f8-5478730b0d75",
  bandPullApart: "f48a98ad-865c-5db2-90a3-5a84e5cd7960",
  bandGoodMorning: "a2433945-d6dd-5dbd-b772-3a721416ce95",
  dumbbellFloorPress: "b9c8647c-7628-5b4e-86e9-a8169eb48c21",
  childsPose: "c36667ec-cb85-5fbf-9e43-57e1dd0d4a88",
  catStretch: "e378aa9a-36ad-5683-b3f4-fec89d444c20",
  stationaryBike: "d05089e7-3102-5117-b6ea-854e5ae4b7f7",
  farmersWalk: "c7f9580e-2c03-5519-8211-8af40458653e",
  battlingRopes: "8b4230e6-4f8e-5409-a4ba-40c80e69e72b",
  barbellInclineBenchPress: "b4ba5e4e-b833-52df-9615-d30543fc445d",
  butterfly: "be67b29f-28fc-5232-beff-125c5aeef30b",
  flatBenchCableFlyes: "707ddf5b-ea64-5407-b3d1-f586054ae5ad",
  barbellShoulderPress: "218e19d4-f4eb-57a7-a292-c5a5562d458e",
  cableLateralRaise: "0ff0e0cd-8bad-5794-9dd3-af2ee070bd98",
  cableRearDeltFly: "20bd0098-0c2e-547a-a904-11afc2a9b022",
  calfMachineShoulderShrug: "4ce1a6ba-0357-533a-93a6-70866f863a9b",
  calfPress: "f1d5b5de-233e-5405-95b4-0e86aeda7f9d",
  dumbbellPreacherCurls: "05129856-244d-5c67-8be9-5943ca3af16d",
  dipMachine: "f81f6653-7aa0-54b0-89da-50c9df2b0726",
  cableRopeOverheadTricepsExtension:
    "5c4a7233-e4ff-5726-80b2-78e5d17f512d",
});

const LOAD_REPS_V1 = Object.freeze({
  profile: "load_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const BODYWEIGHT_REPS_V1 = Object.freeze({
  profile: "bodyweight_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const ADDED_LOAD_REPS_V1 = Object.freeze({
  profile: "added_load_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const ASSISTED_REPS_V1 = Object.freeze({
  profile: "assisted_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const TIMED_HOLD_V1 = Object.freeze({
  profile: "timed_hold",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const TIMED_HOLD_V2 = Object.freeze({
  profile: "timed_hold",
  contractVersion: 2,
  exerciseMetricGeneration: 1,
});
const FIXED_DISTANCE_V1 = Object.freeze({
  profile: "fixed_distance",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const FIXED_TIME_V1 = Object.freeze({
  profile: "fixed_time",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const INTERVALS_V1 = Object.freeze({
  profile: "intervals",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});
const UNSCORED_V1 = Object.freeze({
  profile: "unscored",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
});

function loadTarget(
  loadGrams,
  minReps,
  maxReps,
  incrementGrams,
  perSide = false,
  plannedSets = 3,
) {
  return {
    version: 1,
    profile: "load_reps",
    plannedSets,
    loadGrams,
    minReps,
    maxReps,
    incrementGrams,
    perSide,
  };
}

function bodyweightTarget(
  minReps,
  maxReps,
  variationId,
  perSide = false,
  plannedSets = 3,
) {
  return {
    version: 1,
    profile: "bodyweight_reps",
    plannedSets,
    minReps,
    maxReps,
    variationId,
    perSide,
  };
}

export function createStarterDefinitions() {
  return [
    {
      id: "full-body-foundation",
      revision: 2,
      ordinal: 1,
      displayName: "Full Body Foundation",
      goal: "General strength, basic hypertrophy, and consistency",
      experience: "beginner_returning",
      audience: "Beginner or returning trainee",
      equipment: [
        "barbell",
        "bench",
        "body-only",
        "cable",
        "dumbbell",
        "squat-rack",
      ],
      estimatedDurationMinutes: 48,
      daysPerWeek: 3,
      scheduleSuggestion: {
        mode: "weekday",
        cycleWeeks: [
          [
            { weekday: "Monday", dayId: "full-body-a" },
            { weekday: "Wednesday", dayId: "full-body-b" },
            { weekday: "Friday", dayId: "full-body-a" },
          ],
          [
            { weekday: "Monday", dayId: "full-body-b" },
            { weekday: "Wednesday", dayId: "full-body-a" },
            { weekday: "Friday", dayId: "full-body-b" },
          ],
        ],
      },
      progressionSummary:
        "Load/reps uses double progression; legacy second-based timed holds "
        + "remain explicit manual Hold decisions.",
      sourceNotes: [
        sourceNote(
          "phase1-exact-values",
          "Revision 2 preserves the exact accepted Phase 1 exercise IDs, "
            + "targets, warm-ups, rests, and policy assignments.",
          "approved_phase1_fixture",
        ),
        sourceNote(
          "original-program",
          "Original Gym Tracker program; not copied from a proprietary plan.",
          "approved_phase1_fixture",
        ),
      ],
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      days: [
        {
          id: "full-body-a",
          ordinal: 1,
          displayName: "Full Body A",
          exercises: [
            occurrence({
              id: "full-body-a-back-squat",
              ordinal: 1,
              exerciseId: IDS.backSquat,
              catalogName: "Back Squat",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(60_000, 6, 8, 2_500),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 40_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 compound movement and values.",
            }),
            occurrence({
              id: "full-body-a-bench-press",
              ordinal: 2,
              exerciseId: IDS.benchPress,
              catalogName: "Bench Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(42_500, 8, 10, 2_500),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 horizontal press and values.",
            }),
            occurrence({
              id: "full-body-a-lat-pulldown",
              ordinal: 3,
              exerciseId: IDS.latPulldown,
              catalogName: "Lat Pulldown",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(45_000, 10, 12, 5_000),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 vertical pull and values.",
            }),
            occurrence({
              id: "full-body-a-romanian-deadlift",
              ordinal: 4,
              exerciseId: IDS.romanianDeadlift,
              catalogName: "Romanian Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(50_000, 8, 10, 5_000),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 hip hinge and values.",
            }),
            occurrence({
              id: "full-body-a-plank",
              ordinal: 5,
              exerciseId: IDS.plank,
              catalogName: "Plank",
              metricIdentity: TIMED_HOLD_V1,
              target: {
                version: 1,
                profile: "timed_hold",
                plannedSets: 3,
                durationSeconds: 45,
                perSide: false,
              },
              restSeconds: 60,
              policy: manualHoldPolicy(
                "timed_hold",
                "Retain the explicit 45-second target until the owner "
                  + "manually changes duration or variation.",
                "timed_hold.v1",
              ),
              contentRationale:
                "Exact accepted Phase 1 hold using legacy seconds contract 1.",
            }),
          ],
        },
        {
          id: "full-body-b",
          ordinal: 2,
          displayName: "Full Body B",
          exercises: [
            occurrence({
              id: "full-body-b-deadlift",
              ordinal: 1,
              exerciseId: IDS.deadlift,
              catalogName: "Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(70_000, 5, 6, 5_000),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 30_000, reps: 5 },
                { ordinal: 2, loadGrams: 50_000, reps: 3 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 compound hinge and values.",
            }),
            occurrence({
              id: "full-body-b-overhead-press",
              ordinal: 2,
              exerciseId: IDS.overheadPress,
              catalogName: "Overhead Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(25_000, 6, 8, 2_500),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 vertical press and values.",
            }),
            occurrence({
              id: "full-body-b-seated-cable-row",
              ordinal: 3,
              exerciseId: IDS.seatedCableRow,
              catalogName: "Seated Cable Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 8, 10, 5_000),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 horizontal pull and values.",
            }),
            occurrence({
              id: "full-body-b-reverse-lunge",
              ordinal: 4,
              exerciseId: IDS.reverseLunge,
              catalogName: "Reverse Lunge",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(20_000, 8, 10, 2_500, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Exact accepted Phase 1 unilateral lower-body movement.",
            }),
            occurrence({
              id: "full-body-b-side-plank",
              ordinal: 5,
              exerciseId: IDS.sidePlank,
              catalogName: "Side Plank",
              metricIdentity: TIMED_HOLD_V1,
              target: {
                version: 1,
                profile: "timed_hold",
                plannedSets: 3,
                durationSeconds: 30,
                perSide: true,
              },
              restSeconds: 60,
              policy: manualHoldPolicy(
                "timed_hold",
                "Retain the explicit 30-second per-side target until the "
                  + "owner manually changes duration or variation.",
                "timed_hold.v1",
              ),
              contentRationale:
                "Exact accepted Phase 1 hold using legacy seconds contract 1.",
            }),
          ],
        },
      ],
    },
    {
      id: "upper-lower",
      revision: 2,
      ordinal: 2,
      displayName: "Upper / Lower",
      goal: "Balanced strength and hypertrophy",
      experience: "intermediate",
      audience: "Intermediate trainee who prefers four training days",
      equipment: [
        "barbell",
        "bench",
        "body-only",
        "cable",
        "dumbbell",
        "machine",
        "resistance-band",
        "squat-rack",
      ],
      estimatedDurationMinutes: 55,
      daysPerWeek: 4,
      scheduleSuggestion: {
        mode: "weekday",
        cycleWeeks: [[
          { weekday: "Monday", dayId: "upper-a" },
          { weekday: "Tuesday", dayId: "lower-a" },
          { weekday: "Thursday", dayId: "upper-b" },
          { weekday: "Friday", dayId: "lower-b" },
        ]],
      },
      progressionSummary:
        "Load/reps uses explicit equipment increments; assisted repetitions "
        + "remain manual Hold until the owner accepts lower assistance.",
      sourceNotes: [
        sourceNote(
          "original-four-day-split",
          "Original four-day Gym Tracker candidate organized as Upper A, "
            + "Lower A, Upper B, and Lower B.",
          "original_gym_tracker_candidate",
        ),
        sourceNote(
          "candidate-values",
          "All targets, rests, and the band-assistance model are explicit "
            + "candidate values requiring owner acceptance.",
          "original_gym_tracker_candidate",
        ),
      ],
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      days: [
        {
          id: "upper-a",
          ordinal: 1,
          displayName: "Upper A",
          exercises: [
            occurrence({
              id: "upper-a-bench-press",
              ordinal: 1,
              exerciseId: IDS.benchPress,
              catalogName: "Bench Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(45_000, 6, 8, 2_500),
              restSeconds: 150,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 35_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary horizontal press candidate for the first upper day.",
            }),
            occurrence({
              id: "upper-a-bent-over-row",
              ordinal: 2,
              exerciseId: IDS.bentOverBarbellRow,
              catalogName: "Bent Over Barbell Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 8, 10, 2_500),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Horizontal pull candidate paired with the primary press.",
            }),
            occurrence({
              id: "upper-a-band-assisted-pull-up",
              ordinal: 3,
              exerciseId: IDS.bandAssistedPullUp,
              catalogName: "Band Assisted Pull-Up",
              metricIdentity: ASSISTED_REPS_V1,
              target: {
                version: 1,
                profile: "assisted_reps",
                plannedSets: 3,
                assistanceGrams: 15_000,
                minReps: 6,
                maxReps: 10,
                decrementGrams: 5_000,
                assistanceEquipmentId: "loop-band-equivalent",
                perSide: false,
              },
              restSeconds: 120,
              policy: manualHoldPolicy(
                "assisted_reps",
                "Hold assistance and repetition range until the owner "
                  + "explicitly accepts the next lower band-equivalent value.",
              ),
              contentRationale:
                "Plan-level assisted-repetition override is necessary because "
                  + "the accepted catalog source classifies this row coarsely.",
            }),
          ],
        },
        {
          id: "lower-a",
          ordinal: 2,
          displayName: "Lower A",
          exercises: [
            occurrence({
              id: "lower-a-back-squat",
              ordinal: 1,
              exerciseId: IDS.backSquat,
              catalogName: "Back Squat",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(60_000, 5, 8, 2_500),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 40_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary squat candidate for the first lower day.",
            }),
            occurrence({
              id: "lower-a-romanian-deadlift",
              ordinal: 2,
              exerciseId: IDS.romanianDeadlift,
              catalogName: "Romanian Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(50_000, 8, 10, 5_000),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Hip-hinge candidate paired with the primary squat.",
            }),
            occurrence({
              id: "lower-a-dumbbell-step-ups",
              ordinal: 3,
              exerciseId: IDS.dumbbellStepUps,
              catalogName: "Dumbbell Step Ups",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(16_000, 8, 10, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Unilateral lower-body candidate with an explicit per-side target.",
            }),
          ],
        },
        {
          id: "upper-b",
          ordinal: 3,
          displayName: "Upper B",
          exercises: [
            occurrence({
              id: "upper-b-dumbbell-shoulder-press",
              ordinal: 1,
              exerciseId: IDS.dumbbellShoulderPress,
              catalogName: "Dumbbell Shoulder Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(20_000, 8, 10, 2_000, true),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary vertical press candidate for the second upper day.",
            }),
            occurrence({
              id: "upper-b-dumbbell-row",
              ordinal: 2,
              exerciseId: IDS.dumbbellRow,
              catalogName: "Dumbbell Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(24_000, 8, 12, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Unilateral horizontal pull candidate for the second upper day.",
            }),
            occurrence({
              id: "upper-b-dumbbell-lateral-raise",
              ordinal: 3,
              exerciseId: IDS.dumbbellLateralRaise,
              catalogName: "Dumbbell Lateral Raise",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(8_000, 12, 15, 1_000, true),
              restSeconds: 60,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Accessory shoulder candidate with shorter explicit rest.",
            }),
          ],
        },
        {
          id: "lower-b",
          ordinal: 4,
          displayName: "Lower B",
          exercises: [
            occurrence({
              id: "lower-b-deadlift",
              ordinal: 1,
              exerciseId: IDS.deadlift,
              catalogName: "Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(75_000, 4, 6, 5_000),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 30_000, reps: 5 },
                { ordinal: 2, loadGrams: 55_000, reps: 3 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary hinge candidate for the second lower day.",
            }),
            occurrence({
              id: "lower-b-front-squat",
              ordinal: 2,
              exerciseId: IDS.frontBarbellSquat,
              catalogName: "Front Barbell Squat",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 6, 8, 2_500),
              restSeconds: 150,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Secondary squat candidate with an independent catalog identity.",
            }),
            occurrence({
              id: "lower-b-barbell-hip-thrust",
              ordinal: 3,
              exerciseId: IDS.barbellHipThrust,
              catalogName: "Barbell Hip Thrust",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(60_000, 8, 12, 5_000),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Hip-extension candidate completing the second lower day.",
            }),
          ],
        },
      ],
    },
    {
      id: "push-pull-legs",
      revision: 2,
      ordinal: 3,
      displayName: "Push / Pull / Legs",
      goal: "Hypertrophy-oriented volume with simple movement grouping",
      experience: "intermediate",
      audience: "Trainee who prefers movement-pattern grouping",
      equipment: [
        "barbell",
        "bench",
        "body-only",
        "cable",
        "dumbbell",
        "machine",
        "squat-rack",
      ],
      estimatedDurationMinutes: 52,
      daysPerWeek: 3,
      scheduleSuggestion: {
        mode: "rotation",
        rotation: ["push", "pull", "legs"],
      },
      progressionSummary:
        "Load/reps uses double progression; bodyweight and added-load rows "
        + "remain manual Hold until the owner accepts a variation or load change.",
      sourceNotes: [
        sourceNote(
          "original-three-day-rotation",
          "Original Gym Tracker candidate grouped into Push, Pull, and Legs "
            + "days and suggested as a repeating rotation.",
          "original_gym_tracker_candidate",
        ),
        sourceNote(
          "candidate-values",
          "All repetition ranges, added-load values, rests, and manual Hold "
            + "rules require owner acceptance.",
          "original_gym_tracker_candidate",
        ),
      ],
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      days: [
        {
          id: "push",
          ordinal: 1,
          displayName: "Push",
          exercises: [
            occurrence({
              id: "push-bench-press",
              ordinal: 1,
              exerciseId: IDS.benchPress,
              catalogName: "Bench Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(42_500, 8, 12, 2_500),
              restSeconds: 120,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary horizontal push candidate.",
            }),
            occurrence({
              id: "push-dumbbell-shoulder-press",
              ordinal: 2,
              exerciseId: IDS.dumbbellShoulderPress,
              catalogName: "Dumbbell Shoulder Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(18_000, 8, 12, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Vertical push candidate with per-side dumbbell load.",
            }),
            occurrence({
              id: "push-added-load-dip",
              ordinal: 3,
              exerciseId: IDS.dip,
              catalogName: "Dip",
              metricIdentity: ADDED_LOAD_REPS_V1,
              target: {
                version: 1,
                profile: "added_load_reps",
                plannedSets: 3,
                addedLoadGrams: 5_000,
                minReps: 6,
                maxReps: 10,
                incrementGrams: 2_500,
                perSide: false,
              },
              restSeconds: 90,
              policy: manualHoldPolicy(
                "added_load_reps",
                "Hold the accepted added load until the owner explicitly "
                  + "accepts an increase after completing the repetition range.",
              ),
              contentRationale:
                "Plan-level added-load override makes external load explicit "
                  + "without changing the accepted bodyweight catalog fact.",
            }),
          ],
        },
        {
          id: "pull",
          ordinal: 2,
          displayName: "Pull",
          exercises: [
            occurrence({
              id: "pull-chin-up",
              ordinal: 1,
              exerciseId: IDS.chinUp,
              catalogName: "Chin-Up",
              metricIdentity: BODYWEIGHT_REPS_V1,
              target: bodyweightTarget(6, 10, "standard-chin-up"),
              restSeconds: 120,
              policy: manualHoldPolicy(
                "bodyweight_reps",
                "Hold this variation and repetition range until the owner "
                  + "explicitly chooses a harder variation or added load.",
              ),
              contentRationale:
                "Bodyweight vertical pull candidate.",
            }),
            occurrence({
              id: "pull-bent-over-row",
              ordinal: 2,
              exerciseId: IDS.bentOverBarbellRow,
              catalogName: "Bent Over Barbell Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 8, 12, 2_500),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Horizontal pull candidate.",
            }),
            occurrence({
              id: "pull-barbell-curl",
              ordinal: 3,
              exerciseId: IDS.barbellCurl,
              catalogName: "Barbell Curl",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(20_000, 10, 15, 2_500),
              restSeconds: 60,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Elbow-flexion accessory candidate.",
            }),
          ],
        },
        {
          id: "legs",
          ordinal: 3,
          displayName: "Legs",
          exercises: [
            occurrence({
              id: "legs-front-squat",
              ordinal: 1,
              exerciseId: IDS.frontBarbellSquat,
              catalogName: "Front Barbell Squat",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(45_000, 6, 10, 2_500),
              restSeconds: 150,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary squat candidate for the legs rotation day.",
            }),
            occurrence({
              id: "legs-bodyweight-walking-lunge",
              ordinal: 2,
              exerciseId: IDS.bodyweightWalkingLunge,
              catalogName: "Bodyweight Walking Lunge",
              metricIdentity: BODYWEIGHT_REPS_V1,
              target: bodyweightTarget(
                10,
                15,
                "standard-walking-lunge",
                true,
              ),
              restSeconds: 90,
              policy: manualHoldPolicy(
                "bodyweight_reps",
                "Hold this variation and repetition range until the owner "
                  + "explicitly chooses a harder variation.",
              ),
              contentRationale:
                "Unilateral bodyweight leg candidate with per-side repetitions.",
            }),
            occurrence({
              id: "legs-barbell-hip-thrust",
              ordinal: 3,
              exerciseId: IDS.barbellHipThrust,
              catalogName: "Barbell Hip Thrust",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(60_000, 8, 12, 5_000),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Hip-extension candidate for the legs rotation day.",
            }),
          ],
        },
      ],
    },
    {
      id: "minimal-equipment-full-body",
      revision: 2,
      ordinal: 4,
      displayName: "Minimal Equipment Full Body",
      goal: "Full-body consistency with limited equipment",
      experience: "all_levels",
      audience: "Home, hotel, or limited-equipment trainee",
      equipment: ["body-only", "dumbbell", "resistance-band"],
      estimatedDurationMinutes: 38,
      daysPerWeek: 3,
      scheduleSuggestion: {
        mode: "weekday",
        cycleWeeks: [[
          { weekday: "Monday", dayId: "minimal-a" },
          { weekday: "Wednesday", dayId: "minimal-b" },
          { weekday: "Friday", dayId: "minimal-c" },
        ]],
      },
      progressionSummary:
        "Dumbbell load/reps uses explicit increments; bodyweight, duration, "
        + "band resistance, and mobility choices remain manual Hold.",
      sourceNotes: [
        sourceNote(
          "original-limited-equipment",
          "Original Gym Tracker candidate limited to bodyweight, adjustable "
            + "dumbbells, and resistance bands.",
          "original_gym_tracker_candidate",
        ),
        sourceNote(
          "candidate-values",
          "All repetitions, millisecond holds, rests, and variation choices "
            + "require owner acceptance.",
          "original_gym_tracker_candidate",
        ),
      ],
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      days: [
        {
          id: "minimal-a",
          ordinal: 1,
          displayName: "Minimal Full Body A",
          exercises: [
            occurrence({
              id: "minimal-a-dumbbell-floor-press",
              ordinal: 1,
              exerciseId: IDS.dumbbellFloorPress,
              catalogName: "Dumbbell Floor Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(20_000, 8, 12, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Dumbbell horizontal press candidate requiring no bench.",
            }),
            occurrence({
              id: "minimal-a-bodyweight-squat",
              ordinal: 2,
              exerciseId: IDS.bodyweightSquat,
              catalogName: "Bodyweight Squat",
              metricIdentity: BODYWEIGHT_REPS_V1,
              target: bodyweightTarget(12, 20, "standard-bodyweight-squat"),
              restSeconds: 60,
              policy: manualHoldPolicy(
                "bodyweight_reps",
                "Hold this variation and range until the owner explicitly "
                  + "chooses a harder variation.",
              ),
              contentRationale:
                "No-equipment squat candidate.",
            }),
            occurrence({
              id: "minimal-a-band-pull-apart",
              ordinal: 3,
              exerciseId: IDS.bandPullApart,
              catalogName: "Band Pull Apart",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(2_000, 12, 20, 1_000),
              restSeconds: 45,
              policy: manualHoldPolicy(
                "load_reps",
                "Band-equivalent grams are an explicit comparison label; "
                  + "hold until the owner accepts another band resistance.",
              ),
              contentRationale:
                "Resistance-band upper-back candidate with explicit equivalent "
                  + "base-unit labeling pending owner review.",
            }),
          ],
        },
        {
          id: "minimal-b",
          ordinal: 2,
          displayName: "Minimal Full Body B",
          exercises: [
            occurrence({
              id: "minimal-b-dumbbell-row",
              ordinal: 1,
              exerciseId: IDS.dumbbellRow,
              catalogName: "Dumbbell Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(22_000, 8, 12, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Unilateral dumbbell pull candidate.",
            }),
            occurrence({
              id: "minimal-b-bodyweight-walking-lunge",
              ordinal: 2,
              exerciseId: IDS.bodyweightWalkingLunge,
              catalogName: "Bodyweight Walking Lunge",
              metricIdentity: BODYWEIGHT_REPS_V1,
              target: bodyweightTarget(
                8,
                12,
                "standard-walking-lunge",
                true,
              ),
              restSeconds: 60,
              policy: manualHoldPolicy(
                "bodyweight_reps",
                "Hold this variation and range until the owner explicitly "
                  + "chooses a harder variation.",
              ),
              contentRationale:
                "No-equipment unilateral leg candidate.",
            }),
            occurrence({
              id: "minimal-b-childs-pose",
              ordinal: 3,
              exerciseId: IDS.childsPose,
              catalogName: "Child's Pose",
              metricIdentity: TIMED_HOLD_V2,
              target: {
                version: 2,
                profile: "timed_hold",
                plannedSets: 1,
                durationMs: 60_000,
                perSide: false,
              },
              restSeconds: 0,
              policy: manualHoldPolicy(
                "timed_hold",
                "Hold the explicit 60000-millisecond duration until the owner "
                  + "manually changes it.",
              ),
              contentRationale:
                "Later timed-hold contract 2 is selected explicitly for "
                  + "millisecond semantics; legacy seconds rows stay unchanged.",
            }),
          ],
        },
        {
          id: "minimal-c",
          ordinal: 3,
          displayName: "Minimal Full Body C",
          exercises: [
            occurrence({
              id: "minimal-c-dumbbell-shoulder-press",
              ordinal: 1,
              exerciseId: IDS.dumbbellShoulderPress,
              catalogName: "Dumbbell Shoulder Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(16_000, 8, 12, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Dumbbell vertical press candidate.",
            }),
            occurrence({
              id: "minimal-c-dead-bug",
              ordinal: 2,
              exerciseId: IDS.deadBug,
              catalogName: "Dead Bug",
              metricIdentity: BODYWEIGHT_REPS_V1,
              target: bodyweightTarget(8, 12, "alternating-dead-bug", true),
              restSeconds: 45,
              policy: manualHoldPolicy(
                "bodyweight_reps",
                "Hold this variation and range until the owner explicitly "
                  + "chooses another variation.",
              ),
              contentRationale:
                "Bodyweight trunk-control candidate with per-side repetitions.",
            }),
            occurrence({
              id: "minimal-c-cat-stretch",
              ordinal: 3,
              exerciseId: IDS.catStretch,
              catalogName: "Cat Stretch",
              metricIdentity: UNSCORED_V1,
              target: {
                version: 1,
                profile: "unscored",
                plannedSets: 1,
                completionRequired: true,
              },
              restSeconds: 0,
              policy: manualHoldPolicy(
                "unscored",
                "Record completion only; no score or automatic progression "
                  + "is produced.",
              ),
              contentRationale:
                "Plan-level unscored override records mobility completion "
                  + "without converting it to repetitions or duration.",
            }),
          ],
        },
      ],
    },
    {
      id: "strength-conditioning",
      revision: 2,
      ordinal: 5,
      displayName: "Strength + Conditioning",
      goal: "Mixed general fitness through resistance and conditioning",
      experience: "intermediate",
      audience: "Trainee seeking two resistance days and one conditioning day",
      equipment: [
        "barbell",
        "bench",
        "cable",
        "dumbbell",
        "machine",
        "open-space",
        "squat-rack",
      ],
      estimatedDurationMinutes: 50,
      daysPerWeek: 3,
      scheduleSuggestion: {
        mode: "weekday",
        cycleWeeks: [[
          { weekday: "Monday", dayId: "strength-a" },
          { weekday: "Wednesday", dayId: "conditioning" },
          { weekday: "Saturday", dayId: "strength-b" },
        ]],
      },
      progressionSummary:
        "Resistance uses double progression; distance, time, and intervals "
        + "change only through explicit plan-authored owner decisions.",
      sourceNotes: [
        sourceNote(
          "original-mixed-fitness",
          "Original Gym Tracker candidate combining two resistance days with "
            + "one mixed conditioning day.",
          "original_gym_tracker_candidate",
        ),
        sourceNote(
          "candidate-protocol",
          "The 200-metre carry, 12-minute cycle, and 8-round rope protocol "
            + "with rounds_then_work comparator require owner acceptance.",
          "original_gym_tracker_candidate",
        ),
      ],
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      days: [
        {
          id: "strength-a",
          ordinal: 1,
          displayName: "Strength A",
          exercises: [
            occurrence({
              id: "strength-a-back-squat",
              ordinal: 1,
              exerciseId: IDS.backSquat,
              catalogName: "Back Squat",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(60_000, 5, 8, 2_500),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 40_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary squat candidate for the first resistance day.",
            }),
            occurrence({
              id: "strength-a-bench-press",
              ordinal: 2,
              exerciseId: IDS.benchPress,
              catalogName: "Bench Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(42_500, 6, 10, 2_500),
              restSeconds: 150,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary press candidate for the first resistance day.",
            }),
            occurrence({
              id: "strength-a-seated-cable-row",
              ordinal: 3,
              exerciseId: IDS.seatedCableRow,
              catalogName: "Seated Cable Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 8, 12, 5_000),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Horizontal pull candidate for the first resistance day.",
            }),
          ],
        },
        {
          id: "conditioning",
          ordinal: 2,
          displayName: "Conditioning",
          exercises: [
            occurrence({
              id: "conditioning-farmers-walk",
              ordinal: 1,
              exerciseId: IDS.farmersWalk,
              catalogName: "Farmer's Walk",
              metricIdentity: FIXED_DISTANCE_V1,
              target: {
                version: 1,
                profile: "fixed_distance",
                plannedSets: 1,
                plannedDistanceMeters: 200,
              },
              restSeconds: 120,
              policy: planAuthoredPolicy(
                "fixed_distance",
                "Keep the 200-metre distance fixed; only an explicit "
                  + "plan-authored owner edit may change the distance.",
              ),
              contentRationale:
                "Plan-level fixed-distance override makes the carry distance "
                  + "the immutable comparison dimension.",
            }),
            occurrence({
              id: "conditioning-stationary-bike",
              ordinal: 2,
              exerciseId: IDS.stationaryBike,
              catalogName: "Bicycling, Stationary",
              metricIdentity: FIXED_TIME_V1,
              target: {
                version: 1,
                profile: "fixed_time",
                plannedSets: 1,
                plannedDurationMs: 720_000,
              },
              restSeconds: 120,
              policy: planAuthoredPolicy(
                "fixed_time",
                "Keep the 720000-millisecond duration fixed; only an explicit "
                  + "plan-authored owner edit may change the duration.",
              ),
              contentRationale:
                "Accepted fixed-time catalog identity with an explicit "
                  + "12-minute comparison duration.",
            }),
            occurrence({
              id: "conditioning-battling-ropes",
              ordinal: 3,
              exerciseId: IDS.battlingRopes,
              catalogName: "Battling Ropes",
              metricIdentity: INTERVALS_V1,
              target: {
                version: 1,
                profile: "intervals",
                plannedSets: 1,
                protocolId: "battling-ropes-30s-30s-8r-v1",
                comparatorId: "rounds_then_work",
                comparatorVersion: 1,
                plannedRounds: 8,
                workIntervalMs: 30_000,
                restIntervalMs: 30_000,
              },
              restSeconds: 120,
              policy: planAuthoredPolicy(
                "intervals",
                "Compare completed rounds first and completed work "
                  + "milliseconds second under this immutable protocol; only "
                  + "an explicit plan-authored owner edit may change it.",
              ),
              contentRationale:
                "Plan-level intervals override binds the exact protocol and "
                  + "literal rounds_then_work comparator.",
            }),
          ],
        },
        {
          id: "strength-b",
          ordinal: 3,
          displayName: "Strength B",
          exercises: [
            occurrence({
              id: "strength-b-deadlift",
              ordinal: 1,
              exerciseId: IDS.deadlift,
              catalogName: "Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(75_000, 4, 6, 5_000),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 30_000, reps: 5 },
                { ordinal: 2, loadGrams: 55_000, reps: 3 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary hinge candidate for the second resistance day.",
            }),
            occurrence({
              id: "strength-b-overhead-press",
              ordinal: 2,
              exerciseId: IDS.overheadPress,
              catalogName: "Overhead Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(25_000, 6, 10, 2_500),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary vertical press candidate for the second resistance day.",
            }),
            occurrence({
              id: "strength-b-dumbbell-step-ups",
              ordinal: 3,
              exerciseId: IDS.dumbbellStepUps,
              catalogName: "Dumbbell Step Ups",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(18_000, 8, 10, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Unilateral lower-body candidate for the second resistance day.",
            }),
          ],
        },
      ],
    },
    {
      id: "gym-body-part-split",
      revision: 2,
      ordinal: 6,
      displayName: "Gym Body-Part Split",
      goal:
        "Hypertrophy-oriented body-part focus with varied weighted gym equipment",
      experience: "intermediate",
      audience:
        "Intermediate trainee who prefers one primary body part per weekday",
      equipment: [
        "barbell",
        "bench",
        "cable",
        "dumbbell",
        "machine",
        "squat-rack",
      ],
      estimatedDurationMinutes: 55,
      daysPerWeek: 5,
      scheduleSuggestion: {
        mode: "weekday",
        cycleWeeks: [[
          { weekday: "Monday", dayId: "body-part-chest" },
          { weekday: "Tuesday", dayId: "body-part-back" },
          { weekday: "Wednesday", dayId: "body-part-shoulders" },
          { weekday: "Thursday", dayId: "body-part-legs" },
          { weekday: "Friday", dayId: "body-part-arms" },
        ]],
      },
      progressionSummary:
        "Every exercise uses automatic load/reps double progression; all "
        + "loads, repetition ranges, rests, increments, and warm-ups are "
        + "original editable candidate defaults requiring owner acceptance.",
      sourceNotes: [
        sourceNote(
          "original-five-day-body-part-split",
          "Original Gym Tracker candidate using one primary body part on each "
            + "weekday and weighted standard-gym exercises throughout.",
          "original_gym_tracker_candidate",
        ),
        sourceNote(
          "editable-candidate-defaults",
          "All loads, sets, repetition ranges, rests, increments, warm-ups, "
            + "and schedule values are editable candidate defaults, not "
            + "coaching claims, and require owner acceptance.",
          "original_gym_tracker_candidate",
        ),
      ],
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      days: [
        {
          id: "body-part-chest",
          ordinal: 1,
          displayName: "Chest",
          exercises: [
            occurrence({
              id: "body-part-chest-bench-press",
              ordinal: 1,
              exerciseId: IDS.benchPress,
              catalogName: "Bench Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 6, 10, 2_500),
              restSeconds: 150,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 30_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary weighted chest compound with conservative editable defaults.",
            }),
            occurrence({
              id: "body-part-chest-barbell-incline-bench-press",
              ordinal: 2,
              exerciseId: IDS.barbellInclineBenchPress,
              catalogName: "Barbell Incline Bench Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(30_000, 6, 10, 2_500),
              restSeconds: 120,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Incline barbell chest compound with conservative editable defaults.",
            }),
            occurrence({
              id: "body-part-chest-butterfly",
              ordinal: 3,
              exerciseId: IDS.butterfly,
              catalogName: "Butterfly",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(25_000, 10, 15, 1_000),
              restSeconds: 75,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Machine chest accessory adds weighted equipment variety.",
            }),
            occurrence({
              id: "body-part-chest-flat-bench-cable-flyes",
              ordinal: 4,
              exerciseId: IDS.flatBenchCableFlyes,
              catalogName: "Flat Bench Cable Flyes",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(10_000, 10, 15, 1_000),
              restSeconds: 75,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Cable chest accessory completes the equipment-varied day.",
            }),
          ],
        },
        {
          id: "body-part-back",
          ordinal: 2,
          displayName: "Back",
          exercises: [
            occurrence({
              id: "body-part-back-lat-pulldown",
              ordinal: 1,
              exerciseId: IDS.latPulldown,
              catalogName: "Lat Pulldown",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(35_000, 6, 10, 2_000),
              restSeconds: 120,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 30_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary vertical back pull with conservative editable defaults.",
            }),
            occurrence({
              id: "body-part-back-bent-over-barbell-row",
              ordinal: 2,
              exerciseId: IDS.bentOverBarbellRow,
              catalogName: "Bent Over Barbell Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(35_000, 6, 10, 2_500),
              restSeconds: 150,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Barbell horizontal back compound adds free-weight loading.",
            }),
            occurrence({
              id: "body-part-back-seated-cable-row",
              ordinal: 3,
              exerciseId: IDS.seatedCableRow,
              catalogName: "Seated Cable Row",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(30_000, 10, 15, 2_000),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Cable horizontal back accessory adds equipment variety.",
            }),
            occurrence({
              id: "body-part-back-deadlift",
              ordinal: 4,
              exerciseId: IDS.deadlift,
              catalogName: "Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(60_000, 6, 10, 2_500),
              restSeconds: 180,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Accepted Deadlift identity retains strong primary-muscle truth "
                + "while keeping the day equipment-heavy.",
            }),
          ],
        },
        {
          id: "body-part-shoulders",
          ordinal: 3,
          displayName: "Shoulders",
          exercises: [
            occurrence({
              id: "body-part-shoulders-barbell-shoulder-press",
              ordinal: 1,
              exerciseId: IDS.barbellShoulderPress,
              catalogName: "Barbell Shoulder Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(20_000, 6, 10, 2_500),
              restSeconds: 150,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary barbell shoulder compound with conservative editable defaults.",
            }),
            occurrence({
              id: "body-part-shoulders-cable-lateral-raise",
              ordinal: 2,
              exerciseId: IDS.cableLateralRaise,
              catalogName: "Cable Lateral Raise",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(5_000, 10, 15, 1_000, true),
              restSeconds: 60,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Per-side cable shoulder accessory uses a small editable increment.",
            }),
            occurrence({
              id: "body-part-shoulders-cable-rear-delt-fly",
              ordinal: 3,
              exerciseId: IDS.cableRearDeltFly,
              catalogName: "Cable Rear Delt Fly",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(10_000, 10, 15, 1_000),
              restSeconds: 75,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Cable rear-delt accessory broadens shoulder emphasis.",
            }),
            occurrence({
              id: "body-part-shoulders-calf-machine-shoulder-shrug",
              ordinal: 4,
              exerciseId: IDS.calfMachineShoulderShrug,
              catalogName: "Calf-Machine Shoulder Shrug",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(30_000, 10, 15, 2_000),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Machine shrug adds weighted trap and equipment variety.",
            }),
          ],
        },
        {
          id: "body-part-legs",
          ordinal: 4,
          displayName: "Legs",
          exercises: [
            occurrence({
              id: "body-part-legs-back-squat",
              ordinal: 1,
              exerciseId: IDS.backSquat,
              catalogName: "Back Squat",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(50_000, 6, 10, 2_500),
              restSeconds: 180,
              warmups: [
                { ordinal: 1, loadGrams: 20_000, reps: 8 },
                { ordinal: 2, loadGrams: 35_000, reps: 5 },
              ],
              policy: automaticLoadPolicy(),
              contentRationale:
                "Primary squat-rack leg compound with conservative editable defaults.",
            }),
            occurrence({
              id: "body-part-legs-romanian-deadlift",
              ordinal: 2,
              exerciseId: IDS.romanianDeadlift,
              catalogName: "Romanian Deadlift",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(40_000, 6, 10, 2_500),
              restSeconds: 150,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Barbell hip-hinge compound complements the primary squat.",
            }),
            occurrence({
              id: "body-part-legs-dumbbell-step-ups",
              ordinal: 3,
              exerciseId: IDS.dumbbellStepUps,
              catalogName: "Dumbbell Step Ups",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(12_000, 10, 15, 2_000, true),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Per-side dumbbell leg accessory adds unilateral loading.",
            }),
            occurrence({
              id: "body-part-legs-calf-press",
              ordinal: 4,
              exerciseId: IDS.calfPress,
              catalogName: "Calf Press",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(30_000, 10, 15, 2_000),
              restSeconds: 75,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Machine calf accessory completes weighted leg coverage.",
            }),
          ],
        },
        {
          id: "body-part-arms",
          ordinal: 5,
          displayName: "Arms",
          exercises: [
            occurrence({
              id: "body-part-arms-barbell-curl",
              ordinal: 1,
              exerciseId: IDS.barbellCurl,
              catalogName: "Barbell Curl",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(15_000, 10, 15, 2_500),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Barbell biceps exercise starts the weighted arm day.",
            }),
            occurrence({
              id: "body-part-arms-dumbbell-preacher-curls",
              ordinal: 2,
              exerciseId: IDS.dumbbellPreacherCurls,
              catalogName: "Dumbbell Preacher Curls",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(7_000, 10, 15, 1_000, true),
              restSeconds: 75,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Per-side dumbbell biceps accessory adds equipment variety.",
            }),
            occurrence({
              id: "body-part-arms-dip-machine",
              ordinal: 3,
              exerciseId: IDS.dipMachine,
              catalogName: "Dip Machine",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(20_000, 10, 15, 2_000),
              restSeconds: 90,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Machine triceps exercise avoids a bodyweight occurrence.",
            }),
            occurrence({
              id: "body-part-arms-cable-rope-overhead-triceps-extension",
              ordinal: 4,
              exerciseId: IDS.cableRopeOverheadTricepsExtension,
              catalogName: "Cable Rope Overhead Triceps Extension",
              metricIdentity: LOAD_REPS_V1,
              target: loadTarget(15_000, 10, 15, 1_000),
              restSeconds: 75,
              policy: automaticLoadPolicy(),
              contentRationale:
                "Cable triceps accessory completes the equipment-varied arm day.",
            }),
          ],
        },
      ],
    },
  ];
}

function parseRegistryContracts(sourceText) {
  const contracts = [];
  const pattern = /\{\s*profile:\s*"([^"]+)",\s*contractVersion:\s*(\d+),[\s\S]*?comparatorId:\s*"([^"]+)",[\s\S]*?\},/gu;
  for (const match of sourceText.matchAll(pattern)) {
    contracts.push({
      profile: match[1],
      contractVersion: Number(match[2]),
      comparatorId: match[3],
    });
  }
  const unique = new Map(
    contracts.map((contract) => [contractKey(contract), contract]),
  );
  if (unique.size !== 10) {
    throw new StarterPlanValidationError("metric_registry_source_invalid");
  }
  return [...unique.values()].sort((left, right) =>
    compareCodePoints(contractKey(left), contractKey(right))
  );
}

export async function loadAcceptedCatalog() {
  const [
    catalogBytes,
    catalogManifestBytes,
    catalogAcceptanceBytes,
    fullBodyFoundationBytes,
    researchBytes,
    contextBytes,
  ] = await Promise.all([
    readFile(CATALOG_PATH, "utf8"),
    readFile(CATALOG_MANIFEST_PATH, "utf8"),
    readFile(CATALOG_ACCEPTANCE_PATH, "utf8"),
    readFile(FOUNDATION_PATH, "utf8"),
    readFile(RESEARCH_PATH, "utf8"),
    readFile(CONTEXT_PATH, "utf8"),
  ]);
  let catalog;
  let acceptance;
  try {
    catalog = JSON.parse(catalogBytes);
    acceptance = JSON.parse(catalogAcceptanceBytes);
  } catch {
    throw new StarterPlanValidationError("accepted_catalog_json_invalid");
  }
  if (
    acceptance.accepted !== true
    || acceptance.packSha256 !== sha256(catalogBytes)
    || acceptance.manifestSha256 !== sha256(catalogManifestBytes)
    || catalog?.metadata?.counts?.unresolved !== 0
    || !Array.isArray(catalog?.exercises)
  ) {
    throw new StarterPlanValidationError("accepted_catalog_hash_invalid");
  }
  return {
    catalog,
    catalogBytes,
    catalogManifestBytes,
    catalogAcceptanceBytes,
    fullBodyFoundationBytes,
    researchBytes,
    contextBytes,
  };
}

export async function loadMetricRegistryContracts() {
  const metricRegistryBytes = await readFile(METRIC_REGISTRY_PATH, "utf8");
  return {
    contracts: parseRegistryContracts(metricRegistryBytes),
    metricRegistryBytes,
  };
}

function assertExactTemplateSet(templates, expectedTemplateIds) {
  const ids = templates.map(({ id }) => id).sort(compareCodePoints);
  const expected = [...expectedTemplateIds].sort(compareCodePoints);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new StarterPlanValidationError("starter_template_set_invalid");
  }
}

function assertContiguousOrdinals(rows) {
  const ordinals = rows.map(({ ordinal }) => ordinal).sort(
    (left, right) => left - right,
  );
  const contiguous = ordinals.every(
    (ordinal, index) => ordinal === index + 1,
  );
  if (!contiguous) {
    throw new StarterPlanValidationError("starter_ordinal_invalid");
  }
}

function assertScheduleReferences(template) {
  const dayIds = new Set(template.days.map(({ id }) => id));
  const scheduledDayIds = template.scheduleSuggestion.mode === "weekday"
    ? template.scheduleSuggestion.cycleWeeks.flat().map(({ dayId }) => dayId)
    : template.scheduleSuggestion.rotation;
  if (scheduledDayIds.some((dayId) => !dayIds.has(dayId))) {
    throw new StarterPlanValidationError("starter_schedule_invalid");
  }
}

function expectedComparator(profile) {
  return {
    load_reps: "load_then_reps",
    bodyweight_reps: "reps",
    added_load_reps: "added_load_then_reps",
    assisted_reps: "assistance_then_reps",
    timed_hold: "duration",
    fixed_distance: "fixed_distance_duration",
    fixed_time: "fixed_time_distance",
    intervals: "plan_authored_intervals",
    unscored: "completion",
  }[profile];
}

function assertRawMetricContracts(templates, contractsByKey) {
  for (const template of templates) {
    if (!Array.isArray(template?.days)) {
      continue;
    }
    for (const day of template.days) {
      if (!Array.isArray(day?.exercises)) {
        continue;
      }
      for (const exercise of day.exercises) {
        const identity = exercise?.metricIdentity;
        const target = exercise?.target;
        if (
          typeof identity?.profile !== "string"
          || !Number.isSafeInteger(identity?.contractVersion)
          || typeof target?.profile !== "string"
          || !Number.isSafeInteger(target?.version)
        ) {
          continue;
        }
        const contract = contractsByKey.get(contractKey(identity));
        if (
          contract === undefined
          || contract.comparatorId !== expectedComparator(identity.profile)
          || target.profile !== identity.profile
          || target.version !== identity.contractVersion
        ) {
          throw new StarterPlanValidationError("starter_metric_invalid");
        }
      }
    }
  }
}

export function buildStarterPack({
  catalog,
  metricContracts,
  templates,
  sourceHashes,
  validation = {},
}) {
  const expectedTemplateIds = validation.expectedTemplateIds
    ?? STARTER_TEMPLATE_ORDER;
  const requiredProfiles = validation.requiredProfiles
    ?? REQUIRED_METRIC_PROFILES;
  if (!Array.isArray(templates)) {
    throw new StarterPlanValidationError("starter_template_invalid");
  }
  assertExactTemplateSet(templates, expectedTemplateIds);
  const contractsByKey = new Map(
    metricContracts.map((contract) => [contractKey(contract), contract]),
  );
  assertRawMetricContracts(templates, contractsByKey);
  let parsedTemplates;
  try {
    parsedTemplates = z.array(TemplateInputSchema).min(1).max(10)
      .parse(templates);
  } catch {
    throw new StarterPlanValidationError("starter_template_invalid");
  }
  assertContiguousOrdinals(parsedTemplates);

  const catalogById = new Map(
    catalog.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const coveredProfiles = new Set();
  let metricOverrides = 0;
  const outputTemplates = parsedTemplates
    .map((template) => {
      assertContiguousOrdinals(template.days);
      assertScheduleReferences(template);
      const days = template.days
        .map((day) => {
          assertContiguousOrdinals(day.exercises);
          const exercises = day.exercises
            .map((exercise) => {
              assertContiguousOrdinals(exercise.warmups);
              const catalogExercise = catalogById.get(exercise.exerciseId);
              if (
                catalogExercise === undefined
                || catalogExercise.canonicalName !== exercise.catalogName
              ) {
                throw new StarterPlanValidationError(
                  "starter_reference_invalid",
                );
              }
              const contract = contractsByKey.get(
                contractKey(exercise.metricIdentity),
              );
              if (
                contract === undefined
                || contract.comparatorId
                  !== expectedComparator(exercise.metricIdentity.profile)
                || exercise.target.profile
                  !== exercise.metricIdentity.profile
                || exercise.target.version
                  !== exercise.metricIdentity.contractVersion
              ) {
                throw new StarterPlanValidationError(
                  "starter_metric_invalid",
                );
              }
              coveredProfiles.add(exercise.metricIdentity.profile);
              const metricOverride = equalMetricIdentity(
                catalogExercise.metricIdentity,
                exercise.metricIdentity,
              )
                ? null
                : {
                  fromCatalog: { ...catalogExercise.metricIdentity },
                  toPlanOccurrence: { ...exercise.metricIdentity },
                  rationale:
                    "This plan occurrence explicitly overrides the accepted "
                    + "catalog metric identity to express the reviewed target "
                    + "semantics without changing catalog source facts.",
                  reviewStatus: REVIEW_STATUS,
                };
              if (metricOverride !== null) {
                metricOverrides += 1;
              }
              return {
                ...exercise,
                warmups: [...exercise.warmups].sort(byOrdinalThenId),
                catalogMetricIdentity: {
                  ...catalogExercise.metricIdentity,
                },
                metricOverride,
              };
            })
            .sort(byOrdinalThenId);
          return {
            ...day,
            exercises,
          };
        })
        .sort(byOrdinalThenId);
      return {
        ...template,
        equipment: [...template.equipment].sort(compareCodePoints),
        days,
      };
    })
    .sort(byOrdinalThenId);

  for (const profile of requiredProfiles) {
    if (!coveredProfiles.has(profile)) {
      throw new StarterPlanValidationError(
        "starter_profile_coverage_invalid",
      );
    }
  }

  const definitionSha256 = sha256(
    serializeDeterministicJson(outputTemplates),
  );
  const sources = sourceHashes ?? {
    catalogPath: "assets/content/exercise-library.v1.json",
    catalogSha256: "0".repeat(64),
    catalogManifestPath:
      "assets/content/exercise-library.v1.manifest.json",
    catalogManifestSha256: "0".repeat(64),
    catalogAcceptancePath:
      "artifacts/review/phase2/exercise-library-acceptance.json",
    catalogAcceptanceSha256: "0".repeat(64),
    fullBodyFoundationPath:
      "assets/content/full-body-foundation.v1.json",
    fullBodyFoundationSha256: "0".repeat(64),
    metricRegistryPath: "src/domains/metrics/registry.ts",
    metricRegistrySha256: "0".repeat(64),
    researchPath:
      ".planning/phases/02-owned-library-and-planning/02-RESEARCH.md",
    researchSha256: "0".repeat(64),
    contextPath:
      ".planning/phases/02-owned-library-and-planning/02-CONTEXT.md",
    contextSha256: "0".repeat(64),
  };
  const counts = {
    templates: outputTemplates.length,
    days: outputTemplates.reduce(
      (sum, template) => sum + template.days.length,
      0,
    ),
    exercises: outputTemplates.reduce(
      (sum, template) => sum + template.days.reduce(
        (daySum, day) => daySum + day.exercises.length,
        0,
      ),
      0,
    ),
    profiles: coveredProfiles.size,
    metricOverrides,
    substitutions: 0,
    unresolved: 0,
    inferred: 0,
  };
  const pack = {
    schemaVersion: 2,
    metadata: {
      namespace: "gym-tracker.starter-plans",
      revision: 2,
      reviewStatus: REVIEW_STATUS,
      authorityStatus: AUTHORITY_STATUS,
      definitionSha256,
      sources,
      counts,
    },
    templates: outputTemplates,
  };
  if (expectedTemplateIds.length === 6) {
    try {
      return StarterPackSchema.parse(pack);
    } catch {
      throw new StarterPlanValidationError("starter_template_invalid");
    }
  }
  return pack;
}

function buildSourceHashes(input) {
  return {
    catalogPath: "assets/content/exercise-library.v1.json",
    catalogSha256: sha256(input.catalogBytes),
    catalogManifestPath:
      "assets/content/exercise-library.v1.manifest.json",
    catalogManifestSha256: sha256(input.catalogManifestBytes),
    catalogAcceptancePath:
      "artifacts/review/phase2/exercise-library-acceptance.json",
    catalogAcceptanceSha256: sha256(input.catalogAcceptanceBytes),
    fullBodyFoundationPath:
      "assets/content/full-body-foundation.v1.json",
    fullBodyFoundationSha256: sha256(input.fullBodyFoundationBytes),
    metricRegistryPath: "src/domains/metrics/registry.ts",
    metricRegistrySha256: sha256(input.metricRegistryBytes),
    researchPath:
      ".planning/phases/02-owned-library-and-planning/02-RESEARCH.md",
    researchSha256: sha256(input.researchBytes),
    contextPath:
      ".planning/phases/02-owned-library-and-planning/02-CONTEXT.md",
    contextSha256: sha256(input.contextBytes),
  };
}

function buildProfileCoverage(pack) {
  const identitiesByProfile = new Map(
    REQUIRED_METRIC_PROFILES.map((profile) => [profile, new Map()]),
  );
  for (const template of pack.templates) {
    for (const day of template.days) {
      for (const exercise of day.exercises) {
        const identity = exercise.metricIdentity;
        identitiesByProfile.get(identity.profile).set(
          metricIdentityKey(identity),
          {
            contractVersion: identity.contractVersion,
            exerciseMetricGeneration: identity.exerciseMetricGeneration,
          },
        );
      }
    }
  }
  return REQUIRED_METRIC_PROFILES.map((profile) => ({
    profile,
    identities: [...identitiesByProfile.get(profile).entries()]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([, identity]) => identity),
  }));
}

export function buildStarterArtifacts(input) {
  const sources = buildSourceHashes(input);
  const pack = buildStarterPack({
    catalog: input.catalog,
    metricContracts: input.contracts,
    templates: input.templates,
    sourceHashes: sources,
  });
  const packBytes = serializeDeterministicJson(pack);
  const manifest = {
    schemaVersion: 2,
    reviewStatus: REVIEW_STATUS,
    authorityStatus: AUTHORITY_STATUS,
    sources,
    artifacts: {
      packPath: "assets/content/starter-plans.v2.json",
      manifestPath: "assets/content/starter-plans.v2.manifest.json",
    },
    definitionSha256: pack.metadata.definitionSha256,
    packSha256: sha256(packBytes),
    counts: { ...pack.metadata.counts },
    profileCoverage: buildProfileCoverage(pack),
  };
  let parsedManifest;
  try {
    parsedManifest = StarterManifestSchema.parse(manifest);
  } catch {
    throw new StarterPlanValidationError("starter_manifest_invalid");
  }
  return {
    pack,
    packBytes,
    manifest: parsedManifest,
    manifestBytes: serializeDeterministicJson(parsedManifest),
  };
}

export function parseStarterPack(input) {
  try {
    return StarterPackSchema.parse(input);
  } catch {
    throw new StarterPlanValidationError("starter_pack_invalid");
  }
}

export function parseStarterManifest(input) {
  try {
    return StarterManifestSchema.parse(input);
  } catch {
    throw new StarterPlanValidationError("starter_manifest_invalid");
  }
}

export async function writeStarterFileAtomically(
  outputPath,
  bytes,
  hooks = {},
) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = join(
    dirname(outputPath),
    `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await hooks.beforeRename?.();
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function buildFromDisk() {
  const [acceptedCatalog, metricRegistry] = await Promise.all([
    loadAcceptedCatalog(),
    loadMetricRegistryContracts(),
  ]);
  return buildStarterArtifacts({
    ...acceptedCatalog,
    ...metricRegistry,
    templates: createStarterDefinitions(),
  });
}

async function writeGeneratedArtifacts() {
  const generated = await buildFromDisk();
  await writeStarterFileAtomically(STARTER_PACK_PATH, generated.packBytes);
  await writeStarterFileAtomically(
    STARTER_MANIFEST_PATH,
    generated.manifestBytes,
  );
  console.log(
    `wrote ${generated.pack.metadata.counts.templates} starter templates`,
  );
}

async function checkGeneratedArtifacts() {
  const generated = await buildFromDisk();
  const [packBytes, manifestBytes] = await Promise.all([
    readFile(STARTER_PACK_PATH, "utf8"),
    readFile(STARTER_MANIFEST_PATH, "utf8"),
  ]);
  if (
    packBytes !== generated.packBytes
    || manifestBytes !== generated.manifestBytes
  ) {
    throw new StarterPlanValidationError("starter_output_drift");
  }
  console.log("starter plan generated artifacts are current");
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2];
  if (command === "--write") {
    await writeGeneratedArtifacts();
  } else if (command === "--check") {
    await checkGeneratedArtifacts();
  } else {
    throw new Error(
      "usage: node scripts/content/build-starter-plans.mjs --write|--check",
    );
  }
}
