import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  STARTER_MANIFEST_PATH,
  STARTER_PACK_PATH,
  STARTER_TEMPLATE_ORDER,
  StarterPlanValidationError,
  buildStarterArtifacts,
  buildStarterPack,
  createStarterDefinitions,
  loadAcceptedCatalog,
  loadMetricRegistryContracts,
  parseStarterManifest,
  parseStarterPack,
  serializeDeterministicJson,
  writeStarterFileAtomically,
} from "./build-starter-plans.mjs";

function clone(value) {
  return structuredClone(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertValidationCode(expectedCode, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof StarterPlanValidationError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function firstExercise(templates) {
  return templates[0].days[0].exercises[0];
}

async function loadBuildInputs() {
  const acceptedCatalog = await loadAcceptedCatalog();
  const metricRegistry = await loadMetricRegistryContracts();
  return {
    acceptedCatalog,
    metricRegistry,
  };
}

async function runSelfTest() {
  const { acceptedCatalog, metricRegistry } = await loadBuildInputs();
  const productionTemplates = createStarterDefinitions();
  const tests = [
    {
      id: "six-template-gym-body-part-split-contract",
      run() {
        assert.equal(productionTemplates.length, 6);
        assert.deepEqual(
          productionTemplates.map(({ id }) => id),
          STARTER_TEMPLATE_ORDER,
        );

        const generated = buildStarterPack({
          catalog: acceptedCatalog.catalog,
          metricContracts: metricRegistry.contracts,
          templates: productionTemplates,
        });
        assert.deepEqual(generated.metadata.counts, {
          templates: 6,
          days: 20,
          exercises: 69,
          profiles: 9,
          metricOverrides: 5,
          substitutions: 0,
          unresolved: 0,
          inferred: 0,
        });
        assert.deepEqual(
          generated.templates.slice(0, 5).map((template) =>
            sha256(JSON.stringify(template))
          ),
          [
            "f2df21fc8d57b53e7f4bf7fe6934a50b0d70c7a78f82efef7e1642f289016f0f",
            "6b2b761f1cbca0aebdde07cf01e06b776bb0e200b8ab52c365ae5e21e96215e2",
            "8be21b6c6f7d8f44638dcffe4abb1a04d9d600d0a9a8c164bcd1be8cafb86adc",
            "6e2cd2754b63a00bffb1e7e35b9fb9253dfb42f49d2a862a5294436f19b485c8",
            "7ce210ebf1f9814d5ec921adfd2b0815248f6a40e4759c74bb9f90fc7b540ec1",
          ],
        );

        const template = generated.templates[5];
        assert.equal(template.id, "gym-body-part-split");
        assert.equal(template.displayName, "Gym Body-Part Split");
        assert.equal(template.experience, "intermediate");
        assert.equal(template.estimatedDurationMinutes, 55);
        assert.equal(template.daysPerWeek, 5);
        assert.deepEqual(template.equipment, [
          "barbell",
          "bench",
          "cable",
          "dumbbell",
          "machine",
          "squat-rack",
        ]);
        assert.deepEqual(
          template.scheduleSuggestion.cycleWeeks[0].map(
            ({ weekday, dayId }) => [weekday, dayId],
          ),
          [
            ["Monday", "body-part-chest"],
            ["Tuesday", "body-part-back"],
            ["Wednesday", "body-part-shoulders"],
            ["Thursday", "body-part-legs"],
            ["Friday", "body-part-arms"],
          ],
        );
        assert.deepEqual(
          template.days.map(({ displayName, exercises }) => [
            displayName,
            exercises.map(({ exerciseId }) => exerciseId),
          ]),
          [
            [
              "Chest",
              [
                "5f140001-7e35-4a6d-9100-000000000002",
                "b4ba5e4e-b833-52df-9615-d30543fc445d",
                "be67b29f-28fc-5232-beff-125c5aeef30b",
                "707ddf5b-ea64-5407-b3d1-f586054ae5ad",
              ],
            ],
            [
              "Back",
              [
                "5f140001-7e35-4a6d-9100-000000000003",
                "fba8296b-d743-5b04-8103-3560fccb0a8d",
                "5f140001-7e35-4a6d-9100-000000000008",
                "5f140001-7e35-4a6d-9100-000000000006",
              ],
            ],
            [
              "Shoulders",
              [
                "218e19d4-f4eb-57a7-a292-c5a5562d458e",
                "0ff0e0cd-8bad-5794-9dd3-af2ee070bd98",
                "20bd0098-0c2e-547a-a904-11afc2a9b022",
                "4ce1a6ba-0357-533a-93a6-70866f863a9b",
              ],
            ],
            [
              "Legs",
              [
                "5f140001-7e35-4a6d-9100-000000000001",
                "5f140001-7e35-4a6d-9100-000000000004",
                "00fda844-429f-58c8-9c8c-134b730a480b",
                "f1d5b5de-233e-5405-95b4-0e86aeda7f9d",
              ],
            ],
            [
              "Arms",
              [
                "a5d202ec-d2ee-552a-b5d9-9eb97493b244",
                "05129856-244d-5c67-8be9-5943ca3af16d",
                "f81f6653-7aa0-54b0-89da-50c9df2b0726",
                "5c4a7233-e4ff-5726-80b2-78e5d17f512d",
              ],
            ],
          ],
        );
        assert.deepEqual(
          template.days.map(({ exercises }) =>
            exercises.map(({ warmups }) => warmups.length)
          ),
          [
            [2, 0, 0, 0],
            [2, 0, 0, 0],
            [0, 0, 0, 0],
            [2, 0, 0, 0],
            [0, 0, 0, 0],
          ],
        );
        for (const day of template.days) {
          for (const exercise of day.exercises) {
            assert.deepEqual(exercise.metricIdentity, {
              profile: "load_reps",
              contractVersion: 1,
              exerciseMetricGeneration: 1,
            });
            assert.equal(exercise.metricOverride, null);
            assert.equal(exercise.target.version, 1);
            assert.equal(exercise.target.profile, "load_reps");
            assert.equal(exercise.policy.kind, "automatic");
            assert.equal(
              exercise.policy.id,
              "load_reps.double_progression.v1",
            );
          }
        }
      },
    },
    {
      id: "tracer-full-body-foundation-day",
      run() {
        const template = clone(productionTemplates[0]);
        template.days = [template.days[0]];
        template.scheduleSuggestion = {
          mode: "rotation",
          rotation: [template.days[0].id],
        };
        template.daysPerWeek = 1;
        const pack = buildStarterPack({
          catalog: acceptedCatalog.catalog,
          metricContracts: metricRegistry.contracts,
          templates: [template],
          validation: {
            expectedTemplateIds: ["full-body-foundation"],
            requiredProfiles: ["load_reps", "timed_hold"],
          },
        });
        assert.equal(pack.templates.length, 1);
        assert.equal(pack.templates[0].days.length, 1);
        assert.equal(pack.templates[0].days[0].exercises.length, 5);
        assert.deepEqual(
          pack.templates[0].days[0].exercises.map(
            ({ metricIdentity }) =>
              `${metricIdentity.profile}:${metricIdentity.contractVersion}`,
          ),
          [
            "load_reps:1",
            "load_reps:1",
            "load_reps:1",
            "load_reps:1",
            "timed_hold:1",
          ],
        );
      },
    },
    {
      id: "E-34-declared-bounds-and-template-set",
      run() {
        const missing = clone(productionTemplates);
        missing.pop();
        assertValidationCode("starter_template_set_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: missing,
          })
        );

        const extra = clone(productionTemplates);
        extra.push({
          ...clone(extra[0]),
          id: "unexpected-template",
          ordinal: 6,
          displayName: "Unexpected Template",
        });
        assertValidationCode("starter_template_set_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: extra,
          })
        );

        const overlong = clone(productionTemplates);
        overlong[0].sourceNotes[0].text = "x".repeat(501);
        assertValidationCode("starter_template_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: overlong,
          })
        );
      },
    },
    {
      id: "E-35-reference-and-metric-identity",
      run() {
        const invalidReference = clone(productionTemplates);
        firstExercise(invalidReference).exerciseId =
          "ffffffff-ffff-4fff-8fff-ffffffffffff";
        assertValidationCode("starter_reference_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: invalidReference,
          })
        );

        const invalidMetric = clone(productionTemplates);
        firstExercise(invalidMetric).metricIdentity.contractVersion = 99;
        firstExercise(invalidMetric).target.version = 99;
        assertValidationCode("starter_metric_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: invalidMetric,
          })
        );
      },
    },
    {
      id: "E-36-empty-and-single-day",
      run() {
        const empty = clone(productionTemplates);
        empty[0].days = [];
        assertValidationCode("starter_template_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: empty,
          })
        );

        const template = clone(productionTemplates[0]);
        template.days = [template.days[0]];
        template.scheduleSuggestion = {
          mode: "rotation",
          rotation: [template.days[0].id],
        };
        template.daysPerWeek = 1;
        const singleDayPack = buildStarterPack({
          catalog: acceptedCatalog.catalog,
          metricContracts: metricRegistry.contracts,
          templates: [template],
          validation: {
            expectedTemplateIds: ["full-body-foundation"],
            requiredProfiles: ["load_reps", "timed_hold"],
          },
        });
        assert.equal(singleDayPack.templates[0].days.length, 1);
      },
    },
    {
      id: "E-37-unicode-source-note",
      run() {
        const templates = clone(productionTemplates);
        templates[0].sourceNotes[0].text =
          "Original plan note — café strength with owner review.";
        const pack = buildStarterPack({
          catalog: acceptedCatalog.catalog,
          metricContracts: metricRegistry.contracts,
          templates,
        });
        assert.equal(
          pack.templates[0].sourceNotes[0].text,
          "Original plan note — café strength with owner review.",
        );
        assert.ok(serializeDeterministicJson(pack).includes("café"));
      },
    },
    {
      id: "E-38-stable-ordinal-order",
      run() {
        const templates = clone(productionTemplates).reverse();
        for (const template of templates) {
          template.days.reverse();
          for (const day of template.days) {
            day.exercises.reverse();
          }
        }
        const pack = buildStarterPack({
          catalog: acceptedCatalog.catalog,
          metricContracts: metricRegistry.contracts,
          templates,
        });
        assert.deepEqual(
          pack.templates.map(({ id }) => id),
          STARTER_TEMPLATE_ORDER,
        );
        for (const template of pack.templates) {
          assert.deepEqual(
            template.days.map(({ ordinal }) => ordinal),
            template.days.map(({ ordinal }) => ordinal)
              .toSorted((left, right) => left - right),
          );
          for (const day of template.days) {
            assert.deepEqual(
              day.exercises.map(({ ordinal }) => ordinal),
              day.exercises.map(({ ordinal }) => ordinal)
                .toSorted((left, right) => left - right),
            );
          }
        }

        const duplicateOrdinal = clone(productionTemplates);
        duplicateOrdinal[0].days[1].ordinal =
          duplicateOrdinal[0].days[0].ordinal;
        assertValidationCode("starter_ordinal_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: duplicateOrdinal,
          })
        );
      },
    },
    {
      id: "E-39-base-unit-integer-precision",
      run() {
        const maximumSafe = clone(productionTemplates);
        firstExercise(maximumSafe).target.loadGrams =
          Number.MAX_SAFE_INTEGER;
        const pack = buildStarterPack({
          catalog: acceptedCatalog.catalog,
          metricContracts: metricRegistry.contracts,
          templates: maximumSafe,
        });
        assert.equal(
          firstExercise(pack.templates).target.loadGrams,
          Number.MAX_SAFE_INTEGER,
        );

        const unsafe = clone(productionTemplates);
        firstExercise(unsafe).target.loadGrams =
          Number.MAX_SAFE_INTEGER + 1;
        assertValidationCode("starter_template_invalid", () =>
          buildStarterPack({
            catalog: acceptedCatalog.catalog,
            metricContracts: metricRegistry.contracts,
            templates: unsafe,
          })
        );
      },
    },
    {
      id: "E-40-byte-idempotency",
      run() {
        const first = buildStarterArtifacts({
          ...acceptedCatalog,
          ...metricRegistry,
          templates: productionTemplates,
        });
        const second = buildStarterArtifacts({
          ...acceptedCatalog,
          ...metricRegistry,
          templates: productionTemplates,
        });
        assert.equal(first.packBytes, second.packBytes);
        assert.equal(first.manifestBytes, second.manifestBytes);
      },
    },
    {
      id: "E-41-interrupted-atomic-write",
      async run() {
        const directory = await mkdtemp(
          join(tmpdir(), "starter-plans-test-"),
        );
        const outputPath = join(directory, "starter-plans.json");
        const originalBytes = "{\"original\":true}\n";
        await writeFile(outputPath, originalBytes, "utf8");
        try {
          await assert.rejects(
            writeStarterFileAtomically(
              outputPath,
              serializeDeterministicJson({
                replacement: true,
              }),
              {
                beforeRename() {
                  throw new Error("simulated_interruption");
                },
              },
            ),
            /simulated_interruption/u,
          );
          assert.equal(await readFile(outputPath, "utf8"), originalBytes);
          assert.deepEqual(await readdir(directory), [
            "starter-plans.json",
          ]);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      },
    },
  ];

  for (const test of tests) {
    await test.run();
  }
  console.log(`starter plan self-test passed (${tests.length} contracts)`);
}

