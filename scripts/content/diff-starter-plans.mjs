import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STARTER_MANIFEST_PATH,
  STARTER_PACK_PATH,
  parseStarterManifest,
  parseStarterPack,
  serializeDeterministicJson,
  writeStarterFileAtomically,
} from "./build-starter-plans.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const FOUNDATION_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/full-body-foundation.v1.json",
);
const REVIEW_PATH = join(
  REPOSITORY_ROOT,
  "artifacts/review/phase2/starter-plans-review.json",
);

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

function legacyTarget(exercise) {
  if (exercise.target.kind === "load_reps") {
    return {
      version: 1,
      profile: "load_reps",
      plannedSets: exercise.target.sets,
      loadGrams: exercise.target.loadGrams,
      minReps: exercise.target.minReps,
      maxReps: exercise.target.maxReps,
      incrementGrams: exercise.incrementGrams,
      perSide: exercise.target.perSide,
    };
  }
  return {
    version: 1,
    profile: "timed_hold",
    plannedSets: exercise.target.sets,
    durationSeconds: exercise.target.durationSeconds,
    perSide: exercise.target.perSide,
  };
}

function legacyExerciseDecision(day, exercise, dayOrdinal, exerciseOrdinal) {
  return {
    dayId: day.name.toLowerCase().replaceAll(" ", "-"),
    dayName: day.name,
    dayOrdinal,
    exerciseId: exercise.exerciseId,
    catalogName: exercise.name,
    exerciseOrdinal,
    target: legacyTarget(exercise),
    warmups: exercise.warmups.map((warmup, index) => ({
      ordinal: index + 1,
      ...warmup,
    })),
    restSeconds: exercise.restSeconds,
    policy: {
      id: exercise.policy.id,
      version: exercise.policy.version,
    },
  };
}

function currentExerciseDecision(day, exercise) {
  return {
    dayId: day.id,
    dayName: day.displayName,
    dayOrdinal: day.ordinal,
    exerciseId: exercise.exerciseId,
    catalogName: exercise.catalogName,
    exerciseOrdinal: exercise.ordinal,
    target: exercise.target,
    warmups: exercise.warmups,
    restSeconds: exercise.restSeconds,
    policy: {
      id: exercise.policy.id,
      version: exercise.policy.version,
    },
  };
}

function decisionKey(decision) {
  return `${decision.dayName}\u0000${decision.catalogName}`;
}

function stableDecision(decision) {
  return serializeDeterministicJson(decision);
}

function sourceFoundation(previousFoundation) {
  return {
    id: previousFoundation.metadata.templateId,
    revision: previousFoundation.metadata.sourceRevision,
    displayName: previousFoundation.metadata.displayName,
    decisions: previousFoundation.days.flatMap((day, dayIndex) =>
      day.exercises.map((exercise, exerciseIndex) =>
        legacyExerciseDecision(
          day,
          exercise,
          dayIndex + 1,
          exerciseIndex + 1,
        )
      )
    ),
  };
}

function currentTemplateDecisions(template) {
  return template.days.flatMap((day) =>
    day.exercises.map((exercise) =>
      currentExerciseDecision(day, exercise)
    )
  );
}

