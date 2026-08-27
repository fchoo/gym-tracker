import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PINNED_SOURCE,
  ExercisePackValidationError,
  buildExercisePack,
  loadPinnedSource,
  parseExercisePack,
  parseReviewOverlay,
  serializeDeterministicJson,
  writeExercisePackAtomically,
} from "./build-exercise-pack.mjs";

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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureUuid(index) {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function fixtureSourceRow(index, overrides = {}) {
  return {
    id: fixtureUuid(index),
    name: `Fixture Exercise ${index}`,
    type: "reps",
    difficultyLevel: "beginner",
    forceType: "push",
    mechanics: "compound",
    category: "strength",
    instructions: [`Perform fixture exercise ${index}.`],
    muscleGroups: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        slug: "chest",
        name: "Chest",
        type: "primary",
      },
    ],
    equipment: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        name: "Barbell",
        type: "weight",
        usageType: "single",
        numItems: null,
      },
    ],
    ...overrides,
  };
}

function fixtureSourceBundle(count, rowOverrides = new Map()) {
  return {
    commit: PINNED_SOURCE.commit,
    fileSha256: PINNED_SOURCE.files,
    exercises: Array.from({ length: count }, (_, index) =>
      fixtureSourceRow(index + 1, rowOverrides.get(index + 1)),
    ),
    muscleGroups: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        slug: "chest",
        name: "Chest",
      },
    ],
    equipment: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        name: "Barbell",
        type: "weight",
        usageType: "single",
      },
    ],
  };
}

