import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createReleaseCandidateManifest,
  serializeReleaseCandidateManifest,
  validateReleaseCandidateBundle,
} from "./create-release-candidate-manifest.mjs";
import {
  executeReleasePromotionVerifier,
} from "./verify-release-promotion.mjs";
import {
  validateReleaseMatrixScripts,
} from "./release-matrix-contract.mjs";
import {
  appendReleaseSigningProperties,
  configureReleaseSigning,
} from "./configure-release-signing.mjs";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_DIGEST = "a".repeat(64);
const TOOLCHAIN = Object.freeze({
  node: "24.19.0",
  npm: "11.17.0",
  java: "17.0.20+8",
  android_api: 36,
  build_tools: "36.0.0",
  ndk: "27.1.12297006",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function writeZip(zipPath, entries) {
  const inputDirectory = mkdtempSync(path.join(os.tmpdir(), "gym-tracker-release-input-"));
  try {
    for (const [entryPath, contents] of Object.entries(entries)) {
      const output = path.join(inputDirectory, entryPath);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, contents);
    }
    execFileSync("zip", ["-q", "-r", zipPath, "."], { cwd: inputDirectory });
  } finally {
    rmSync(inputDirectory, { force: true, recursive: true });
  }
}

function createBundle() {
  const bundleDirectory = mkdtempSync(path.join(os.tmpdir(), "gym-tracker-release-bundle-"));
  writeJson(path.join(bundleDirectory, "release-config.json"), {
    android: { package: "com.fchoo.gymtracker", versionCode: 1 },
    version: "0.1.0",
    extra: { buildProfile: "production", nativeContractsEnabled: false },
  });
  writeJson(path.join(bundleDirectory, "release-toolchain.json"), TOOLCHAIN);
  writeZip(path.join(bundleDirectory, "gym-tracker-release.apk"), {
    "assets/index.android.bundle": "synthetic-apk-bundle",
    "assets/app.config": JSON.stringify({ android: { package: "com.fchoo.gymtracker", versionCode: 1 }, version: "0.1.0", extra: { buildProfile: "production", nativeContractsEnabled: false } }),
  });
  writeZip(path.join(bundleDirectory, "gym-tracker-release.aab"), {
    "base/assets/index.android.bundle": "synthetic-aab-bundle",
    "base/assets/app.config": JSON.stringify({ android: { package: "com.fchoo.gymtracker", versionCode: 1 }, version: "0.1.0", extra: { buildProfile: "production", nativeContractsEnabled: false } }),
  });
  return bundleDirectory;
}

function writeCandidateManifest(bundleDirectory) {
  const manifest = createReleaseCandidateManifest({
    bundleDirectory,
    candidateId: "candidate-001",
    sourceCommit: SOURCE_COMMIT,
    sourceTreeSha256: SOURCE_DIGEST,
    retainedArtifactName: "release-candidate-candidate-001",
    workflowRepository: "owner/gym-tracker",
    workflowRunId: "12345",
  });
  writeFileSync(
    path.join(bundleDirectory, "release-candidate.json"),
    serializeReleaseCandidateManifest(manifest),
  );
  return validateReleaseCandidateBundle({ bundleDirectory });
}

function writeApprovedReview(bundleDirectory, candidate, overrides = {}) {
  const review = {
    schema_version: 1,
    candidate_id: candidate.manifest.candidate_id,
    manifest_sha256: candidate.manifest_sha256,
    source: candidate.manifest.source,
    artifacts: candidate.manifest.artifacts,
    attended_evidence_sha256: "b".repeat(64),
    owner_token: "approved",
    ...overrides,
  };
  const reviewPath = path.join(bundleDirectory, "physical-review.json");
  writeJson(reviewPath, review);
  return reviewPath;
}

function withBundle(run) {
  const bundleDirectory = createBundle();
  try {
    return run(bundleDirectory);
  } finally {
    rmSync(bundleDirectory, { force: true, recursive: true });
  }
}

test("candidate manifest validates exact raw and inner artifact bytes", () => {
  withBundle((bundleDirectory) => {
    const candidate = writeCandidateManifest(bundleDirectory);
    assert.equal(candidate.manifest.candidate_id, "candidate-001");
    assert.equal(candidate.manifest.artifacts.length, 2);
    assert.equal(
      candidate.manifest_sha256,
      sha256(readFileSync(path.join(bundleDirectory, "release-candidate.json"))),
    );
  });
});

test("candidate manifest rejects an altered nested artifact while raw archive still exists", () => {
  withBundle((bundleDirectory) => {
    writeCandidateManifest(bundleDirectory);
    writeZip(path.join(bundleDirectory, "gym-tracker-release.apk"), {
      "assets/index.android.bundle": "substituted-bundle",
      "assets/app.config": JSON.stringify({ android: { package: "com.fchoo.gymtracker", versionCode: 1 }, version: "0.1.0", extra: { buildProfile: "production", nativeContractsEnabled: false } }),
    });
    assert.throws(
      () => validateReleaseCandidateBundle({ bundleDirectory }),
      /candidate bytes do not match/u,
    );
  });
});

test("candidate manifest rejects APK, AAB, config, package, and profile mutation", () => {
  for (const mutate of [
    (directory) => writeFileSync(path.join(directory, "gym-tracker-release.apk"), "changed-apk"),
    (directory) => writeFileSync(path.join(directory, "gym-tracker-release.aab"), "changed-aab"),
    (directory) => writeJson(path.join(directory, "release-config.json"), {
      android: { package: "com.fchoo.gymtracker", versionCode: 1 },
      version: "0.1.1",
      extra: { buildProfile: "production", nativeContractsEnabled: false },
    }),
    (directory) => writeJson(path.join(directory, "release-config.json"), {
      android: { package: "com.fchoo.gymtracker.devtest", versionCode: 1 },
      version: "0.1.0",
      extra: { buildProfile: "production", nativeContractsEnabled: false },
    }),
    (directory) => writeJson(path.join(directory, "release-config.json"), {
      android: { package: "com.fchoo.gymtracker", versionCode: 1 },
      version: "0.1.0",
      extra: { buildProfile: "development-test", nativeContractsEnabled: true },
    }),
  ]) {
    withBundle((bundleDirectory) => {
      writeCandidateManifest(bundleDirectory);
      mutate(bundleDirectory);
      assert.throws(() => validateReleaseCandidateBundle({ bundleDirectory }),
        /candidate|production|bytes|inner/iu);
    });
  }
});

test("candidate manifest rejects profile and package substitution inside canonical manifest", () => {
  for (const mutate of [
    (manifest) => ({ ...manifest, build: { ...manifest.build, profile: "development-test" } }),
    (manifest) => ({ ...manifest, source: { ...manifest.source, package: "com.fchoo.gymtracker.devtest" } }),
  ]) {
    withBundle((bundleDirectory) => {
      const candidate = writeCandidateManifest(bundleDirectory);
      writeFileSync(
        path.join(bundleDirectory, "release-candidate.json"),
        serializeReleaseCandidateManifest(mutate(candidate.manifest)),
      );
      assert.throws(() => validateReleaseCandidateBundle({ bundleDirectory }),
        /candidate|build|source|production/iu);
    });
  }
});

test("candidate manifest rejects noncanonical JSON and extra fields", () => {
  withBundle((bundleDirectory) => {
    const candidate = writeCandidateManifest(bundleDirectory);
    writeJson(path.join(bundleDirectory, "release-candidate.json"), {
      ...candidate.manifest,
      unexpected: true,
    });
    assert.throws(
      () => validateReleaseCandidateBundle({ bundleDirectory }),
      /candidate manifest is malformed/u,
    );
  });
});

test("legacy promotion rejects digest-only approved candidate records", () => {
  withBundle((bundleDirectory) => {
    const candidate = writeCandidateManifest(bundleDirectory);
    const reviewPath = writeApprovedReview(bundleDirectory, candidate);
    assert.throws(() => executeReleasePromotionVerifier([
      "--bundle-dir", bundleDirectory,
      "--physical-review", reviewPath,
      "--release-tag", "v1.0.0",
    ]), /digest-only|Phase 5 attended/iu);
  });
});

test("promotion rejects wrong owner token, stale manifest, source drift, and artifact substitution", () => {
  for (const overrides of [
    { owner_token: "Approved" },
    { manifest_sha256: "c".repeat(64) },
    {
      source: {
        commit: SOURCE_COMMIT,
        tree_sha256: "d".repeat(64),
        config_sha256: "e".repeat(64),
        package: "com.fchoo.gymtracker",
      },
    },
    { artifacts: [] },
  ]) {
    withBundle((bundleDirectory) => {
      const candidate = writeCandidateManifest(bundleDirectory);
      const reviewPath = writeApprovedReview(bundleDirectory, candidate, overrides);
      assert.throws(
        () => executeReleasePromotionVerifier([
          "--bundle-dir", bundleDirectory,
          "--physical-review", reviewPath,
          "--release-tag", "v1.0.0",
        ]),
        /digest-only|physical review/u,
      );
    });
  }
});

test("promotion rejects malformed release tags and handwritten noncanonical review records", () => {
  withBundle((bundleDirectory) => {
    const candidate = writeCandidateManifest(bundleDirectory);
    const reviewPath = writeApprovedReview(bundleDirectory, candidate);
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").trimEnd() + "\n\n");
    assert.throws(
      () => executeReleasePromotionVerifier([
        "--bundle-dir", bundleDirectory,
        "--physical-review", reviewPath,
        "--release-tag", "1.0.0",
      ]),
      /promotion verifier requires/u,
    );
    assert.throws(
      () => executeReleasePromotionVerifier([
        "--bundle-dir", bundleDirectory,
        "--physical-review", reviewPath,
        "--release-tag", "v1.0.0",
      ]),
      /digest-only|not canonical/u,
    );
  });
});

test("release signing patch replaces only the release build config", () => {
  const source = [
    "android {",
    "    signingConfigs {",
    "        debug { storeFile file('debug.keystore') }",
    "    }",
    "    buildTypes {",
    "        debug { signingConfig signingConfigs.debug }",
    "        release { signingConfig signingConfigs.debug }",
    "    }",
    "}",
  ].join("\n");
  const configured = configureReleaseSigning(source);
  assert.match(configured, /release \{\n            storeFile file\(RELEASE_STORE_FILE\)/u);
  assert.equal((configured.match(/signingConfig signingConfigs\.debug/g) ?? []).length, 1);
  assert.equal((configured.match(/signingConfig signingConfigs\.release/g) ?? []).length, 1);
});

test("release signing properties preserve a record boundary when Expo omits the final newline", () => {
  const configured = appendReleaseSigningProperties(
    "expo.useLegacyPackaging=false\nexpo.sqlite.enableFTS=true",
    {
      RELEASE_STORE_FILE: "/tmp/release.keystore",
      RELEASE_STORE_PASSWORD: "store-password",
      RELEASE_KEY_ALIAS: "release",
      RELEASE_KEY_PASSWORD: "key-password",
    },
  );

  assert.equal(
    configured,
    [
      "expo.useLegacyPackaging=false",
      "expo.sqlite.enableFTS=true",
      "RELEASE_STORE_FILE=/tmp/release.keystore",
      "RELEASE_STORE_PASSWORD=store-password",
      "RELEASE_KEY_ALIAS=release",
      "RELEASE_KEY_PASSWORD=key-password",
      "",
    ].join("\n"),
  );
});

test("release workflows contain a private build-once candidate path and no-rebuild promotion path", () => {
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const candidateWorkflow = readFileSync(path.join(projectRoot, ".github/workflows/release-candidate.yml"), "utf8");
  const promotionWorkflow = readFileSync(path.join(projectRoot, ".github/workflows/release-promotion.yml"), "utf8");
  const nightlyWorkflow = readFileSync(path.join(projectRoot, ".github/workflows/nightly.yml"), "utf8");
  assert.match(candidateWorkflow, /private candidate artifact/u);
  assert.match(candidateWorkflow, /create-release-candidate-manifest/u);
  assert.match(candidateWorkflow, /retention-days: 30/u);
  assert.match(candidateWorkflow, /id-token: none/u);
  assert.match(promotionWorkflow, /verify:attended:phase5/u);
  assert.match(promotionWorkflow, /gh run download/u);
  assert.equal(promotionWorkflow.includes('--target "${CANDIDATE_COMMIT}"'), true);
  assert.doesNotMatch(promotionWorkflow, /expo (?:prebuild|run)|gradlew|assembleRelease|eas build/u);
  for (const script of [
    "test:sqlite:host",
    "test:coverage",
    "test:release-matrix",
  ]) {
    assert.match(nightlyWorkflow, new RegExp(script, "u"));
  }
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(validateReleaseMatrixScripts(packageJson).count > 0, true);
});