export function diffStarterSources(previousFoundation, currentPack) {
  const previous = sourceFoundation(previousFoundation);
  const currentIds = new Set(
    currentPack.templates.map(({ id }) => id),
  );
  const templates = [];
  let preservedExerciseDecisions = 0;
  let changedExerciseDecisions = 0;

  for (const template of currentPack.templates) {
    if (template.id !== previous.id) {
      templates.push({
        templateId: template.id,
        displayName: template.displayName,
        classification: "added",
        previousRevision: null,
        currentRevision: template.revision,
        exerciseDecisions: currentTemplateDecisions(template).map(
          (decision) => ({
            classification: "added",
            previous: null,
            current: decision,
          }),
        ),
      });
      continue;
    }

    const previousByKey = new Map(
      previous.decisions.map((decision) => [
        decisionKey(decision),
        decision,
      ]),
    );
    const currentDecisions = currentTemplateDecisions(template);
    const exerciseDecisions = currentDecisions.map((decision) => {
      const prior = previousByKey.get(decisionKey(decision)) ?? null;
      const classification = prior !== null
        && stableDecision(prior) === stableDecision(decision)
        ? "preserved"
        : prior === null
        ? "added"
        : "changed";
      if (classification === "preserved") {
        preservedExerciseDecisions += 1;
      } else if (classification === "changed") {
        changedExerciseDecisions += 1;
      }
      return {
        classification,
        previous: prior,
        current: decision,
      };
    });
    const currentDecisionKeys = new Set(
      currentDecisions.map(decisionKey),
    );
    for (const prior of previous.decisions) {
      if (!currentDecisionKeys.has(decisionKey(prior))) {
        changedExerciseDecisions += 1;
        exerciseDecisions.push({
          classification: "removed",
          previous: prior,
          current: null,
        });
      }
    }
    exerciseDecisions.sort((left, right) =>
      compareCodePoints(
        decisionKey(left.current ?? left.previous),
        decisionKey(right.current ?? right.previous),
      )
    );
    templates.push({
      templateId: template.id,
      displayName: template.displayName,
      classification: "updated",
      previousRevision: previous.revision,
      currentRevision: template.revision,
      exerciseDecisions,
    });
  }

  if (!currentIds.has(previous.id)) {
    changedExerciseDecisions += previous.decisions.length;
    templates.push({
      templateId: previous.id,
      displayName: previous.displayName,
      classification: "removed",
      previousRevision: previous.revision,
      currentRevision: null,
      exerciseDecisions: previous.decisions.map((decision) => ({
        classification: "removed",
        previous: decision,
        current: null,
      })),
    });
  }
  templates.sort((left, right) => {
    const leftCurrent = currentPack.templates.find(
      ({ id }) => id === left.templateId,
    );
    const rightCurrent = currentPack.templates.find(
      ({ id }) => id === right.templateId,
    );
    return (leftCurrent?.ordinal ?? Number.MAX_SAFE_INTEGER)
      - (rightCurrent?.ordinal ?? Number.MAX_SAFE_INTEGER)
      || compareCodePoints(left.templateId, right.templateId);
  });

  return {
    schemaVersion: 2,
    reviewStatus: "pending_owner_acceptance",
    baseline: {
      kind: "phase1_full_body_foundation",
      templateId: previous.id,
      revision: previous.revision,
    },
    currentRevision: currentPack.metadata?.revision ?? 2,
    summary: {
      addedTemplates: templates.filter(
        ({ classification }) => classification === "added",
      ).length,
      updatedTemplates: templates.filter(
        ({ classification }) => classification === "updated",
      ).length,
      removedTemplates: templates.filter(
        ({ classification }) => classification === "removed",
      ).length,
      unchangedTemplates: templates.filter(
        ({ classification }) => classification === "unchanged",
      ).length,
      preservedExerciseDecisions,
      changedExerciseDecisions,
    },
    templates,
  };
}

function reviewExercise(exercise) {
  return {
    occurrenceId: exercise.id,
    ordinal: exercise.ordinal,
    exerciseId: exercise.exerciseId,
    catalogName: exercise.catalogName,
    catalogMetricIdentity: exercise.catalogMetricIdentity,
    metricIdentity: exercise.metricIdentity,
    metricOverride: exercise.metricOverride,
    target: exercise.target,
    warmups: exercise.warmups,
    restSeconds: exercise.restSeconds,
    policy: exercise.policy,
    contentRationale: exercise.contentRationale,
    substitutionDecision: exercise.substitutionDecision,
  };
}

