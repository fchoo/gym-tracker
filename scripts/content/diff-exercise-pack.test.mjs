import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnerReviewReport,
  buildProvenanceManifest,
  diffExercisePacks,
  serializeDeterministicJson,
  sha256,
} from "./diff-exercise-pack.mjs";

function exercise(id, canonicalName, overrides = {}) {
  return {
    id,
    canonicalName,
    aliases: [],
    exerciseType: "strength",
    movementClass: "compound",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    equipment: ["barbell"],
    metricIdentity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    availability: "available_candidate",
    reviewStatus: "pending_owner_acceptance",
    source: {
      namespace: "kinetic-place.exercises-db",
      sourceRevision: "1783421f145e546fa168c591a0e4d11cae6f23df",
      upstreamId: id,
      license: "MIT",
      attribution: "Copyright (c) 2026 Kinetic.place",
      legacyLinkStatus: "not_applicable",
      linkedUpstreamId: null,
    },
    ...overrides,
  };
}

function pack(exercises) {
  return {
    schemaVersion: 1,
    metadata: {
      namespace: "gym-tracker.exercise-library",
      revision: 1,
      reviewStatus: "pending_owner_acceptance",
      normalizationVersion: 1,
      metricSchemaVersion: 1,
      source: {
        namespace: "kinetic-place.exercises-db",
        repository: "https://github.com/kinetic-place/exercises-db.git",
        commit: "1783421f145e546fa168c591a0e4d11cae6f23df",
        fileSha256: {
          "en/exercises.json":
            "1a9f8edf72a6780ed2d0404a2792f0848b568a51634d2a03ab1408d4c27210d5",
          "en/muscle_groups.json":
            "b4a7c50798714ef7ccef91f6190d828073e96ed8e61abffe1db9e3500f2fd54e",
          "en/equipment.json":
            "0bb60c40e078ad73210793c11aaed80c2f8dd6a9316b0d67ba724519d84f6ef0",
          LICENSE:
            "497dedffb4292e2b74e250f159ad8d70136564d6ccf13be604642350d34538e0",
        },
        license: "MIT",
        attribution: "Copyright (c) 2026 Kinetic.place",
      },
      counts: {
        visible: exercises.length,
        upstreamIncluded: exercises.length,
        upstreamExcluded: 0,
        legacyPreserved: 0,
        unresolved: 0,
      },
    },
    exercises,
  };
}

const EXERCISE_A = "10000000-0000-4000-8000-000000000001";
const EXERCISE_B = "10000000-0000-4000-8000-000000000002";
const EXERCISE_C = "10000000-0000-4000-8000-000000000003";
const UPSTREAM_D = "20000000-0000-4000-8000-000000000004";

const overlay = {
  schemaVersion: 1,
  sourceCommit: "1783421f145e546fa168c591a0e4d11cae6f23df",
  reviewStatus: "pending_owner_acceptance",
  entries: [
    {
      upstreamId: EXERCISE_C,
      disposition: "include_candidate",
    },
    {
      upstreamId: UPSTREAM_D,
      disposition: "exclude_candidate",
      reasonCode: "initial_300_candidate_scope",
    },
  ],
  legacyExercises: [],
  legacyIdentityDispositions: [
    {
      legacyId: EXERCISE_B,
      legacyName: "Exercise B",
      disposition: "link_candidate",
      linkedUpstreamId: EXERCISE_C,
      upstreamCandidates: [EXERCISE_C],
      reasonCode: "exact_semantic_match_candidate",
      reviewStatus: "pending_owner_acceptance",
    },
  ],
};