async function runCheck() {
  const [committedPackBytes, committedManifestBytes] = await Promise.all([
    readFile(STARTER_PACK_PATH, "utf8"),
    readFile(STARTER_MANIFEST_PATH, "utf8"),
  ]);
  const committedPack = parseStarterPack(JSON.parse(committedPackBytes));
  const committedManifest = parseStarterManifest(
    JSON.parse(committedManifestBytes),
  );
  const { acceptedCatalog, metricRegistry } = await loadBuildInputs();
  const generated = buildStarterArtifacts({
    ...acceptedCatalog,
    ...metricRegistry,
    templates: createStarterDefinitions(),
  });
  assert.deepEqual(committedPack, generated.pack);
  assert.deepEqual(committedManifest, generated.manifest);
  assert.equal(committedPackBytes, generated.packBytes);
  assert.equal(committedManifestBytes, generated.manifestBytes);
  console.log(
    "starter plan check passed "
      + `(${generated.pack.metadata.counts.templates} templates, `
      + `${generated.pack.metadata.counts.profiles} profiles)`,
  );
}

const command = process.argv[2];
if (command === "--self-test") {
  await runSelfTest();
} else if (command === "--check") {
  await runCheck();
} else {
  throw new Error(
    "usage: node scripts/content/validate-starter-plans.mjs "
      + "--self-test|--check",
  );
}