function reviewTemplate(template) {
  return {
    templateId: template.id,
    revision: template.revision,
    ordinal: template.ordinal,
    displayName: template.displayName,
    goal: template.goal,
    experience: template.experience,
    audience: template.audience,
    equipment: template.equipment,
    estimatedDurationMinutes: template.estimatedDurationMinutes,
    daysPerWeek: template.daysPerWeek,
    scheduleSuggestion: template.scheduleSuggestion,
    progressionSummary: template.progressionSummary,
    sourceNotes: template.sourceNotes,
    reviewStatus: template.reviewStatus,
    authorityStatus: template.authorityStatus,
    days: template.days.map((day) => ({
      dayId: day.id,
      ordinal: day.ordinal,
      displayName: day.displayName,
      exercises: day.exercises.map(reviewExercise),
    })),
  };
}

function countReviewDecisions(templates) {
  return templates.reduce(
    (templateTotal, template) =>
      templateTotal + template.days.reduce(
        (dayTotal, day) => dayTotal + day.exercises.length,
        0,
      ),
    0,
  );
}

function assertReviewablePack(pack) {
  if (
    pack.metadata.counts.unresolved !== 0
    || pack.metadata.counts.inferred !== 0
    || pack.metadata.authorityStatus !== "candidate_not_accepted"
    || pack.metadata.reviewStatus !== "pending_owner_acceptance"
  ) {
    throw new Error("starter_review_blocked");
  }
  for (const template of pack.templates) {
    if (
      template.reviewStatus !== "pending_owner_acceptance"
      || template.authorityStatus !== "candidate_not_accepted"
    ) {
      throw new Error("starter_review_blocked");
    }
    for (const day of template.days) {
      for (const exercise of day.exercises) {
        if (
          exercise.policy.reviewStatus !== "pending_owner_acceptance"
          || exercise.substitutionDecision.reviewStatus
            !== "pending_owner_acceptance"
          || exercise.substitutionDecision.status !== "no_substitution"
          || exercise.substitutionDecision.substitutions.length !== 0
          || exercise.metricOverride?.reviewStatus
            === "accepted"
        ) {
          throw new Error("starter_review_blocked");
        }
      }
    }
  }
}

export function buildStarterReviewReport({
  pack,
  manifest,
  manifestBytes,
  previousFoundation,
  diff,
}) {
  assertReviewablePack(pack);
  const templates = pack.templates.map(reviewTemplate);
  const exerciseDecisions = countReviewDecisions(templates);
  if (
    exerciseDecisions !== pack.metadata.counts.exercises
    || pack.metadata.counts.substitutions !== 0
  ) {
    throw new Error("starter_review_blocked");
  }
  const intervalExercise = templates
    .flatMap(({ days }) => days)
    .flatMap(({ exercises }) => exercises)
    .find(({ metricIdentity }) => metricIdentity.profile === "intervals");
  if (
    intervalExercise === undefined
    || intervalExercise.target.comparatorId !== "rounds_then_work"
  ) {
    throw new Error("starter_review_blocked");
  }

  return {
    schemaVersion: 2,
    reviewStatus: "pending_owner_acceptance",
    authorityStatus: "candidate_not_accepted",
    accepted: false,
    acceptanceArtifactPresent: false,
    reviewInstructions: {
      inspect: [
        "all six template goals, experience levels, equipment lists, durations, and schedule suggestions",
        "every ordered day and exercise catalog identity",
        "every metric identity and explicit catalog-to-plan occurrence override",
        "every target, warm-up, rest value, and progression or manual Hold policy",
        "every no-substitution decision and rationale",
        "all source notes and the source-to-current D-54 diff",
        "the Strength + Conditioning interval protocol and literal rounds_then_work comparator",
        "the Gym Body-Part Split values as original editable candidate defaults requiring owner acceptance",
      ],
      approvalBoundary:
        "Approve only if every fitness-content decision is intentional; this "
        + "report and the starter assets remain non-authoritative candidates "
        + "until a separate hash-bound owner acceptance record is written.",
      approveSignal: "approved",
      changeSignal: "describe required fixture changes",
    },
    artifactHashes: {
      packSha256: manifest.packSha256,
      manifestSha256: sha256(manifestBytes),
      definitionSha256: manifest.definitionSha256,
      catalogSha256: manifest.sources.catalogSha256,
      catalogManifestSha256:
        manifest.sources.catalogManifestSha256,
      catalogAcceptanceSha256:
        manifest.sources.catalogAcceptanceSha256,
      fullBodyFoundationSha256:
        manifest.sources.fullBodyFoundationSha256,
      metricRegistrySha256: manifest.sources.metricRegistrySha256,
      researchSha256: manifest.sources.researchSha256,
      contextSha256: manifest.sources.contextSha256,
    },
    summary: {
      templates: pack.metadata.counts.templates,
      days: pack.metadata.counts.days,
      exerciseDecisions,
      profiles: pack.metadata.counts.profiles,
      metricOverrides: pack.metadata.counts.metricOverrides,
      substitutions: pack.metadata.counts.substitutions,
      unresolved: pack.metadata.counts.unresolved,
      inferred: pack.metadata.counts.inferred,
    },
    profileCoverage: manifest.profileCoverage,
    intervalProtocol: {
      templateId: "strength-conditioning",
      dayId: "conditioning",
      exerciseId: intervalExercise.exerciseId,
      catalogName: intervalExercise.catalogName,
      target: intervalExercise.target,
      policy: intervalExercise.policy,
    },
    diff,
    templates,
    sourceBaseline: {
      templateId: previousFoundation.metadata.templateId,
      revision: previousFoundation.metadata.sourceRevision,
      sha256: manifest.sources.fullBodyFoundationSha256,
    },
  };
}

