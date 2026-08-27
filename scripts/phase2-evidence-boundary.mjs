import { randomBytes } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { link, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import process from "node:process";

const ARTIFACT_DIRECTORY = "artifacts/native/phase2";
const MANIFEST_PATH = `${ARTIFACT_DIRECTORY}/build.json`;
const ATTENDED_DIRECTORY = `${ARTIFACT_DIRECTORY}/attended`;
const ATTENDED_FILE_NAMES = Object.freeze({
  checklist: "checklist.pending.json",
  emulator: "emulator-supplementary.json",
  samsung: "physical-result.json",
});
const OUTPUT_PATHS = Object.freeze({
  final: `${ARTIFACT_DIRECTORY}/final-verification.json`,
  roundtrip: `${ARTIFACT_DIRECTORY}/artifact-roundtrip.json`,
});
const SEAL_LOCK_NAME = ".evidence-seal.lock";
const RECOVERY_LOCK_NAME = ".evidence-seal.recovery.lock";
const LOCK_SCHEMA_VERSION = 1;
const MAX_ACQUIRE_ATTEMPTS = 3;

function lstatIfPresent(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function validateCanonicalDirectory(directoryPath, label) {
  const details = lstatIfPresent(directoryPath);
  if (details?.isSymbolicLink()) {
    throw new Error(`${label} must not escape through a symlink.`);
  }
  if (details === null || !details.isDirectory()) {
    throw new Error(`${label} is missing or is not a directory.`);
  }
  if (realpathSync(directoryPath) !== directoryPath) {
    throw new Error(`${label} must not escape through a symlink.`);
  }
}

function validateCanonicalFile(filePath, expectedPath, label) {
  if (filePath !== expectedPath) {
    throw new Error(`${label} must use the canonical path.`);
  }
  const details = lstatIfPresent(filePath);
  if (details !== null && (details.isSymbolicLink()
      || !details.isFile()
      || realpathSync(filePath) !== expectedPath)) {
    throw new Error(`${label} must be a physical file and must not be a symlink.`);
  }
}

function resolveArtifactBoundary(root) {
  const rootPath = realpathSync(root);
  const artifactDirectory = path.join(rootPath, ARTIFACT_DIRECTORY);
  validateCanonicalDirectory(artifactDirectory, "Phase 2 artifact directory");
  return { rootPath, artifactDirectory };
}

export function resolvePhase2ManifestPath({
  root = process.cwd(),
  manifestArgument,
}) {
  if (manifestArgument !== MANIFEST_PATH) {
    throw new Error(
      `Phase 2 manifest must use the canonical ${MANIFEST_PATH} path.`,
    );
  }
  let rootPath;
  let artifactDirectory;
  try {
    ({ rootPath, artifactDirectory } = resolveArtifactBoundary(root));
  } catch (error) {
    if (/symlink/u.test(error.message)) {
      throw new Error(
        "Phase 2 manifest canonical parent must not escape through a symlink.",
      );
    }
    throw error;
  }
  const manifestPath = path.join(artifactDirectory, "build.json");
  validateCanonicalFile(
    manifestPath,
    path.join(rootPath, MANIFEST_PATH),
    "Phase 2 manifest canonical path",
  );
  return manifestPath;
}

export function resolvePhase2AttendedPaths({
  root = process.cwd(),
  requireDirectory = true,
} = {}) {
  const { rootPath, artifactDirectory } = resolveArtifactBoundary(root);
  const attendedDirectory = path.join(rootPath, ATTENDED_DIRECTORY);
  if (requireDirectory || lstatIfPresent(attendedDirectory) !== null) {
    validateCanonicalDirectory(attendedDirectory, "Phase 2 attended directory");
  }
  const paths = {
    rootPath,
    artifactDirectory,
    attendedDirectory,
    checklistPath: path.join(attendedDirectory, ATTENDED_FILE_NAMES.checklist),
    emulatorPath: path.join(attendedDirectory, ATTENDED_FILE_NAMES.emulator),
    samsungPath: path.join(attendedDirectory, ATTENDED_FILE_NAMES.samsung),
    finalPath: path.join(artifactDirectory, "final-verification.json"),
  };
  validateCanonicalFile(
    paths.checklistPath,
    path.join(rootPath, ATTENDED_DIRECTORY, ATTENDED_FILE_NAMES.checklist),
    "Phase 2 attended checklist",
  );
  validateCanonicalFile(
    paths.emulatorPath,
    path.join(rootPath, ATTENDED_DIRECTORY, ATTENDED_FILE_NAMES.emulator),
    "Phase 2 emulator attended record",
  );
  validateCanonicalFile(
    paths.samsungPath,
    path.join(rootPath, ATTENDED_DIRECTORY, ATTENDED_FILE_NAMES.samsung),
    "Phase 2 Samsung attended record",
  );
  validateCanonicalFile(
    paths.finalPath,
    path.join(rootPath, OUTPUT_PATHS.final),
    "Phase 2 final verification output",
  );
  return paths;
}

export function resolvePhase2OutputPath({
  root = process.cwd(),
  outputArgument,
  kind,
}) {
  const relative = OUTPUT_PATHS[kind];
  if (relative === undefined || outputArgument !== relative) {
    throw new Error(`${kind} output must use the canonical artifact path.`);
  }
  const { rootPath } = resolveArtifactBoundary(root);
  const outputPath = path.join(rootPath, relative);
  validateCanonicalFile(
    outputPath,
    path.join(rootPath, relative),
    `Phase 2 ${kind} output`,
  );
  return outputPath;
}

function validLockOwner(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join(",")
      === "acquired_at,hostname,operation,pid,schema_version,token"
    && value.schema_version === LOCK_SCHEMA_VERSION
    && typeof value.hostname === "string"
    && value.hostname.length > 0
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && /^[a-f0-9]{64}$/u.test(value.token)
    && typeof value.operation === "string"
    && value.operation.length > 0
    && Number.isFinite(Date.parse(value.acquired_at));
}

async function readLockOwner(lockPath) {
  const lockDetails = lstatIfPresent(lockPath);
  if (lockDetails === null
    || lockDetails.isSymbolicLink()
    || !lockDetails.isFile()
    || realpathSync(lockPath) !== lockPath) {
    return null;
  }
  try {
    const owner = JSON.parse(await readFile(lockPath, "utf8"));
    return validLockOwner(owner) ? owner : null;
  } catch {
    return null;
  }
}

function processIsDead(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }
}

function tombstonePath(artifactDirectory, kind) {
  return path.join(
    artifactDirectory,
    `.evidence-seal.${kind}.${process.pid}.${randomBytes(12).toString("hex")}`,
  );
}

async function publishLockOwnerNoClobber({
  artifactDirectory,
  lockPath,
  owner,
  kind = "claim",
}) {
  const temporaryPath = tombstonePath(artifactDirectory, kind);
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(owner, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    try {
      await link(temporaryPath, lockPath);
      return true;
    } catch (error) {
      if (error?.code === "EEXIST") return false;
      throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function lockOwner(operation) {
  return {
    schema_version: LOCK_SCHEMA_VERSION,
    hostname: hostname(),
    pid: process.pid,
    token: randomBytes(32).toString("hex"),
    operation,
    acquired_at: new Date().toISOString(),
  };
}

async function releasePhase2EvidenceLock(lock) {
  const currentOwner = await readLockOwner(lock.lockPath);
  if (currentOwner?.token !== lock.owner.token) {
    throw new Error(
      "Phase 2 evidence seal lock owner token changed; refusing to remove the lock.",
    );
  }
  const tombstone = tombstonePath(lock.artifactDirectory, lock.releaseKind);
  await rename(lock.lockPath, tombstone);
  const claimedOwner = await readLockOwner(tombstone);
  if (claimedOwner?.token !== lock.owner.token) {
    throw new Error(
      "Phase 2 evidence seal lock owner token changed during release; refusing removal.",
    );
  }
  await rm(tombstone);
}

async function runWithPhase2EvidenceLock(lock, callback) {
  let result;
  let primaryError;
  try {
    result = await callback();
  } catch (error) {
    primaryError = error;
  }
  let releaseError;
  try {
    await releasePhase2EvidenceLock(lock);
  } catch (error) {
    releaseError = error;
  }
  if (primaryError !== undefined && releaseError !== undefined) {
    throw new AggregateError(
      [primaryError, releaseError],
      "Phase 2 evidence operation and lock release both failed.",
      { cause: primaryError },
    );
  }
  if (primaryError !== undefined) throw primaryError;
  if (releaseError !== undefined) throw releaseError;
  return result;
}

async function reclaimDeadLock({
  lockPath,
  artifactDirectory,
  owner,
  afterRecoveryLockAcquired = async () => undefined,
}) {
  const recoveryPath = path.join(artifactDirectory, RECOVERY_LOCK_NAME);
  const recoveryOwner = lockOwner("recover-stale-evidence-lock");
  if (!await publishLockOwnerNoClobber({
    artifactDirectory,
    lockPath: recoveryPath,
    owner: recoveryOwner,
    kind: "recovery-claim",
  })) {
    throw new Error(
      "Phase 2 evidence seal recovery lock is held or requires manual cleanup.",
    );
  }
  return runWithPhase2EvidenceLock({
    artifactDirectory,
    lockPath: recoveryPath,
    owner: recoveryOwner,
    releaseKind: "recovery-release",
  }, async () => {
    await afterRecoveryLockAcquired();
    const currentOwner = await readLockOwner(lockPath);
    if (currentOwner === null) {
      if (lstatIfPresent(lockPath) === null) return false;
      throw new Error(
        "Phase 2 evidence seal lock ownership became unknown during recovery.",
      );
    }
    if (currentOwner.token !== owner.token) return false;
    if (currentOwner.hostname !== hostname()
      || !processIsDead(currentOwner.pid)) {
      return false;
    }
    const tombstone = tombstonePath(artifactDirectory, "stale");
    try {
      await rename(lockPath, tombstone);
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw new Error(
        `Phase 2 evidence seal lock could not be claimed safely: ${error.message}`,
      );
    }
    const claimedOwner = await readLockOwner(tombstone);
    if (claimedOwner?.token !== owner.token) {
      throw new Error(
        "Phase 2 evidence seal lock ownership changed while claiming a stale lock; refusing removal.",
      );
    }
    await rm(tombstone);
    return true;
  });
}

async function acquirePhase2EvidenceSealLock({
  root,
  operation,
  afterReadContendedOwner = async () => undefined,
  afterRecoveryLockAcquired = async () => undefined,
}) {
  if (typeof operation !== "string" || operation.length === 0) {
    throw new Error("Phase 2 evidence seal lock operation is required.");
  }
  const { artifactDirectory } = resolveArtifactBoundary(root);
  const lockPath = path.join(artifactDirectory, SEAL_LOCK_NAME);
  const recoveryPath = path.join(artifactDirectory, RECOVERY_LOCK_NAME);
  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    if (lstatIfPresent(recoveryPath) !== null) {
      throw new Error(
        "Phase 2 evidence seal recovery lock is held or requires manual cleanup.",
      );
    }
    const owner = lockOwner(operation);
    if (await publishLockOwnerNoClobber({
      artifactDirectory,
      lockPath,
      owner,
    })) {
      if (lstatIfPresent(recoveryPath) !== null) {
        await releasePhase2EvidenceLock({
          artifactDirectory,
          lockPath,
          owner,
          releaseKind: "contended-release",
        });
        throw new Error(
          "Phase 2 evidence seal recovery lock is held or requires manual cleanup.",
        );
      }
      return { artifactDirectory, lockPath, owner };
    }

    const existingOwner = await readLockOwner(lockPath);
    if (existingOwner === null) {
      throw new Error(
        "Phase 2 evidence seal lock ownership is unknown; refusing to remove or wait.",
      );
    }
    await afterReadContendedOwner(existingOwner);
    if (existingOwner.hostname !== hostname()
      || !processIsDead(existingOwner.pid)) {
      throw new Error(
        `Phase 2 evidence seal lock is held by ${existingOwner.operation}; refusing to wait.`,
      );
    }
    await reclaimDeadLock({
      lockPath,
      artifactDirectory,
      owner: existingOwner,
      afterRecoveryLockAcquired,
    });
  }
  throw new Error(
    "Phase 2 evidence seal lock remained contended after bounded stale-lock recovery.",
  );
}

export async function withPhase2EvidenceSealLock(
  {
    root = process.cwd(),
    operation,
    afterReadContendedOwner,
    afterRecoveryLockAcquired,
  },
  callback,
) {
  const lock = await acquirePhase2EvidenceSealLock({
    root,
    operation,
    afterReadContendedOwner,
    afterRecoveryLockAcquired,
  });
  return runWithPhase2EvidenceLock({
    ...lock,
    releaseKind: "release",
  }, callback);
}
