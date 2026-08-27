import {
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

import {
  type CatalogBoundaryErrorCode,
  CatalogBoundaryError,
  parseExerciseCatalog,
} from "./catalog";

const repositoryRoot = join(__dirname, "../../..");
const catalogBytes = readFileSync(
  join(repositoryRoot, "assets/content/exercise-library.v1.json"),
  "utf8",
);
const manifestBytes = readFileSync(
  join(repositoryRoot, "assets/content/exercise-library.v1.manifest.json"),
  "utf8",
);
const acceptanceBytes = readFileSync(
  join(
    repositoryRoot,
    "artifacts/review/phase2/exercise-library-acceptance.json",
  ),
  "utf8",
);

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

function acceptedInput() {
  return {
    catalogBytes,
    manifestBytes,
    acceptanceBytes,
    sha256,
  };
}

function rebindAcceptedInput(
  mutateCatalog: (catalog: Record<string, unknown>) => void,
) {
  const catalog = JSON.parse(catalogBytes) as Record<string, unknown>;
  const manifest = JSON.parse(manifestBytes) as Record<string, unknown>;
  const acceptance = JSON.parse(acceptanceBytes) as Record<string, unknown>;
  mutateCatalog(catalog);
  const reboundCatalogBytes = `${JSON.stringify(catalog, null, 2)}\n`;
  const reboundPackSha256 = createHash("sha256")
    .update(reboundCatalogBytes)
    .digest("hex");
  manifest.packSha256 = reboundPackSha256;
  const reboundManifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  acceptance.packSha256 = reboundPackSha256;
  acceptance.manifestSha256 = createHash("sha256")
    .update(reboundManifestBytes)
    .digest("hex");
  return {
    catalogBytes: reboundCatalogBytes,
    manifestBytes: reboundManifestBytes,
    acceptanceBytes: `${JSON.stringify(acceptance, null, 2)}\n`,
    sha256,
  };
}

function rebindManifestInput(
  mutateManifest: (manifest: Record<string, unknown>) => void,
) {
  const manifest = JSON.parse(manifestBytes) as Record<string, unknown>;
  const acceptance = JSON.parse(acceptanceBytes) as Record<string, unknown>;
  mutateManifest(manifest);
  const reboundManifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  acceptance.manifestSha256 = createHash("sha256")
    .update(reboundManifestBytes)
    .digest("hex");
  return {
    catalogBytes,
    manifestBytes: reboundManifestBytes,
    acceptanceBytes: `${JSON.stringify(acceptance, null, 2)}\n`,
    sha256,
  };
}

describe("accepted exercise catalog runtime boundary", () => {
  it("parses only the exact hash-accepted catalog with stable identities", async () => {
    const catalog = await parseExerciseCatalog(acceptedInput());

    expect(catalog.metadata).toEqual(expect.objectContaining({
      namespace: "gym-tracker.exercise-library",
      revision: 1,
      normalizationVersion: 1,
      metricSchemaVersion: 1,
    }));
    expect(catalog.exercises).toHaveLength(310);
    expect(catalog.exercises.map(({ id }) => id)).toEqual(
      [...catalog.exercises.map(({ id }) => id)].sort(),
    );
    expect(catalog.acceptance).toEqual(expect.objectContaining({
      accepted: true,
      reviewerResponse: "approved",
      packSha256: "9ffa6209c4e07ddbd0f3988a2b3607b8f536595f70d4b74f41e0d5fa95779ae9",
    }));
  });

  it.each<readonly [
    string,
    Parameters<typeof parseExerciseCatalog>[0],
    CatalogBoundaryErrorCode,
  ]>([
    [
      "catalog bytes",
      {
        ...acceptedInput(),
        catalogBytes: `${catalogBytes} `,
      },
      "catalog_hash_mismatch",
    ],
    [
      "manifest bytes",
      {
        ...acceptedInput(),
        manifestBytes: `${manifestBytes} `,
      },
      "catalog_hash_mismatch",
    ],
    [
      "unaccepted review",
      {
        ...acceptedInput(),
        acceptanceBytes: JSON.stringify({
          ...(JSON.parse(acceptanceBytes) as object),
          accepted: false,
          reviewerResponse: "rejected",
        }),
      },
      "catalog_not_accepted",
    ],
  ])("rejects mismatched %s", async (_label, input, code) => {
    await expect(parseExerciseCatalog(input)).rejects.toEqual(
      expect.objectContaining({
        code,
        kind: "validation",
        retryable: false,
      } satisfies Partial<CatalogBoundaryError>),
    );
  });

  it.each<readonly [
    string,
    (catalog: Record<string, unknown>) => void,
    CatalogBoundaryErrorCode,
  ]>([
    [
      "unknown catalog version",
      (catalog: Record<string, unknown>) => {
        catalog.schemaVersion = 2;
      },
      "catalog_version_unsupported",
    ],
    [
      "overlapping taxonomy relation",
      (catalog: Record<string, unknown>) => {
        const exercise = (catalog.exercises as Array<Record<string, unknown>>)[0]!;
        exercise.secondaryMuscles = [
          ...(exercise.secondaryMuscles as string[]),
          ...(exercise.primaryMuscles as string[]),
        ];
      },
      "catalog_relation_invalid",
    ],
    [
      "duplicate search identity",
      (catalog: Record<string, unknown>) => {
        const exercises = catalog.exercises as Array<Record<string, unknown>>;
        exercises[1]!.aliases = [exercises[0]!.canonicalName as string];
      },
      "catalog_identity_conflict",
    ],
    [
      "unsafe integer",
      (catalog: Record<string, unknown>) => {
        const exercise = (catalog.exercises as Array<Record<string, unknown>>)[0]!;
        exercise.metricIdentity = {
          ...(exercise.metricIdentity as object),
          exerciseMetricGeneration: Number.MAX_SAFE_INTEGER + 1,
        };
      },
      "catalog_invalid",
    ],
    [
      "unsupported metric contract",
      (catalog: Record<string, unknown>) => {
        const exercise = (catalog.exercises as Array<Record<string, unknown>>)[0]!;
        exercise.metricIdentity = {
          ...(exercise.metricIdentity as object),
          contractVersion: 99,
        };
      },
      "catalog_invalid",
    ],
    [
      "legacy source relation",
      (catalog: Record<string, unknown>) => {
        const exercise = (catalog.exercises as Array<Record<string, unknown>>)
          .find(({ source }) =>
            (source as Record<string, unknown>).namespace
              === "gym-tracker.original"
          )!;
        exercise.source = {
          ...(exercise.source as object),
          legacyLinkStatus: "not_applicable",
        };
      },
      "catalog_relation_invalid",
    ],
    [
      "upstream source relation",
      (catalog: Record<string, unknown>) => {
        const exercise = (catalog.exercises as Array<Record<string, unknown>>)
          .find(({ source }) =>
            (source as Record<string, unknown>).namespace
              === "kinetic-place.exercises-db"
          )!;
        exercise.source = {
          ...(exercise.source as object),
          linkedUpstreamId: "10000000-0000-4000-8000-000000000001",
        };
      },
      "catalog_relation_invalid",
    ],
    [
      "duplicate app identity",
      (catalog: Record<string, unknown>) => {
        const exercises = catalog.exercises as Array<Record<string, unknown>>;
        exercises[1]!.id = exercises[0]!.id;
      },
      "catalog_identity_conflict",
    ],
    [
      "unstable exercise order",
      (catalog: Record<string, unknown>) => {
        (catalog.exercises as Array<Record<string, unknown>>).reverse();
      },
      "catalog_identity_conflict",
    ],
    [
      "duplicate upstream identity",
      (catalog: Record<string, unknown>) => {
        const exercises = (catalog.exercises as Array<Record<string, unknown>>)
          .filter(({ source }) =>
            (source as Record<string, unknown>).namespace
              === "kinetic-place.exercises-db"
          );
        const firstSource = exercises[0]!.source as Record<string, unknown>;
        exercises[1]!.source = {
          ...(exercises[1]!.source as object),
          upstreamId: firstSource.upstreamId,
        };
      },
      "catalog_identity_conflict",
    ],
  ])("rejects %s before persistence", async (_label, mutate, code) => {
    await expect(parseExerciseCatalog(
      rebindAcceptedInput(mutate),
    )).rejects.toEqual(expect.objectContaining({
      code,
      retryable: false,
    } satisfies Partial<CatalogBoundaryError>));
  });

  it("rejects a manifest whose pinned source hashes drift from the catalog", async () => {
    await expect(parseExerciseCatalog(rebindManifestInput((manifest) => {
      const source = manifest.source as Record<string, unknown>;
      source.fileSha256 = {
        ...(source.fileSha256 as object),
        "en/exercises.json": "0".repeat(64),
      };
    }))).rejects.toEqual(expect.objectContaining({
      code: "catalog_relation_invalid",
      retryable: false,
    } satisfies Partial<CatalogBoundaryError>));
  });

  it("rejects invalid JSON and primitive catalog payloads", async () => {
    await expect(parseExerciseCatalog({
      ...acceptedInput(),
      catalogBytes: "{",
    })).rejects.toEqual(expect.objectContaining({
      code: "catalog_invalid",
    }));
    await expect(parseExerciseCatalog({
      ...acceptedInput(),
      catalogBytes: "true",
    })).rejects.toEqual(expect.objectContaining({
      code: "catalog_version_unsupported",
    }));
  });

  it("rejects acceptance metadata that is approved but not owner-authored", async () => {
    await expect(parseExerciseCatalog({
      ...acceptedInput(),
      acceptanceBytes: JSON.stringify({
        ...(JSON.parse(acceptanceBytes) as object),
        reviewer: "maintainer",
      }),
    })).rejects.toEqual(expect.objectContaining({
      code: "catalog_not_accepted",
    }));
  });

  it("rejects a manifest pack hash that does not bind the catalog bytes", async () => {
    await expect(parseExerciseCatalog(rebindManifestInput((manifest) => {
      manifest.packSha256 = "0".repeat(64);
    }))).rejects.toEqual(expect.objectContaining({
      code: "catalog_hash_mismatch",
    }));
  });
});
