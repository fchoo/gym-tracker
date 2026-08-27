import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PINNED_SOURCE,
  loadPinnedSource,
  parseExercisePack,
  parseReviewOverlay,
  serializeDeterministicJson,
  writeExercisePackAtomically,
} from "./build-exercise-pack.mjs";

export { serializeDeterministicJson };

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const PACK_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.json",
);
const OVERLAY_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.review.json",
);
const MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/exercise-library.v1.manifest.json",
);
const LICENSE_PATH = join(
  REPOSITORY_ROOT,
  "assets/content/third-party/kinetic-place-exercises-db.MIT.txt",
);
const REVIEW_REPORT_PATH = join(
  REPOSITORY_ROOT,
  "artifacts/review/phase2/exercise-library-review.json",
);

function compareCodePoints(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function sortIds(ids) {
  return [...ids].sort(compareCodePoints);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serializedRow(row) {
  return serializeDeterministicJson(row);
}

function candidateUnavailableRow(row) {
  return {
    ...row,
    availability: "unavailable_candidate",
  };
}

function emptyPreviousPack(nextPack) {
  return {
    schemaVersion: nextPack.schemaVersion,
    metadata: {
      ...nextPack.metadata,
      revision: 0,
      counts: {
        visible: 0,
        upstreamIncluded: 0,
        upstreamExcluded: 0,
        legacyPreserved: 0,
        unresolved: 0,
      },
    },
    exercises: [],
  };
}

export function diffExercisePacks(previousInput, nextInput, overlayInput) {
  const previous = previousInput ?? emptyPreviousPack(nextInput);
  const next = nextInput;
  const overlay = overlayInput;
  const previousById = new Map(
    previous.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const nextById = new Map(
    next.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const addedIds = [];
  const updatedIds = [];
  const unchangedIds = [];

  for (const exercise of next.exercises) {
    const previousExercise = previousById.get(exercise.id);
    if (previousExercise === undefined) {
      addedIds.push(exercise.id);
    } else if (
      serializedRow(previousExercise) === serializedRow(exercise)
    ) {
      unchangedIds.push(exercise.id);
    } else {
      updatedIds.push(exercise.id);
    }
  }

  const newlyUnavailableIds = previous.exercises
    .filter(({ id }) => !nextById.has(id))
    .map(({ id }) => id);
  const linkedLegacyIds = overlay.legacyIdentityDispositions
    .filter(({ disposition }) => disposition === "link_candidate")
    .map(({ legacyId }) => legacyId);
  const excludedUpstreamIds = overlay.entries
    .filter(({ disposition }) => disposition === "exclude_candidate")
    .map(({ upstreamId }) => upstreamId);
  const effectiveExercises = [
    ...next.exercises,
    ...newlyUnavailableIds.map((id) =>
      candidateUnavailableRow(previousById.get(id))
    ),
  ].sort((left, right) => compareCodePoints(left.id, right.id));
  const sortedAddedIds = sortIds(addedIds);
  const sortedUpdatedIds = sortIds(updatedIds);
  const sortedLinkedLegacyIds = sortIds(linkedLegacyIds);
  const sortedExcludedUpstreamIds = sortIds(excludedUpstreamIds);
  const sortedUnchangedIds = sortIds(unchangedIds);
  const sortedNewlyUnavailableIds = sortIds(newlyUnavailableIds);

  return {
    schemaVersion: 1,
    reviewStatus: "pending_owner_acceptance",
    baseline: previousInput === null
      ? {
        kind: "initial_release",
        previousRevision: null,
      }
      : {
        kind: "pack_update",
        previousRevision: previous.metadata.revision,
      },
    nextRevision: next.metadata.revision,
    summary: {
      added: sortedAddedIds.length,
      updated: sortedUpdatedIds.length,
      linked: sortedLinkedLegacyIds.length,
      excluded: sortedExcludedUpstreamIds.length,
      unchanged: sortedUnchangedIds.length,
      newlyUnavailable: sortedNewlyUnavailableIds.length,
    },
    addedIds: sortedAddedIds,
    updatedIds: sortedUpdatedIds,
    linkedLegacyIds: sortedLinkedLegacyIds,
    excludedUpstreamIds: sortedExcludedUpstreamIds,
    unchangedIds: sortedUnchangedIds,
    newlyUnavailableIds: sortedNewlyUnavailableIds,
    effectiveExercises,
  };
}

export function buildProvenanceManifest({
  overlayBytes,
  packBytes,
  licenseBytes,
  pack,
}) {
  return {
    schemaVersion: 1,
    reviewStatus: "pending_owner_acceptance",
    source: {
      namespace: pack.metadata.source.namespace,
      repository: pack.metadata.source.repository,
      commit: pack.metadata.source.commit,
      fileSha256: { ...pack.metadata.source.fileSha256 },
    },
    artifacts: {
      overlayPath: "assets/content/exercise-library.v1.review.json",
      packPath: "assets/content/exercise-library.v1.json",
      licensePath:
        "assets/content/third-party/kinetic-place-exercises-db.MIT.txt",
    },
    overlaySha256: sha256(overlayBytes),
    packSha256: sha256(packBytes),
    licenseSha256: sha256(licenseBytes),
    normalizationVersion: pack.metadata.normalizationVersion,
    metricSchemaVersion: pack.metadata.metricSchemaVersion,
    counts: {
      visible: pack.metadata.counts.visible,
      upstreamIncluded: pack.metadata.counts.upstreamIncluded,
      upstreamExcluded: pack.metadata.counts.upstreamExcluded,
      legacyPreserved: pack.metadata.counts.legacyPreserved,
      unresolved: pack.metadata.counts.unresolved,
    },
    license: pack.metadata.source.license,
    attribution: pack.metadata.source.attribution,
  };
}

function sourceNameFor(sourceNamesById, upstreamId) {
  return sourceNamesById?.get(upstreamId) ?? upstreamId;
}

function ownerCatalogRow(exercise) {
  return {
    id: exercise.id,
    canonicalName: exercise.canonicalName,
    aliases: [...exercise.aliases],
    exerciseType: exercise.exerciseType,
    movementClass: exercise.movementClass,
    primaryMuscles: [...exercise.primaryMuscles],
    secondaryMuscles: [...exercise.secondaryMuscles],
    equipment: [...exercise.equipment],
    metricIdentity: { ...exercise.metricIdentity },
    availability: exercise.availability,
    reviewStatus: exercise.reviewStatus,
    source: { ...exercise.source },
  };
}

export function buildOwnerReviewReport({
  pack,
  overlay,
  manifest,
  manifestBytes,
  diff,
  sourceNamesById,
}) {
  const legacyIdentityDispositions = overlay.legacyIdentityDispositions
    .map((disposition) => ({
      legacyId: disposition.legacyId,
      legacyName: disposition.legacyName,
      disposition: disposition.disposition,
      linkedUpstreamId: disposition.linkedUpstreamId ?? null,
      linkedSourceName: disposition.linkedUpstreamId === undefined
        ? null
        : sourceNameFor(
          sourceNamesById,
          disposition.linkedUpstreamId,
        ),
      upstreamCandidates: disposition.upstreamCandidates.map(
        (upstreamId) => ({
          upstreamId,
          sourceName: sourceNameFor(sourceNamesById, upstreamId),
        }),
      ),
      reasonCode: disposition.reasonCode,
      reviewStatus: disposition.reviewStatus,
    }))
    .sort((left, right) =>
      compareCodePoints(left.legacyId, right.legacyId)
    );
  const excludedSourceRows = overlay.entries
    .filter(({ disposition }) => disposition === "exclude_candidate")
    .map((entry) => ({
      upstreamId: entry.upstreamId,
      sourceName: sourceNameFor(sourceNamesById, entry.upstreamId),
      reasonCode: entry.reasonCode,
      reviewStatus: entry.reviewStatus,
    }))
    .sort((left, right) =>
      compareCodePoints(left.upstreamId, right.upstreamId)
    );
  const catalogRows = pack.exercises
    .map(ownerCatalogRow)
    .sort((left, right) => compareCodePoints(left.id, right.id));

  return {
    schemaVersion: 1,
    reviewStatus: "pending_owner_acceptance",
    accepted: false,
    acceptanceArtifactPresent: false,
    reviewInstructions: {
      inspect: [
        "all visible canonical names and aliases",
        "exercise type, movement class, muscle, and equipment taxonomy",
        "metric profile, contract version, and exercise metric generation",
        "MIT license and Kinetic.place attribution",
        "all Phase 1 link_candidate and preserve_original dispositions",
        "all excluded source rows and reason codes",
        "D-50/D-51 initial or update diff classifications",
      ],
      approveSignal: "approved",
      changeSignal: "describe required catalog changes",
    },
    source: {
      namespace: manifest.source.namespace,
      repository: manifest.source.repository,
      commit: manifest.source.commit,
      fileSha256: { ...manifest.source.fileSha256 },
      license: manifest.license,
      attribution: manifest.attribution,
    },
    artifactHashes: {
      overlaySha256: manifest.overlaySha256,
      packSha256: manifest.packSha256,
      manifestSha256: sha256(manifestBytes),
      licenseSha256: manifest.licenseSha256,
    },
    manifestSha256: sha256(manifestBytes),
    counts: {
      ...manifest.counts,
      linkedLegacyCandidates: legacyIdentityDispositions.filter(
        ({ disposition }) => disposition === "link_candidate",
      ).length,
      preservedLegacyOriginals: legacyIdentityDispositions.filter(
        ({ disposition }) => disposition === "preserve_original",
      ).length,
    },
    diff: {
      schemaVersion: diff.schemaVersion,
      reviewStatus: diff.reviewStatus,
      baseline: diff.baseline,
      nextRevision: diff.nextRevision,
      summary: { ...diff.summary },
      addedIds: [...diff.addedIds],
      updatedIds: [...diff.updatedIds],
      linkedLegacyIds: [...diff.linkedLegacyIds],
      excludedUpstreamIds: [...diff.excludedUpstreamIds],
      unchangedIds: [...diff.unchangedIds],
      newlyUnavailableIds: [...diff.newlyUnavailableIds],
    },
    legacyIdentityDispositions,
    catalogRows,
    excludedSourceRows,
  };
}

async function loadCommittedInputs() {
  const [overlayBytes, packBytes, licenseBytes] = await Promise.all([
    readFile(OVERLAY_PATH),
    readFile(PACK_PATH),
    readFile(LICENSE_PATH),
  ]);
  const overlay = parseReviewOverlay(
    JSON.parse(overlayBytes.toString("utf8")),
  );
  const pack = parseExercisePack(JSON.parse(packBytes.toString("utf8")));
  assert.equal(sha256(licenseBytes), PINNED_SOURCE.files.LICENSE);
  return {
    overlayBytes,
    packBytes,
    licenseBytes,
    overlay,
    pack,
  };
}

async function buildCurrentArtifacts() {
  const [
    {
      overlayBytes,
      packBytes,
      licenseBytes,
      overlay,
      pack,
    },
    source,
  ] = await Promise.all([
    loadCommittedInputs(),
    loadPinnedSource(),
  ]);
  const sourceNamesById = new Map(
    source.exercises.map(({ id, name }) => [id, name]),
  );
  const manifest = buildProvenanceManifest({
    overlayBytes,
    packBytes,
    licenseBytes,
    pack,
  });
  const manifestBytes = Buffer.from(serializeDeterministicJson(manifest));
  const diff = diffExercisePacks(null, pack, overlay);
  const report = buildOwnerReviewReport({
    pack,
    overlay,
    manifest,
    manifestBytes,
    diff,
    sourceNamesById,
  });
  return {
    manifest,
    manifestBytes,
    report,
    reportBytes: Buffer.from(serializeDeterministicJson(report)),
    diff,
  };
}

async function refreshArtifacts() {
  const { manifestBytes, reportBytes, diff } = await buildCurrentArtifacts();
  await writeExercisePackAtomically(
    MANIFEST_PATH,
    manifestBytes.toString("utf8"),
  );
  await writeExercisePackAtomically(
    REVIEW_REPORT_PATH,
    reportBytes.toString("utf8"),
  );
  process.stdout.write(`${JSON.stringify({
    status: "generated_pending_owner_acceptance",
    manifestSha256: sha256(manifestBytes),
    reviewSha256: sha256(reportBytes),
    diff: diff.summary,
  })}\n`);
}

async function checkArtifacts() {
  const [
    expected,
    committedManifestBytes,
    committedReportBytes,
  ] = await Promise.all([
    buildCurrentArtifacts(),
    readFile(MANIFEST_PATH),
    readFile(REVIEW_REPORT_PATH),
  ]);
  assert.equal(
    committedManifestBytes.toString("utf8"),
    expected.manifestBytes.toString("utf8"),
  );
  assert.equal(
    committedReportBytes.toString("utf8"),
    expected.reportBytes.toString("utf8"),
  );
  const report = JSON.parse(committedReportBytes.toString("utf8"));
  assert.equal(report.accepted, false);
  assert.equal(report.acceptanceArtifactPresent, false);
  assert.equal(report.reviewStatus, "pending_owner_acceptance");
  assert.equal(report.counts.unresolved, 0);

  process.stdout.write(`${JSON.stringify({
    check: "exercise-library-review",
    status: "valid_pending_owner_acceptance",
    visibleCount: report.counts.visible,
    linkedLegacyCandidates: report.counts.linkedLegacyCandidates,
    preservedLegacyOriginals: report.counts.preservedLegacyOriginals,
    excludedCount: report.counts.upstreamExcluded,
    unresolvedCount: report.counts.unresolved,
    overlaySha256: report.artifactHashes.overlaySha256,
    packSha256: report.artifactHashes.packSha256,
    manifestSha256: sha256(committedManifestBytes),
    reviewSha256: sha256(committedReportBytes),
    licenseSha256: report.artifactHashes.licenseSha256,
    diff: report.diff.summary,
  })}\n`);
}

if (
  process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length === 3 && process.argv[2] === "--refresh") {
    await refreshArtifacts();
  } else if (process.argv.length === 3 && process.argv[2] === "--check") {
    await checkArtifacts();
  } else {
    process.stderr.write(
      "Usage: node scripts/content/diff-exercise-pack.mjs --refresh | --check\n",
    );
    process.exitCode = 2;
  }
}