test("D-50/D-51 classifies changes and retains removals as unavailable", () => {
  const previous = pack([
    exercise(EXERCISE_A, "Exercise A"),
    exercise(EXERCISE_B, "Exercise B"),
  ]);
  const next = pack([
    exercise(EXERCISE_C, "Exercise C"),
    exercise(EXERCISE_B, "Exercise B Updated"),
  ]);

  const diff = diffExercisePacks(previous, next, overlay);

  assert.deepEqual(diff.summary, {
    added: 1,
    updated: 1,
    linked: 1,
    excluded: 1,
    unchanged: 0,
    newlyUnavailable: 1,
  });
  assert.deepEqual(diff.addedIds, [EXERCISE_C]);
  assert.deepEqual(diff.updatedIds, [EXERCISE_B]);
  assert.deepEqual(diff.linkedLegacyIds, [EXERCISE_B]);
  assert.deepEqual(diff.excludedUpstreamIds, [UPSTREAM_D]);
  assert.deepEqual(diff.unchangedIds, []);
  assert.deepEqual(diff.newlyUnavailableIds, [EXERCISE_A]);
  assert.equal(diff.effectiveExercises.length, 3);

  const unavailable = diff.effectiveExercises.find(
    ({ id }) => id === EXERCISE_A,
  );
  assert.equal(unavailable?.availability, "unavailable_candidate");
  assert.equal(unavailable?.canonicalName, "Exercise A");
  assert.deepEqual(unavailable?.source, previous.exercises[0].source);
  assert.equal(
    diff.effectiveExercises.some(({ id }) => id === EXERCISE_A),
    true,
  );
});

test("diff ordering and serialization are byte deterministic", () => {
  const previous = pack([
    exercise(EXERCISE_B, "Exercise B"),
    exercise(EXERCISE_A, "Exercise A"),
  ]);
  const next = pack([
    exercise(EXERCISE_C, "Exercise C"),
    exercise(EXERCISE_B, "Exercise B"),
  ]);

  const first = diffExercisePacks(previous, next, overlay);
  const second = diffExercisePacks(
    pack([...previous.exercises].reverse()),
    pack([...next.exercises].reverse()),
    {
      ...overlay,
      entries: [...overlay.entries].reverse(),
    },
  );

  assert.equal(
    serializeDeterministicJson(first),
    serializeDeterministicJson(second),
  );
});

test("manifest and owner report bind exact candidate bytes without acceptance", () => {
  const overlayBytes = Buffer.from('{"overlay":true}\n');
  const packBytes = Buffer.from('{"pack":true}\n');
  const licenseBytes = Buffer.from("MIT License\n");
  const diff = diffExercisePacks(
    pack([exercise(EXERCISE_A, "Exercise A")]),
    pack([
      exercise(EXERCISE_A, "Exercise A"),
      exercise(EXERCISE_C, "Exercise C"),
    ]),
    overlay,
  );
  const manifest = buildProvenanceManifest({
    overlayBytes,
    packBytes,
    licenseBytes,
    pack: pack([
      exercise(EXERCISE_A, "Exercise A"),
      exercise(EXERCISE_C, "Exercise C"),
    ]),
  });

  assert.equal(manifest.reviewStatus, "pending_owner_acceptance");
  assert.equal(manifest.overlaySha256, sha256(overlayBytes));
  assert.equal(manifest.packSha256, sha256(packBytes));
  assert.equal(manifest.licenseSha256, sha256(licenseBytes));
  assert.equal(manifest.counts.visible, 2);
  assert.equal(manifest.counts.unresolved, 0);

  const manifestBytes = Buffer.from(serializeDeterministicJson(manifest));
  const report = buildOwnerReviewReport({
    pack: pack([
      exercise(EXERCISE_A, "Exercise A"),
      exercise(EXERCISE_C, "Exercise C"),
    ]),
    overlay,
    manifest,
    manifestBytes,
    diff,
  });

  assert.equal(report.reviewStatus, "pending_owner_acceptance");
  assert.equal(report.accepted, false);
  assert.equal(report.manifestSha256, sha256(manifestBytes));
  assert.equal(report.counts.visible, 2);
  assert.equal(report.counts.unresolved, 0);
  assert.equal(report.catalogRows.length, 2);
  assert.deepEqual(
    report.catalogRows.map(({ id }) => id),
    [EXERCISE_A, EXERCISE_C],
  );
  assert.equal(report.legacyIdentityDispositions.length, 1);
  assert.equal(report.excludedSourceRows.length, 1);
});