function fixtureReviewEntry(index, overrides = {}) {
  return {
    upstreamId: fixtureUuid(index),
    disposition: "include_candidate",
    appId: `40000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    canonicalName: `Fixture Exercise ${index}`,
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
    reviewStatus: "pending_owner_acceptance",
    ...overrides,
  };
}

function fixtureLegacyExercise(overrides = {}) {
  return {
    id: "5f140001-7e35-4a6d-9100-000000000001",
    canonicalName: "Back Squat",
    aliases: [],
    exerciseType: "strength",
    movementClass: "compound",
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "squat-rack"],
    metricIdentity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    reviewStatus: "pending_owner_acceptance",
    ...overrides,
  };
}

function fixtureOverlay(count, entryOverrides = new Map()) {
  return {
    schemaVersion: 1,
    sourceCommit: PINNED_SOURCE.commit,
    reviewStatus: "pending_owner_acceptance",
    entries: Array.from({ length: count }, (_, index) =>
      fixtureReviewEntry(index + 1, entryOverrides.get(index + 1)),
    ),
    legacyExercises: [fixtureLegacyExercise()],
    legacyIdentityDispositions: [
      {
        legacyId: "5f140001-7e35-4a6d-9100-000000000001",
        legacyName: "Back Squat",
        disposition: "preserve_original",
        upstreamCandidates: [],
        reasonCode: "no_accepted_upstream_link",
        reviewStatus: "pending_owner_acceptance",
      },
    ],
  };
}

function fixtureBuildOptions(minimumVisibleCount = 300) {
  return {
    minimumVisibleCount,
    requiredLegacyIds: [
      "5f140001-7e35-4a6d-9100-000000000001",
    ],
  };
}

function assertValidationCode(expectedCode, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof ExercisePackValidationError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

async function runSelfTest() {
  const tests = [
    {
      id: "tracer-retained-phase1-identity",
      run() {
        const pack = buildExercisePack(
          fixtureSourceBundle(1),
          fixtureOverlay(1),
          fixtureBuildOptions(2),
        );
        assert.equal(pack.exercises.length, 2);
        assert.equal(
          pack.exercises.find(({ source }) =>
            source.namespace === "gym-tracker.original"
          )?.id,
          "5f140001-7e35-4a6d-9100-000000000001",
        );
      },
    },
    {
      id: "E-06-declared-bounds",
      run() {
        const overlay = fixtureOverlay(1, new Map([
          [1, { canonicalName: "x".repeat(121) }],
        ]));
        assertValidationCode("review_overlay_invalid", () =>
          buildExercisePack(fixtureSourceBundle(1), overlay, {
            ...fixtureBuildOptions(2),
          })
        );
      },
    },
    {
      id: "E-07-identity-adjacency",
      run() {
        const duplicateIdOverlay = fixtureOverlay(2, new Map([
          [2, { appId: fixtureReviewEntry(1).appId }],
        ]));
        assertValidationCode("exercise_identity_conflict", () =>
          buildExercisePack(fixtureSourceBundle(2), duplicateIdOverlay, {
            ...fixtureBuildOptions(3),
          })
        );

        const aliasCollisionOverlay = fixtureOverlay(2, new Map([
          [2, { aliases: ["Fixture Exercise 1"] }],
        ]));
        assertValidationCode("exercise_search_term_conflict", () =>
          buildExercisePack(fixtureSourceBundle(2), aliasCollisionOverlay, {
            ...fixtureBuildOptions(3),
          })
        );

        assertValidationCode("exercise_identity_conflict", () =>
          buildExercisePack(
            fixtureSourceBundle(1),
            fixtureOverlay(1),
            {
              minimumVisibleCount: 2,
              requiredLegacyIds: [
                "5f140001-7e35-4a6d-9100-000000000002",
              ],
            },
          )
        );
      },
    },
    {
      id: "E-08-empty-null-single-row",
      run() {
        assertValidationCode("source_bundle_invalid", () =>
          buildExercisePack(null, fixtureOverlay(1), {
            ...fixtureBuildOptions(2),
          })
        );
        assertValidationCode("review_overlay_invalid", () =>
          buildExercisePack(fixtureSourceBundle(1), {
            ...fixtureOverlay(1),
            entries: [],
          }, {
            ...fixtureBuildOptions(2),
          })
        );
        assertValidationCode("exercise_count_below_minimum", () =>
          buildExercisePack(
            fixtureSourceBundle(1),
            {
              ...fixtureOverlay(1),
              legacyExercises: [],
              legacyIdentityDispositions: [],
            },
            {
              minimumVisibleCount: 2,
              requiredLegacyIds: [],
            },
          )
        );
      },
    },
    {
      id: "E-09-unicode-preservation",
      run() {
        const canonicalName = "Développé couché";
        const pack = buildExercisePack(
          fixtureSourceBundle(1),
          fixtureOverlay(1, new Map([[1, { canonicalName }]])),
          fixtureBuildOptions(2),
        );
        assert.equal(
          pack.exercises.find(({ source }) =>
            source.namespace === PINNED_SOURCE.namespace
          )?.canonicalName,
          canonicalName,
        );
        assert.ok(serializeDeterministicJson(pack).includes(canonicalName));
      },
    },
    {
      id: "E-10-stable-order",
      run() {
        const overlay = fixtureOverlay(3);
        overlay.entries.reverse();
        const pack = buildExercisePack(
          fixtureSourceBundle(3),
          overlay,
          fixtureBuildOptions(4),
        );
        assert.deepEqual(
          pack.exercises.map(({ id }) => id),
          [...pack.exercises.map(({ id }) => id)].sort(),
        );
      },
    },
    {
      id: "E-11-integer-precision",
      run() {
        const maximumSafeOverlay = fixtureOverlay(1, new Map([
          [1, {
            metricIdentity: {
              profile: "load_reps",
              contractVersion: 1,
              exerciseMetricGeneration: Number.MAX_SAFE_INTEGER,
            },
          }],
        ]));
        const pack = buildExercisePack(
          fixtureSourceBundle(1),
          maximumSafeOverlay,
          fixtureBuildOptions(2),
        );
        assert.equal(
          pack.exercises.find(({ source }) =>
            source.namespace === PINNED_SOURCE.namespace
          )?.metricIdentity.exerciseMetricGeneration,
          Number.MAX_SAFE_INTEGER,
        );

        const unsafeOverlay = fixtureOverlay(1, new Map([
          [1, {
            metricIdentity: {
              profile: "load_reps",
              contractVersion: 1,
              exerciseMetricGeneration: Number.MAX_SAFE_INTEGER + 1,
            },
          }],
        ]));
        assertValidationCode("review_overlay_invalid", () =>
          buildExercisePack(fixtureSourceBundle(1), unsafeOverlay, {
            ...fixtureBuildOptions(2),
          })
        );
      },
    },
    {
      id: "E-12-byte-idempotency",
      run() {
        const source = fixtureSourceBundle(3);
        const overlay = fixtureOverlay(3);
        assert.equal(
          serializeDeterministicJson(buildExercisePack(source, overlay, {
            ...fixtureBuildOptions(4),
          })),
          serializeDeterministicJson(buildExercisePack(source, overlay, {
            ...fixtureBuildOptions(4),
          })),
        );
      },
    },
    {
      id: "E-13-interrupted-atomic-write",
      async run() {
        const directory = await mkdtemp(join(tmpdir(), "exercise-pack-test-"));
        const outputPath = join(directory, "exercise-library.json");
        const originalBytes = "{\"original\":true}\n";
        await writeFile(outputPath, originalBytes, "utf8");
        try {
          await assert.rejects(
            writeExercisePackAtomically(
              outputPath,
              serializeDeterministicJson(buildExercisePack(
                fixtureSourceBundle(1),
                fixtureOverlay(1),
                fixtureBuildOptions(2),
              )),
              {
                beforeRename() {
                  throw new Error("simulated_interruption");
                },
              },
            ),
            /simulated_interruption/,
          );
          assert.equal(await readFile(outputPath, "utf8"), originalBytes);
          assert.deepEqual(await readdir(directory), ["exercise-library.json"]);
        } finally {
          await rm(directory, { force: true, recursive: true });
        }
      },
    },
    {
      id: "299-fails-300-passes",
      run() {
        assertValidationCode("exercise_count_below_minimum", () =>
          buildExercisePack(
            fixtureSourceBundle(298),
            fixtureOverlay(298),
            fixtureBuildOptions(),
          )
        );
        assert.equal(
          buildExercisePack(
            fixtureSourceBundle(299),
            fixtureOverlay(299),
            fixtureBuildOptions(),
          ).exercises.length,
          300,
        );
      },
    },
    {
      id: "unresolved-or-inferred-review-fails",
      run() {
        assertValidationCode("review_overlay_invalid", () =>
          buildExercisePack(
            fixtureSourceBundle(1),
            fixtureOverlay(1, new Map([[1, {
              exerciseType: undefined,
            }]])),
            fixtureBuildOptions(2),
          )
        );
        assertValidationCode("review_overlay_invalid", () =>
          buildExercisePack(
            fixtureSourceBundle(1),
            fixtureOverlay(1, new Map([[1, {
              reviewStatus: "unresolved",
            }]])),
            fixtureBuildOptions(2),
          )
        );
      },
    },
  ];

  for (const test of tests) {
    await test.run();
  }

  process.stdout.write(`${JSON.stringify({
    check: "exercise-library-self-test",
    passed: tests.length,
    testIds: tests.map(({ id }) => id),
  })}\n`);
}

async function runCheck() {
  const [overlayBytes, packBytes] = await Promise.all([
    readFile(REVIEW_OVERLAY_PATH),
    readFile(PACK_PATH),
  ]);
  const overlay = parseReviewOverlay(JSON.parse(overlayBytes.toString("utf8")));
  const committedPack = parseExercisePack(JSON.parse(packBytes.toString("utf8")));
  const source = await loadPinnedSource();
  const generatedBytes = serializeDeterministicJson(
    buildExercisePack(source, overlay),
  );
  assert.equal(generatedBytes, packBytes.toString("utf8"));

  process.stdout.write(`${JSON.stringify({
    check: "exercise-library",
    status: "valid_pending_owner_acceptance",
    visibleCount: committedPack.exercises.length,
    upstreamCount: committedPack.metadata.counts.upstreamIncluded,
    legacyCount: committedPack.metadata.counts.legacyPreserved,
    excludedCount: committedPack.metadata.counts.upstreamExcluded,
    unresolvedCount: committedPack.metadata.counts.unresolved,
    sourceCommit: committedPack.metadata.source.commit,
    overlaySha256: sha256(overlayBytes),
    packSha256: sha256(packBytes),
  })}\n`);
}

const flags = new Set(process.argv.slice(2));

if (flags.has("--self-test")) {
  await runSelfTest();
} else if (flags.has("--check")) {
  await runCheck();
} else {
  process.stderr.write(
    "Usage: node scripts/content/validate-exercise-pack.mjs --self-test | --check\n",
  );
  process.exitCode = 2;
}