async function runSelfTest() {
  const previous = {
    version: 1,
    metadata: {
      templateId: "full-body-foundation",
      sourceRevision: 1,
      displayName: "Full Body Foundation",
    },
    days: [
      {
        name: "Full Body A",
        exercises: [
          {
            exerciseId: "5f140001-7e35-4a6d-9100-000000000001",
            name: "Back Squat",
            restSeconds: 180,
            warmups: [
              { loadGrams: 20_000, reps: 8 },
            ],
            target: {
              kind: "load_reps",
              sets: 3,
              loadGrams: 60_000,
              minReps: 6,
              maxReps: 8,
              perSide: false,
            },
            incrementGrams: 2_500,
            policy: {
              kind: "load_reps",
              id: "load_reps.double_progression.v1",
              version: 1,
            },
          },
        ],
      },
    ],
  };
  const current = {
    schemaVersion: 2,
    metadata: {
      revision: 2,
      reviewStatus: "pending_owner_acceptance",
      authorityStatus: "candidate_not_accepted",
      counts: {
        templates: 2,
        days: 2,
        exercises: 2,
        profiles: 2,
        metricOverrides: 0,
        substitutions: 0,
        unresolved: 0,
        inferred: 0,
      },
    },
    templates: [
      {
        id: "full-body-foundation",
        revision: 2,
        ordinal: 1,
        displayName: "Full Body Foundation",
        reviewStatus: "pending_owner_acceptance",
        authorityStatus: "candidate_not_accepted",
        days: [
          {
            id: "full-body-a",
            ordinal: 1,
            displayName: "Full Body A",
            exercises: [
              {
                id: "full-body-a-back-squat",
                ordinal: 1,
                exerciseId:
                  "5f140001-7e35-4a6d-9100-000000000001",
                catalogName: "Back Squat",
                metricIdentity: {
                  profile: "load_reps",
                  contractVersion: 1,
                  exerciseMetricGeneration: 1,
                },
                catalogMetricIdentity: {
                  profile: "load_reps",
                  contractVersion: 1,
                  exerciseMetricGeneration: 1,
                },
                metricOverride: null,
                target: {
                  version: 1,
                  profile: "load_reps",
                  plannedSets: 3,
                  loadGrams: 60_000,
                  minReps: 6,
                  maxReps: 8,
                  incrementGrams: 2_500,
                  perSide: false,
                },
                warmups: [
                  { ordinal: 1, loadGrams: 20_000, reps: 8 },
                ],
                restSeconds: 180,
                policy: {
                  kind: "automatic",
                  id: "load_reps.double_progression.v1",
                  version: 1,
                  decisionRule: "Exact test rule.",
                  reviewStatus: "pending_owner_acceptance",
                },
                contentRationale: "Exact accepted Phase 1 values.",
                substitutionDecision: {
                  status: "no_substitution",
                  substitutions: [],
                  rationale: "Direct accepted catalog identity.",
                  reviewStatus: "pending_owner_acceptance",
                },
              },
            ],
          },
        ],
        sourceNotes: [
          {
            id: "source",
            text: "Exact test source.",
            provenance: "approved_phase1_fixture",
            reviewStatus: "pending_owner_acceptance",
          },
        ],
      },
      {
        id: "strength-conditioning",
        revision: 2,
        ordinal: 2,
        displayName: "Strength + Conditioning",
        reviewStatus: "pending_owner_acceptance",
        authorityStatus: "candidate_not_accepted",
        days: [
          {
            id: "conditioning",
            ordinal: 1,
            displayName: "Conditioning",
            exercises: [
              {
                id: "conditioning-intervals",
                ordinal: 1,
                exerciseId:
                  "8b4230e6-4f8e-5409-a4ba-40c80e69e72b",
                catalogName: "Battling Ropes",
                metricIdentity: {
                  profile: "intervals",
                  contractVersion: 1,
                  exerciseMetricGeneration: 1,
                },
                catalogMetricIdentity: {
                  profile: "load_reps",
                  contractVersion: 1,
                  exerciseMetricGeneration: 1,
                },
                metricOverride: {
                  fromCatalog: {
                    profile: "load_reps",
                    contractVersion: 1,
                    exerciseMetricGeneration: 1,
                  },
                  toPlanOccurrence: {
                    profile: "intervals",
                    contractVersion: 1,
                    exerciseMetricGeneration: 1,
                  },
                  rationale: "Explicit test override.",
                  reviewStatus: "pending_owner_acceptance",
                },
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
                warmups: [],
                restSeconds: 120,
                policy: {
                  kind: "plan_authored",
                  id: "intervals.plan_authored.v1",
                  version: 1,
                  decisionRule: "Rounds first, work milliseconds second.",
                  reviewStatus: "pending_owner_acceptance",
                },
                contentRationale: "Exact interval test content.",
                substitutionDecision: {
                  status: "no_substitution",
                  substitutions: [],
                  rationale: "Direct accepted catalog identity.",
                  reviewStatus: "pending_owner_acceptance",
                },
              },
            ],
          },
        ],
        sourceNotes: [
          {
            id: "source",
            text: "Exact test source.",
            provenance: "original_gym_tracker_candidate",
            reviewStatus: "pending_owner_acceptance",
          },
        ],
      },
    ],
  };
  const manifest = {
    packSha256: "a".repeat(64),
    definitionSha256: "b".repeat(64),
    sources: {
      catalogSha256: "c".repeat(64),
      catalogManifestSha256: "d".repeat(64),
      catalogAcceptanceSha256: "e".repeat(64),
      fullBodyFoundationSha256: "f".repeat(64),
      metricRegistrySha256: "1".repeat(64),
      researchSha256: "2".repeat(64),
      contextSha256: "3".repeat(64),
    },
    counts: current.metadata.counts,
    profileCoverage: [
      {
        profile: "load_reps",
        identities: [
          {
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
        ],
      },
      {
        profile: "intervals",
        identities: [
          {
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
        ],
      },
    ],
  };

  const diff = diffStarterSources(previous, current);
  assert.deepEqual(diff.summary, {
    addedTemplates: 1,
    updatedTemplates: 1,
    removedTemplates: 0,
    unchangedTemplates: 0,
    preservedExerciseDecisions: 1,
    changedExerciseDecisions: 0,
  });
  assert.deepEqual(
    diff.templates.map(({ templateId, classification }) => [
      templateId,
      classification,
    ]),
    [
      ["full-body-foundation", "updated"],
      ["strength-conditioning", "added"],
    ],
  );

  const report = buildStarterReviewReport({
    pack: current,
    manifest,
    manifestBytes: serializeDeterministicJson(manifest),
    previousFoundation: previous,
    diff,
  });
  assert.equal(report.summary.templates, 2);
  assert.equal(report.summary.exerciseDecisions, 2);
  assert.equal(report.summary.substitutions, 0);
  assert.equal(report.summary.unresolved, 0);
  assert.equal(report.summary.inferred, 0);
  assert.equal(
    report.templates[1].days[0].exercises[0].target.comparatorId,
    "rounds_then_work",
  );
  assert.equal(
    report.templates[1].days[0].exercises[0].target.workIntervalMs,
    30_000,
  );
  assert.match(
    report.reviewInstructions.inspect[0],
    /all six template goals/u,
  );

  const unresolved = structuredClone(current);
  unresolved.metadata.counts.unresolved = 1;
  assert.throws(
    () =>
      buildStarterReviewReport({
        pack: unresolved,
        manifest,
        manifestBytes: serializeDeterministicJson(manifest),
        previousFoundation: previous,
        diff,
      }),
    /starter_review_blocked/u,
  );

  console.log("starter review self-test passed (3 contracts)");
}

async function runCheck() {
  const [
    packBytes,
    manifestBytes,
    foundationBytes,
    reviewBytes,
  ] = await Promise.all([
    readFile(STARTER_PACK_PATH, "utf8"),
    readFile(STARTER_MANIFEST_PATH, "utf8"),
    readFile(FOUNDATION_PATH, "utf8"),
    readFile(REVIEW_PATH, "utf8"),
  ]);
  const pack = parseStarterPack(JSON.parse(packBytes));
  const manifest = parseStarterManifest(JSON.parse(manifestBytes));
  const previousFoundation = JSON.parse(foundationBytes);
  const diff = diffStarterSources(previousFoundation, pack);
  const report = buildStarterReviewReport({
    pack,
    manifest,
    manifestBytes,
    previousFoundation,
    diff,
  });
  const expectedBytes = serializeDeterministicJson(report);
  assert.equal(reviewBytes, expectedBytes);
  assert.equal(manifest.packSha256, sha256(packBytes));
  assert.equal(report.artifactHashes.packSha256, sha256(packBytes));
  assert.equal(report.artifactHashes.manifestSha256, sha256(manifestBytes));
  assert.deepEqual(report.summary, {
    templates: 6,
    days: 20,
    exerciseDecisions: 69,
    profiles: 9,
    metricOverrides: 5,
    substitutions: 0,
    unresolved: 0,
    inferred: 0,
  });
  console.log(
    `starter review check passed (${report.summary.templates} templates, `
      + `${report.summary.exerciseDecisions} exercise decisions)`,
  );
}

async function writeReview() {
  const [packBytes, manifestBytes, foundationBytes] = await Promise.all([
    readFile(STARTER_PACK_PATH, "utf8"),
    readFile(STARTER_MANIFEST_PATH, "utf8"),
    readFile(FOUNDATION_PATH, "utf8"),
  ]);
  const pack = parseStarterPack(JSON.parse(packBytes));
  const manifest = parseStarterManifest(JSON.parse(manifestBytes));
  const previousFoundation = JSON.parse(foundationBytes);
  const diff = diffStarterSources(previousFoundation, pack);
  const report = buildStarterReviewReport({
    pack,
    manifest,
    manifestBytes,
    previousFoundation,
    diff,
  });
  await writeStarterFileAtomically(
    REVIEW_PATH,
    serializeDeterministicJson(report),
  );
  console.log(
    `wrote starter review (${report.summary.templates} templates, `
      + `${report.summary.exerciseDecisions} exercise decisions)`,
  );
}

const command = process.argv[2];
if (command === "--self-test") {
  await runSelfTest();
} else if (command === "--write") {
  await runSelfTest();
  await writeReview();
} else if (command === "--check") {
  await runSelfTest();
  await runCheck();
} else {
  throw new Error(
    "usage: node scripts/content/diff-starter-plans.mjs "
      + "--self-test|--write|--check",
  );
}
