import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
  configureReleaseSigning,
} from "./configure-release-signing.mjs";
import {
  classifyReleasePublicationState,
  validateReleaseAssetState,
  validatePromotionWorkflowContract,
  validatePhase6N4PromotionInputValues,
} from "./phase5-promotion-contract.mjs";
import {
  validateTerminalSealDocument,
} from "./phase5-terminal-seal-contract.mjs";
import {
  loadAndValidateLivePhase5Promotion,
  parsePhase5ReleaseGateArguments,
  validateLivePhase5Promotion,
  validatePromotionDeploymentProvenance,
  validatePhase6N4ReleaseBinding,
} from "./verify-phase5-release-gate.mjs";
import {
  createPhase5PromotionProof,
  executePhase5PromotionProof,
  parsePhase5PromotionProofArguments,
  serializePhase5PromotionProof,
  validatePhase5PromotionProof,
} from "./record-phase5-promotion-proof.mjs";
import { parsePhase6AttendedChecklistArguments } from "./generate-phase6-attended-checklist.mjs";

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

test("release build passes signing secrets as Gradle project environment properties", () => {
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const buildScript = readFileSync(path.join(projectRoot, "scripts/build-release-candidate-once.sh"), "utf8");

  assert.doesNotMatch(buildScript, /cat >> android\/gradle\.properties/u);
  assert.equal(buildScript.includes('ORG_GRADLE_PROJECT_RELEASE_STORE_FILE="$RELEASE_KEYSTORE_PATH"'), true);
  assert.equal(buildScript.includes('ORG_GRADLE_PROJECT_RELEASE_STORE_PASSWORD="$RELEASE_KEYSTORE_PASSWORD"'), true);
  assert.equal(buildScript.includes('ORG_GRADLE_PROJECT_RELEASE_KEY_ALIAS="$RELEASE_KEY_ALIAS"'), true);
  assert.equal(buildScript.includes('ORG_GRADLE_PROJECT_RELEASE_KEY_PASSWORD="$RELEASE_KEY_PASSWORD"'), true);
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
  assert.match(promotionWorkflow, /generate-phase5-attended-checklist\.mjs verify/u);
  assert.match(promotionWorkflow, /actions\/download-artifact/u);
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

test("release promotion requires the exact Phase 6 N4 upload run and canonical record digest", () => {
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const promotionWorkflow = readFileSync(
    path.join(projectRoot, ".github/workflows/release-promotion.yml"),
    "utf8",
  );

  assert.doesNotThrow(() => validatePhase6N4PromotionInputValues({
    phase6N4RunId: "789",
    phase6N4ArtifactName: "phase6-n4-evidence-candidate-001-789",
    phase6N4RecordSha256: "b".repeat(64),
    distinctRunIds: ["123", "456"],
  }));
  for (const invalid of [
    { phase6N4RunId: undefined },
    { phase6N4RunId: "456" },
    { phase6N4ArtifactName: "../phase6" },
    { phase6N4RecordSha256: "not-a-digest" },
  ]) {
    assert.throws(() => validatePhase6N4PromotionInputValues({
      phase6N4RunId: "789",
      phase6N4ArtifactName: "phase6-n4-evidence-candidate-001-789",
      phase6N4RecordSha256: "b".repeat(64),
      distinctRunIds: ["123", "456"],
      ...invalid,
    }), /promotion input|release tag/iu);
  }

  assert.doesNotThrow(() => validatePromotionWorkflowContract(promotionWorkflow));
  for (const expected of [
    "phase6_evidence_run_id:",
    "phase6_evidence_artifact_name:",
    "phase6_n4_record_sha256:",
    '.path == ".github/workflows/release-human-evidence-upload.yml"',
    'verify_deployment_provenance "${PHASE6_N4_RUN_ID}" "${phase6_n4_run_attempt}" "${CANDIDATE_COMMIT}" "${phase6_n4_ref}" "private-release-observation-upload"',
    'artifact-ids: ${{ steps.selected.outputs.phase6_n4_artifact_id }}',
    'test "${GITHUB_SHA}" = "${CANDIDATE_COMMIT}"',
    'test "${GITHUB_REF_NAME}" = "main"',
    "node workflow-source/scripts/generate-phase6-attended-checklist.mjs verify",
    '--phase6-n4-record retained-candidate/evidence/phase6-n4-upload/phase6/attended-record.json',
    '--phase6-n4-run-id "${PHASE6_N4_RUN_ID}"',
    '--phase6-n4-artifact-name "${PHASE6_N4_ARTIFACT_NAME}"',
    '--phase6-n4-record-sha256 "${PHASE6_N4_RECORD_SHA256}"',
  ]) {
    assert.ok(promotionWorkflow.includes(expected), `promotion is missing ${expected}`);
  }
  assert.match(
    promotionWorkflow,
    /printf '%s  %s\\n' "\$\{PHASE6_N4_RECORD_SHA256\}"[\s\S]*?retained-candidate\/evidence\/phase6-n4-upload\/phase6\/attended-record\.json \| sha256sum --check/u,
  );
  assert.match(
    promotionWorkflow,
    /node workflow-source\/scripts\/generate-phase6-attended-checklist\.mjs verify[\s\S]*--record retained-candidate\/evidence\/phase6-n4-upload\/phase6\/attended-record\.json/u,
  );
  const phase6Replay = parsePhase6AttendedChecklistArguments([
    "verify",
    "--bundle-dir", "retained-candidate",
    "--manifest-sha256", SOURCE_DIGEST,
    "--checklist", "retained-candidate/evidence/phase6-n4-upload/phase6/checklist.json",
    "--observations", "retained-candidate/evidence/phase6-n4-upload/phase6/observations.json",
    "--evidence-dir", "retained-candidate/evidence/phase6-n4-upload/phase6",
    "--record", "retained-candidate/evidence/phase6-n4-upload/phase6/attended-record.json",
  ]);
  const bundleRoot = path.resolve(phase6Replay.bundleDirectory);
  for (const value of [
    phase6Replay.checklist,
    phase6Replay.observations,
    phase6Replay.evidenceDirectory,
    phase6Replay.record,
  ]) {
    assert.equal(path.resolve(value).startsWith(`${bundleRoot}${path.sep}`), true);
  }
  for (const expected of [
    'gh api --method POST "repos/${GITHUB_REPOSITORY}/git/refs"',
    "name: Atomically reserve immutable release tag\n        if: steps.publication_state.outputs.publication_state == 'fresh'\n        env:\n          GH_TOKEN: ${{ github.token }}\n        run: |\n          set -euo pipefail",
    '-f ref="refs/tags/${RELEASE_TAG}"',
    '-f sha="${CANDIDATE_COMMIT}"',
    'gh api "repos/${GITHUB_REPOSITORY}/git/ref/tags/${RELEASE_TAG}"',
    '.ref == ("refs/tags/" + $tag)',
    '.object.type == "commit"',
    '.object.sha == $commit',
    '--verify-tag',
    '.tag_name == $tag',
    '.draft == true',
  ]) {
    assert.ok(promotionWorkflow.includes(expected), `atomic tag flow is missing ${expected}`);
  }
  const phase6ArtifactValidation = promotionWorkflow.slice(
    promotionWorkflow.indexOf(
      'jq -e --argjson run_id "${PHASE6_N4_RUN_ID}" --arg commit',
    ),
    promotionWorkflow.indexOf('<<<"${phase6_n4_artifacts}" >/dev/null')
      + '<<<"${phase6_n4_artifacts}" >/dev/null'.length,
  );
  for (const predicate of [
    '.name == $name',
    '.expired == false',
    '.workflow_run.id == $run_id',
    '.workflow_run.head_sha == $commit',
    '| length == 1',
  ]) {
    assert.ok(phase6ArtifactValidation.includes(predicate));
  }
  const trustedReplay = promotionWorkflow.indexOf(
    "node workflow-source/scripts/generate-phase6-attended-checklist.mjs verify",
  );
  const trustedPhase5Replay = promotionWorkflow.indexOf(
    "node workflow-source/scripts/generate-phase5-attended-checklist.mjs verify",
  );
  const candidateVerifier = trustedPhase5Replay;
  const publication = promotionWorkflow.indexOf("gh release create");
  assert.equal(trustedReplay >= 0, true);
  assert.equal(
    trustedReplay < trustedPhase5Replay
      && trustedPhase5Replay === candidateVerifier
      && candidateVerifier < publication,
    true,
  );
  const tagCreate = promotionWorkflow.indexOf(
    'gh api --method POST "repos/${GITHUB_REPOSITORY}/git/refs"',
  );
  const releaseCreate = promotionWorkflow.indexOf('gh release create "${RELEASE_TAG}"');
  const publicAssetCheck = promotionWorkflow.indexOf(
    "name: Verify public release asset hashes",
  );
  const releaseIdentityCheck = promotionWorkflow.indexOf(
    ".tag_name == $tag", publicAssetCheck,
  );
  const publishDraft = promotionWorkflow.indexOf("gh release edit");
  assert.equal(
    candidateVerifier < tagCreate
      && tagCreate < releaseCreate
      && releaseCreate < publicAssetCheck
      && publicAssetCheck < releaseIdentityCheck
      && releaseIdentityCheck < publishDraft,
    true,
  );
  for (const mutation of [
    promotionWorkflow.replace(
      '.path == ".github/workflows/release-human-evidence-upload.yml"',
      '.path == ".github/workflows/release-candidate.yml"',
    ),
    promotionWorkflow.replace(
      phase6ArtifactValidation,
      phase6ArtifactValidation.replace(
        '.workflow_run.id == $run_id and .workflow_run.head_sha == $commit',
        'true',
      ),
    ),
    promotionWorkflow.replace(
      'retained-candidate/evidence/phase6-n4-upload/phase6/attended-record.json | sha256sum --check',
      'retained-candidate/evidence/phase6-n4-upload/phase6/attended-record.json',
    ),
    promotionWorkflow.replace(
      'gh api --method POST "repos/${GITHUB_REPOSITORY}/git/refs"',
      'true',
    ),
    promotionWorkflow.replace("--verify-tag", ""),
    promotionWorkflow.replaceAll(".tag_name == $tag", "true"),
  ]) {
    assert.throws(
      () => validatePromotionWorkflowContract(mutation),
      /Phase 6|N4|trusted|provenance|artifact|hash|source|tag|draft|release/iu,
    );
  }
  for (const mutation of [
    promotionWorkflow.replace("tag_ref=$(jq -cr", "tag_ref=$(jq -cer"),
    promotionWorkflow.replace("publication_state=fresh", "publication_state=new"),
    promotionWorkflow.replace("publication_state=tag_reserved", "publication_state=reserved"),
    promotionWorkflow.replace(
      'if .draft then "draft" else "published" end',
      'if .draft then "pending" else "complete" end',
    ),
    promotionWorkflow.replace("fresh|tag_reserved)", "fresh)"),
    promotionWorkflow.replace(/^\s*draft\)$/mu, "            pending)"),
    promotionWorkflow.replace(/^\s*published\)$/mu, "            complete)"),
    promotionWorkflow.replace("if jq -e '.draft == true'", "if jq -e '.draft == false'"),
    promotionWorkflow.replace("gh release upload", "true # release upload removed"),
  ]) {
    assert.notEqual(mutation, promotionWorkflow);
    assert.throws(
      () => validatePromotionWorkflowContract(mutation),
      /publication|state|draft|release|asset|null/iu,
    );
  }
});

test("release publication resumes only exact tag, draft, and published states", () => {
  const releaseTag = "v1.0.0";
  const candidateCommit = SOURCE_COMMIT;
  const candidateRunId = "12345";
  const tagRef = {
    ref: `refs/tags/${releaseTag}`,
    object: { type: "commit", sha: candidateCommit },
  };
  const draft = {
    id: 42,
    tag_name: releaseTag,
    name: `Gym Tracker ${releaseTag}`,
    body: `Candidate run: ${candidateRunId}`,
    draft: true,
    prerelease: false,
  };
  const classify = (overrides = {}) => classifyReleasePublicationState({
    tagRef: null, release: null, releaseTag, candidateCommit, candidateRunId, ...overrides,
  });

  assert.equal(classify(), "fresh");
  assert.equal(classify({ tagRef }), "tag_reserved");
  assert.equal(classify({ tagRef, release: draft }), "draft");
  assert.equal(classify({ tagRef, release: { ...draft, draft: false } }), "published");
  for (const overrides of [
    { tagRef: { ...tagRef, object: { type: "commit", sha: "f".repeat(40) } } },
    { release: draft },
    { tagRef, release: { ...draft, name: "Other release" } },
    { tagRef, release: { ...draft, body: "Candidate run: 99999" } },
    { tagRef, release: { ...draft, prerelease: true } },
    { tagRef, release: { ...draft, draft: "true" } },
  ]) {
    assert.throws(() => classify(overrides), /release|tag|mismatch/iu);
  }

  const expectedAssets = [
    { file: "gym-tracker-release.aab", sha256: "a".repeat(64), size_bytes: 2 },
    { file: "gym-tracker-release.apk", sha256: "b".repeat(64), size_bytes: 1 },
  ];
  const actualAssets = expectedAssets.map((asset, index) => ({
    id: 50 + index, name: asset.file, size: asset.size_bytes,
    digest: `sha256:${asset.sha256}`,
  }));
  assert.deepEqual(validateReleaseAssetState({
    actualAssets: [], expectedAssets, publicationState: "fresh",
  }), expectedAssets.map(({ file }) => file));
  assert.throws(() => validateReleaseAssetState({
    actualAssets: actualAssets.slice(0, 1), expectedAssets, publicationState: "tag_reserved",
  }), /without a draft|asset/iu);
  assert.deepEqual(validateReleaseAssetState({
    actualAssets: actualAssets.slice(0, 1), expectedAssets, publicationState: "draft",
  }), ["gym-tracker-release.apk"]);
  assert.deepEqual(validateReleaseAssetState({
    actualAssets, expectedAssets, publicationState: "draft",
  }), []);
  assert.deepEqual(validateReleaseAssetState({
    actualAssets, expectedAssets, publicationState: "published",
  }), []);
  assert.throws(() => validateReleaseAssetState({
    actualAssets: actualAssets.slice(0, 1), expectedAssets, publicationState: "published",
  }), /published|incomplete/iu);
  for (const substituted of [
    [{ ...actualAssets[0], digest: `sha256:${"c".repeat(64)}` }],
    [{ ...actualAssets[0], name: "unexpected.apk" }],
    [actualAssets[0], { ...actualAssets[0] }],
  ]) {
    assert.throws(() => validateReleaseAssetState({
      actualAssets: substituted, expectedAssets, publicationState: "draft",
    }), /asset|mismatch/iu);
  }
});

test("release promotion separates read-only validation from code-free publication", () => {
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const workflow = readFileSync(
    path.join(projectRoot, ".github/workflows/release-promotion.yml"),
    "utf8",
  );
  const validationStart = workflow.indexOf("  validate:");
  const publishStart = workflow.indexOf("  publish:");
  const proofStart = workflow.indexOf("  record-proof:");
  assert.equal(validationStart >= 0 && validationStart < publishStart, true);
  assert.equal(publishStart < proofStart, true);
  const validation = workflow.slice(validationStart, publishStart);
  const publish = workflow.slice(publishStart, proofStart);
  const proof = workflow.slice(proofStart);

  assert.match(validation, /permissions:\n\s+actions: read\n\s+contents: read\n\s+deployments: read\n\s+id-token: none/u);
  assert.doesNotMatch(validation, /contents:\s*write|public-release-promotion/u);
  assert.doesNotMatch(validation, /npm run|node scripts\//u);
  assert.match(validation, /node workflow-source\/scripts\/generate-phase6-attended-checklist\.mjs/u);
  assert.match(validation, /node workflow-source\/scripts\/generate-phase5-attended-checklist\.mjs/u);
  assert.match(validation, /release-validation\.json/u);
  assert.match(validation, /jq -S -n/u);
  assert.match(validation, /id:\s*validation_artifact/u);
  assert.match(validation, /name:\s*Remove unsealed validation inputs[\s\S]*rm -rf retained-candidate attended-evidence/u);
  assert.match(validation, /name:\s*Seal validated release inputs[\s\S]*find sealed-release-validation -mindepth 1 ! -type f ! -type d[\s\S]*find sealed-release-validation -type l/iu);
  for (const phase6File of [
    "checklist.json", "observations.json", "N4-01.png", "N4-02.png",
    "N4-03.png", "N4-04.png", "attended-record.json",
  ]) {
    const escapedPhase6File = phase6File.replace(".", "\\.");
    assert.match(validation, new RegExp(
      "cp -P retained-candidate/evidence/phase6-n4-upload/phase6/"
        + escapedPhase6File + " sealed-release-validation/candidate/evidence/phase6/"
        + escapedPhase6File,
      "u",
    ));
  }
  assert.doesNotMatch(validation, /gh run download/iu);
  for (const output of [
    "candidate_artifact_id", "candidate_artifact_digest",
    "attended_artifact_id", "attended_artifact_digest",
    "phase6_n4_artifact_id", "phase6_n4_artifact_digest",
  ]) {
    assert.match(validation, new RegExp(`${output}=`, "u"));
  }
  assert.equal((validation.match(/artifact-ids:\s*\$\{\{ steps\.selected\.outputs\./gu) ?? []).length, 3);
  assert.match(validation, /verify_selected_artifact[\s\S]*\.id == \$artifact_id[\s\S]*\.digest == \$digest[\s\S]*\.workflow_run\.id == \$run_id[\s\S]*\.workflow_run\.head_sha == \$commit/u);
  assert.throws(
    () => validatePromotionWorkflowContract(workflow.replace(
      /artifact-ids:\s*\$\{\{ steps\.selected\.outputs\.candidate_artifact_id \}\}/u,
      'name: "private-release-candidate-${CANDIDATE_ID}"',
    )),
    /artifact ID|selected artifact|download/iu,
  );

  assert.match(publish, /needs:\s*validate/u);
  assert.match(publish, /permissions:\n\s+actions: read\n\s+contents: write\n\s+deployments: read\n\s+id-token: none/u);
  assert.match(publish, /environment:[\s\S]*name:\s*public-release-promotion/u);
  assert.doesNotMatch(publish, /actions\/checkout|npm(?:\s|$)|node\s+["']?(?:scripts|workflow-source)\//u);
  assert.doesNotMatch(publish, /git ls-remote/iu);
  assert.match(publish, /actions\/download-artifact@[^\n]+[\s\S]*artifact-ids:\s*\$\{\{ needs\.validate\.outputs\.validation_artifact_id \}\}[\s\S]*merge-multiple:\s*true/u);
  const publishStep = publish.slice(publish.indexOf("name: Publish hash-verified draft"));
  assert.match(publishStep, /release=\$\(gh api[\s\S]*releases\/tags[\s\S]*current_release_assets=\$\(jq -cer/iu);
  assert.match(publishStep, /jq -e --argjson assets "\$\{current_release_assets\}"[\s\S]*\.digest == \("sha256:" \+ \$expected\.sha256\)/u);
  assert.doesNotMatch(publishStep, /\$\{release_assets\}/u);
  assert.match(publish, /\.id == \$artifact_id[\s\S]*\.workflow_run\.id == \$run_id[\s\S]*\.workflow_run\.head_sha == \$commit[\s\S]*\.name == \$name[\s\S]*\.digest == \("sha256:" \+ \$digest\)/u);
  assert.match(publish, /find sealed-release-validation -type l[\s\S]*= "0"/u);
  assert.match(publish, /find sealed-release-validation -mindepth 1 ! -type f ! -type d[\s\S]*= "0"/u);
  assert.match(publish, /find sealed-release-validation -mindepth 1 -type f[\s\S]*= "14"/u);
  assert.match(publish, /find sealed-release-validation -mindepth 1 -type d[\s\S]*= "4"/u);
  assert.match(publish, /test -d sealed-release-validation\/candidate[\s\S]*test -d sealed-release-validation\/attended[\s\S]*test -d sealed-release-validation\/candidate\/evidence\/phase6/u);
  assert.match(publish, /for sealed_file in release-validation\.json[\s\S]*candidate\/release-toolchain\.json[\s\S]*attended\/attended-record\.json[\s\S]*candidate\/evidence\/phase6\/checklist\.json[\s\S]*candidate\/evidence\/phase6\/observations\.json[\s\S]*candidate\/evidence\/phase6\/N4-01\.png[\s\S]*candidate\/evidence\/phase6\/N4-04\.png[\s\S]*candidate\/evidence\/phase6\/attended-record\.json[\s\S]*test -f "sealed-release-validation\/\$\{sealed_file\}"[\s\S]*test ! -L/iu);
  assert.match(publish, /validation_digest="\$\{VALIDATION_ARTIFACT_DIGEST#sha256:\}"[\s\S]*test "\$\{#validation_digest\}" -eq 64/u);
  assert.doesNotMatch(publish, /\$\{#VALIDATION_ARTIFACT_DIGEST#sha256:\}/u);
  assert.doesNotMatch(workflow, /owner_token|OWNER_TOKEN/iu);
  assert.match(validation, /cache-dependency-path:\s*workflow-source\/package-lock\.json/u);
  for (const checkout of workflow.matchAll(/uses:\s*actions\/checkout@[^\n]+([\s\S]*?)(?=\n\s+- name:|\n\s+- uses:|$)/gu)) {
    assert.match(checkout[1], /persist-credentials:\s*false/u);
  }

  assert.match(proof, /permissions:\n\s+actions: read\n\s+contents: read\n\s+deployments: read\n\s+id-token: none/u);
  assert.match(proof, /persist-credentials:\s*false/u);
  assert.match(proof, /node workflow-source\/scripts\/record-phase5-promotion-proof\.mjs/u);
  assert.match(proof, /node workflow-source\/scripts\/generate-phase6-attended-checklist\.mjs verify[\s\S]*--bundle-dir sealed-release-validation\/candidate[\s\S]*--checklist sealed-release-validation\/candidate\/evidence\/phase6\/checklist\.json[\s\S]*--observations sealed-release-validation\/candidate\/evidence\/phase6\/observations\.json[\s\S]*--evidence-dir sealed-release-validation\/candidate\/evidence\/phase6[\s\S]*--record sealed-release-validation\/candidate\/evidence\/phase6\/attended-record\.json/u);
  assert.doesNotMatch(proof, /gh run download/iu);
  assert.match(proof, /releases\/assets\/\$\{asset_id\}/u);
  assert.match(proof, /--attended-record sealed-release-validation\/attended\/attended-record\.json/u);
  assert.match(proof, /--phase6-n4-record sealed-release-validation\/candidate\/evidence\/phase6\/attended-record\.json/u);
  assert.match(proof, /--release-id "\$\{\{ needs\.publish\.outputs\.release_id \}\}"/u);
  assert.match(proof, /git\/ref\/tags\/\$\{RELEASE_TAG\}[\s\S]*\.object\.sha == \$commit/u);
  assert.match(proof, /releases\/tags\/\$\{RELEASE_TAG\}[\s\S]*\.draft == false[\s\S]*\.prerelease == false/u);
  const recordProofStep = proof.slice(
    proof.indexOf("name: Record immutable post-promotion proof"),
    proof.indexOf("name: Upload immutable promotion proof"),
  );
  assert.match(recordProofStep, /git\/ref\/tags\/\$\{RELEASE_TAG\}[\s\S]*\.object\.sha == \$commit/u);
  assert.match(recordProofStep, /releases\/tags\/\$\{RELEASE_TAG\}[\s\S]*\.draft == false[\s\S]*\.prerelease == false/u);
  for (const unsafe of [
    ["contents: read", "contents: write"],
    ["persist-credentials: false", "persist-credentials: true"],
    ["needs: validate", "needs: []"],
    ["node workflow-source/scripts/generate-phase5-attended-checklist.mjs verify", "npm run verify:attended:phase5"],
    ["--bundle-dir sealed-release-validation/candidate", "--bundle-dir sealed-release-validation"],
  ]) {
    assert.throws(
      () => validatePromotionWorkflowContract(workflow.replace(...unsafe)),
      /validation|publication|proof|credential|trusted|permission/iu,
    );
  }
  const unsafeProofIdentity = workflow.replace(
    /(- name: Record immutable post-promotion proof[\s\S]*?\.id == \$release_id\n\s+)and \.tag_name == \$tag/u,
    "$1and true",
  );
  assert.notEqual(unsafeProofIdentity, workflow);
  assert.throws(
    () => validatePromotionWorkflowContract(unsafeProofIdentity),
    /promotion|deployment|publication|proof|trusted|release/iu,
  );
});

test("promotion proof cryptographically binds the exact Phase 6 N4 artifact", () => {
  withBundle((bundleDirectory) => {
    const candidate = writeCandidateManifest(bundleDirectory);
    const publicAssetsDirectory = path.join(bundleDirectory, "public-assets");
    mkdirSync(publicAssetsDirectory);
    for (const { file } of candidate.manifest.artifacts) {
      writeFileSync(
        path.join(publicAssetsDirectory, file),
        readFileSync(path.join(bundleDirectory, file)),
      );
    }
    const phase6N4RecordSha256 = "d".repeat(64);
    const phase6N4RunId = "789";
    const phase6N4ArtifactName = "phase6-n4-evidence-candidate-001-789";
    const releaseId = 42;
    const publicAssetMetadata = candidate.manifest.artifacts.map((artifact, index) => ({
      id: 50 + index, name: artifact.file, size: artifact.size_bytes,
      digest: `sha256:${artifact.sha256}`,
    }));
    const proof = createPhase5PromotionProof({
      candidate,
      candidateRunId: "12345",
      attendedRunId: "456",
      attendedArtifactName: "attended-release-evidence-candidate-001",
      attendedRecordSha256: SOURCE_DIGEST,
      phase6N4RunId,
      phase6N4ArtifactName,
      phase6N4RecordSha256,
      promotionRunId: "999",
      repository: "owner/gym-tracker",
      releaseTag: "v1.0.0",
      releaseId,
      publicationJobAttempt: 1,
      publicAssetMetadata,
      publicAssetsDirectory,
    });
    assert.deepEqual({
      phase6_n4_run_id: proof.phase6_n4_run_id,
      phase6_n4_artifact_name: proof.phase6_n4_artifact_name,
      phase6_n4_record_sha256: proof.phase6_n4_record_sha256,
    }, {
      phase6_n4_run_id: phase6N4RunId,
      phase6_n4_artifact_name: phase6N4ArtifactName,
      phase6_n4_record_sha256: phase6N4RecordSha256,
    });
    assert.equal(proof.workflow.publication_job_attempt, 1);
    for (const publicationJobAttempt of [undefined, 0, 1.5]) {
      assert.throws(() => createPhase5PromotionProof({
        candidate, candidateRunId: "12345", attendedRunId: "456",
        attendedArtifactName: "attended-release-evidence-candidate-001",
        attendedRecordSha256: SOURCE_DIGEST, phase6N4RunId, phase6N4ArtifactName,
        phase6N4RecordSha256, promotionRunId: "999",
        repository: "owner/gym-tracker", releaseTag: "v1.0.0", releaseId,
        publicationJobAttempt, publicAssetMetadata, publicAssetsDirectory,
      }), /promotion proof identity/iu);
    }
    const proofBytes = Buffer.from(serializePhase5PromotionProof(proof));
    assert.doesNotThrow(() => validatePhase5PromotionProof({
      proof,
      proofBytes,
      candidate,
      attendedRecordSha256: SOURCE_DIGEST,
      phase6N4RunId,
      phase6N4ArtifactName,
      phase6N4RecordSha256,
      releaseId,
      publicationJobAttempt: 1,
      publicAssetMetadata,
      publicAssetsDirectory,
    }));
    for (const substitution of [
      { phase6N4RunId: "790" },
      { phase6N4ArtifactName: "phase6-n4-evidence-other-790" },
      { phase6N4RecordSha256: "e".repeat(64) },
    ]) {
      assert.throws(() => validatePhase5PromotionProof({
        proof,
        proofBytes,
        candidate,
        attendedRecordSha256: SOURCE_DIGEST,
        phase6N4RunId,
        phase6N4ArtifactName,
        phase6N4RecordSha256,
        releaseId,
        publicationJobAttempt: 1,
        publicAssetMetadata,
        publicAssetsDirectory,
        ...substitution,
      }), /promotion proof|Phase 6|noncanonical/iu);
    }
    const legacyProof = { ...proof };
    delete legacyProof.phase6_n4_run_id;
    delete legacyProof.phase6_n4_artifact_name;
    delete legacyProof.phase6_n4_record_sha256;
    assert.throws(() => validatePhase5PromotionProof({
      proof: legacyProof,
      proofBytes: Buffer.from(serializePhase5PromotionProof(legacyProof)),
      candidate,
      attendedRecordSha256: SOURCE_DIGEST,
      phase6N4RunId,
      phase6N4ArtifactName,
      phase6N4RecordSha256,
      releaseId,
      publicationJobAttempt: 1,
      publicAssetMetadata,
      publicAssetsDirectory,
    }), /promotion proof|Phase 6|noncanonical/iu);
    const wrongAttemptProof = {
      ...proof, workflow: { ...proof.workflow, publication_job_attempt: 2 },
    };
    assert.throws(() => validatePhase5PromotionProof({
      proof: wrongAttemptProof,
      proofBytes: Buffer.from(serializePhase5PromotionProof(wrongAttemptProof)),
      candidate, attendedRecordSha256: SOURCE_DIGEST, phase6N4RunId,
      phase6N4ArtifactName, phase6N4RecordSha256, releaseId,
      publicationJobAttempt: 1, publicAssetMetadata, publicAssetsDirectory,
    }), /promotion proof|noncanonical|identity/iu);

    writeFileSync(path.join(publicAssetsDirectory, "unexpected-release.txt"), "extra");
    assert.throws(() => validatePhase5PromotionProof({
      proof, proofBytes, candidate, attendedRecordSha256: SOURCE_DIGEST,
      phase6N4RunId, phase6N4ArtifactName, phase6N4RecordSha256,
      releaseId, publicationJobAttempt: 1, publicAssetMetadata, publicAssetsDirectory,
    }), /public release asset set|unexpected|regular/iu);
    rmSync(path.join(publicAssetsDirectory, "unexpected-release.txt"));

    rmSync(path.join(publicAssetsDirectory, "gym-tracker-release.apk"));
    symlinkSync(
      path.join(publicAssetsDirectory, "gym-tracker-release.aab"),
      path.join(publicAssetsDirectory, "gym-tracker-release.apk"),
    );
    assert.throws(() => validatePhase5PromotionProof({
      proof, proofBytes, candidate, attendedRecordSha256: SOURCE_DIGEST,
      phase6N4RunId, phase6N4ArtifactName, phase6N4RecordSha256,
      releaseId, publicationJobAttempt: 1, publicAssetMetadata, publicAssetsDirectory,
    }), /public release asset set|symlink|regular/iu);
  });

  const cliArgs = [
    "--bundle-dir", "retained-candidate",
    "--manifest-sha256", SOURCE_DIGEST,
    "--candidate-run-id", "12345",
    "--attended-run-id", "456",
    "--attended-artifact-name", "attended-release-evidence-candidate-001",
    "--attended-record", "attended-record.json",
    "--attended-record-sha256", SOURCE_DIGEST,
    "--phase6-n4-run-id", "789",
    "--phase6-n4-artifact-name", "phase6-n4-evidence-candidate-001-789",
    "--phase6-n4-record", "phase6-record.json",
    "--phase6-n4-record-sha256", "d".repeat(64),
    "--release-id", "42",
    "--publication-job-attempt", "1",
    "--public-asset-metadata", "public-assets.json",
    "--promotion-run-id", "999",
    "--repository", "owner/gym-tracker",
    "--release-tag", "v1.0.0",
    "--public-assets-dir", "public-assets",
    "--output", "promotion-proof.json",
  ];
  const args = parsePhase5PromotionProofArguments(cliArgs);
  assert.equal(args.phase6N4RunId, "789");
  assert.equal(args.phase6N4ArtifactName, "phase6-n4-evidence-candidate-001-789");
  assert.equal(args.phase6N4RecordSha256, "d".repeat(64));
  assert.equal(args.publicationJobAttempt, "1");
  assert.throws(() => parsePhase5PromotionProofArguments([
    "--bundle-dir", "retained-candidate",
  ]), /every immutable input|arguments/iu);
  const phase6RecordFlag = cliArgs.indexOf("--phase6-n4-record");
  const missingN4Record = cliArgs.filter(
    (_, index) => index !== phase6RecordFlag && index !== phase6RecordFlag + 1,
  );
  assert.throws(
    () => parsePhase5PromotionProofArguments(missingN4Record),
    /every immutable input|arguments/iu,
  );

  withBundle((bundleDirectory) => {
    const candidate = writeCandidateManifest(bundleDirectory);
    const publicAssetsDirectory = path.join(bundleDirectory, "public-assets");
    mkdirSync(publicAssetsDirectory);
    for (const { file } of candidate.manifest.artifacts) {
      writeFileSync(
        path.join(publicAssetsDirectory, file),
        readFileSync(path.join(bundleDirectory, file)),
      );
    }
    const attendedRecord = path.join(bundleDirectory, "attended-record.json");
    const phase6N4Record = path.join(bundleDirectory, "phase6-n4-record.json");
    const publicAssetMetadata = path.join(bundleDirectory, "public-assets.json");
    const output = path.join(bundleDirectory, "promotion-proof.json");
    writeFileSync(attendedRecord, "canonical attended bytes\n");
    writeFileSync(phase6N4Record, "canonical Phase 6 N4 bytes\n");
    writeJson(publicAssetMetadata, candidate.manifest.artifacts.map((artifact, index) => ({
      id: 50 + index, name: artifact.file, size: artifact.size_bytes,
      digest: `sha256:${artifact.sha256}`,
    })));
    const executionArgs = [
      "--bundle-dir", bundleDirectory,
      "--manifest-sha256", sha256(readFileSync(path.join(bundleDirectory, "release-candidate.json"))),
      "--candidate-run-id", "12345",
      "--attended-run-id", "456",
      "--attended-artifact-name", "attended-release-evidence-candidate-001",
      "--attended-record", attendedRecord,
      "--attended-record-sha256", sha256(readFileSync(attendedRecord)),
      "--phase6-n4-run-id", "789",
      "--phase6-n4-artifact-name", "phase6-n4-evidence-candidate-001-789",
      "--phase6-n4-record", phase6N4Record,
      "--phase6-n4-record-sha256", sha256(readFileSync(phase6N4Record)),
      "--release-id", "42",
      "--publication-job-attempt", "1",
      "--public-asset-metadata", publicAssetMetadata,
      "--promotion-run-id", "999",
      "--repository", "owner/gym-tracker",
      "--release-tag", "v1.0.0",
      "--public-assets-dir", publicAssetsDirectory,
      "--output", output,
    ];
    assert.equal(executePhase5PromotionProof(executionArgs).phase6_n4_run_id, "789");
    writeFileSync(phase6N4Record, "substituted Phase 6 N4 bytes\n");
    assert.throws(
      () => executePhase5PromotionProof([
        ...executionArgs.slice(0, -2),
        "--output", path.join(bundleDirectory, "rejected-proof.json"),
      ]),
      /Phase 6 N4 record hash/iu,
    );
  });
});

test("release gate requires the canonical approved record to bind passed Phase 6 N4 bytes", () => {
  const candidateManifest = {
    candidate_id: "candidate-001",
    source: { commit: SOURCE_COMMIT },
    artifacts: [
      { kind: "apk", sha256: "b".repeat(64) },
      { kind: "aab", sha256: "c".repeat(64) },
    ],
  };
  const phase6RecordBytes = Buffer.from("canonical Phase 6 record bytes\n");
  const binding = {
    record_sha256: sha256(phase6RecordBytes),
    evidence_run_id: "789",
    artifact_name: "phase6-n4-evidence-candidate-001-789",
    candidate_id: "candidate-001",
    source_commit: SOURCE_COMMIT,
    manifest_sha256: SOURCE_DIGEST,
    apk_sha256: "b".repeat(64),
    status: "passed",
  };
  const input = {
    candidateManifest,
    manifestSha256: SOURCE_DIGEST,
    phase5Record: { phase6_attended_evidence: binding },
    phase6Record: { status: "passed" },
    phase6RecordBytes,
    phase6N4RunId: "789",
    phase6N4ArtifactName: "phase6-n4-evidence-candidate-001-789",
  };

  assert.deepEqual(validatePhase6N4ReleaseBinding(input), binding);
  for (const mutation of [
    { phase5Record: {} },
    { phase5Record: { phase6_attended_evidence: { ...binding, extra: true } } },
    { phase5Record: { phase6_attended_evidence: { ...binding, status: "failed" } } },
    { phase5Record: { phase6_attended_evidence: { ...binding, source_commit: "d".repeat(40) } } },
    { phase6Record: { status: "failed" } },
    { phase6RecordBytes: Buffer.from("substituted bytes\n") },
    { phase6N4RunId: "790" },
  ]) {
    assert.throws(
      () => validatePhase6N4ReleaseBinding({ ...input, ...mutation }),
      /Phase 6 N4|binding|record|candidate|passed/iu,
    );
  }
});

test("Terminal Seal replays Phase 6 N4 source evidence in its sole validation command", () => {
  const terminal = [
    "05-07-SUMMARY.md verification tracking review.",
    "Promotion is complete. This is the literal final executable command; make no tool call afterward.",
    "```bash",
    "npm run verify:release:phase5 -- --bundle-dir <retained-candidate-directory> --manifest-sha256 <manifest-sha256> --automated-evidence <automated-evidence-json> --attended-record <attended-record-json> --checklist <checklist-json> --observations <observations-json> --evidence-dir <attended-evidence-directory> --phase6-n4-record <phase6-n4-record-json> --phase6-n4-checklist <phase6-n4-checklist-json> --phase6-n4-observations <phase6-n4-observations-json> --phase6-n4-evidence-dir <phase6-n4-evidence-directory> --phase6-n4-run-id <phase6-n4-run-id> --phase6-n4-artifact-name <phase6-n4-artifact-name> --release-tag <release-tag> --candidate-run-id <candidate-run-id> --candidate-repository <owner/repository> --candidate-commit <candidate-commit> --promotion-proof <promotion-proof-json> --promotion-proof-run-id <promotion-proof-run-id> --promotion-proof-artifact-id <promotion-proof-artifact-id> --promotion-proof-artifact-digest <promotion-proof-artifact-digest> --public-assets-dir <downloaded-public-assets-directory>",
    "```",
  ].join("\n");

  assert.doesNotThrow(() => validateTerminalSealDocument(terminal));
  assert.throws(
    () => validateTerminalSealDocument(terminal.replace(
      / --phase6-n4-record <phase6-n4-record-json>/u,
      "",
    )),
    /validate|executable|command/iu,
  );
});

test("Terminal Seal requires immutable promotion artifact identity and live GitHub state", async () => {
  const terminalArgs = [
    "--bundle-dir", "retained-candidate",
    "--manifest-sha256", SOURCE_DIGEST,
    "--automated-evidence", "automated.json",
    "--attended-record", "attended-record.json",
    "--checklist", "checklist.json",
    "--observations", "observations.json",
    "--evidence-dir", "attended-evidence",
    "--phase6-n4-record", "phase6-record.json",
    "--phase6-n4-checklist", "phase6-checklist.json",
    "--phase6-n4-observations", "phase6-observations.json",
    "--phase6-n4-evidence-dir", "phase6-evidence",
    "--phase6-n4-run-id", "789",
    "--phase6-n4-artifact-name", "phase6-n4-evidence-candidate-001-789",
    "--release-tag", "v1.0.0",
    "--candidate-run-id", "12345",
    "--candidate-repository", "owner/gym-tracker",
    "--candidate-commit", SOURCE_COMMIT,
    "--promotion-proof", "promotion-proof.json",
    "--promotion-proof-run-id", "999",
    "--promotion-proof-artifact-id", "1001",
    "--promotion-proof-artifact-digest", `sha256:${"e".repeat(64)}`,
    "--public-assets-dir", "public-assets",
  ];
  const options = parsePhase5ReleaseGateArguments(terminalArgs);
  assert.equal(options.promotionProofRunId, "999");
  assert.equal(options.promotionProofArtifactId, "1001");
  assert.equal(options.promotionProofArtifactDigest, `sha256:${"e".repeat(64)}`);

  const proof = {
    workflow: { run_id: "999", publication_job_attempt: 1 },
    candidate_run_id: "12345",
    release_id: 42,
    assets: [
      { id: 50, file: "gym-tracker-release.aab", retained_sha256: "a".repeat(64), public_sha256: "a".repeat(64), api_digest: `sha256:${"a".repeat(64)}`, size_bytes: 2 },
      { id: 51, file: "gym-tracker-release.apk", retained_sha256: "b".repeat(64), public_sha256: "b".repeat(64), api_digest: `sha256:${"b".repeat(64)}`, size_bytes: 1 },
    ],
  };
  const proofBytes = Buffer.from(serializePhase5PromotionProof(proof));
  const live = {
    promotionRun: {
      id: 999, run_attempt: 2, status: "completed", conclusion: "success",
      html_url: "https://github.com/owner/gym-tracker/actions/runs/999",
      head_sha: SOURCE_COMMIT, head_branch: "main",
      repository: { full_name: "owner/gym-tracker" },
      event: "workflow_dispatch", path: ".github/workflows/release-promotion.yml",
    },
    deployment: {
      id: 7,
      sha: SOURCE_COMMIT, ref: "main", environment: "public-release-promotion",
      original_environment: "public-release-promotion",
      performed_via_github_app: { slug: "github-actions" },
      url: "https://api.github.com/repos/owner/gym-tracker/deployments/7",
      statuses_url: "https://api.github.com/repos/owner/gym-tracker/deployments/7/statuses",
    },
    deploymentStatuses: [{
      id: 8, created_at: "2026-09-03T00:00:00Z", state: "success",
      environment: "public-release-promotion",
      environment_url: "https://github.com/owner/gym-tracker/actions/runs/999",
      deployment_url: "https://api.github.com/repos/owner/gym-tracker/deployments/7",
      log_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/11",
    }],
    job: {
      id: 11, run_id: 999, run_attempt: 1, head_sha: SOURCE_COMMIT,
      status: "completed", conclusion: "success",
      html_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/11",
    },
    proofArtifact: {
      id: 1001, name: "promotion-proof-999", expired: false,
      digest: `sha256:${"e".repeat(64)}`,
      workflow_run: { id: 999, head_sha: SOURCE_COMMIT },
    },
    proofArtifacts: [{
      id: 1001, name: "promotion-proof-999", expired: false,
      digest: `sha256:${"e".repeat(64)}`,
      workflow_run: { id: 999, head_sha: SOURCE_COMMIT },
    }],
    promotionProofArchiveSha256: "e".repeat(64),
    proofBytes,
    localProofBytes: proofBytes,
    tagRef: { ref: "refs/tags/v1.0.0", object: { type: "commit", sha: SOURCE_COMMIT } },
    release: {
      id: 42, tag_name: "v1.0.0", name: "Gym Tracker v1.0.0",
      body: "Candidate run: 12345", draft: false, prerelease: false,
      assets: [
        { id: 50, name: "gym-tracker-release.aab", size: 2, digest: `sha256:${"a".repeat(64)}` },
        { id: 51, name: "gym-tracker-release.apk", size: 1, digest: `sha256:${"b".repeat(64)}` },
      ],
    },
    proof,
  };
  assert.equal(validateLivePhase5Promotion({
    ...live, candidateRepository: "owner/gym-tracker", candidateCommit: SOURCE_COMMIT,
    releaseTag: "v1.0.0", promotionProofRunId: "999",
    promotionProofArtifactId: "1001",
    promotionProofArtifactDigest: `sha256:${"e".repeat(64)}`,
  }).release.id, 42);
  const failedSiblingDeployment = {
    ...live.deployment,
    id: 6,
    url: "https://api.github.com/repos/owner/gym-tracker/deployments/6",
    statuses_url: "https://api.github.com/repos/owner/gym-tracker/deployments/6/statuses",
  };
  const failedSiblingStatuses = [{
    ...live.deploymentStatuses[0],
    id: 10,
    state: "failure",
    deployment_url: failedSiblingDeployment.url,
    log_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/10",
  }];
  const failedSiblingJob = {
    ...live.job, id: 10, conclusion: "failure",
    html_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/10",
  };
  assert.equal(validateLivePhase5Promotion({
    ...live, candidateRepository: "owner/gym-tracker", candidateCommit: SOURCE_COMMIT,
    releaseTag: "v1.0.0", promotionProofRunId: "999",
    promotionProofArtifactId: "1001",
    promotionProofArtifactDigest: `sha256:${"e".repeat(64)}`,
  }).release.id, 42);
  assert.throws(() => validateLivePhase5Promotion({
    ...live, deployment: failedSiblingDeployment, deploymentStatuses: failedSiblingStatuses,
    job: failedSiblingJob, candidateRepository: "owner/gym-tracker",
    candidateCommit: SOURCE_COMMIT, releaseTag: "v1.0.0",
    promotionProofRunId: "999", promotionProofArtifactId: "1001",
    promotionProofArtifactDigest: `sha256:${"e".repeat(64)}`,
  }), /promotion|deployment|job/iu);
  const provenanceInput = {
    candidateRepository: "owner/gym-tracker",
    candidateCommit: SOURCE_COMMIT,
    promotionProofRunId: "999",
    promotionRun: live.promotionRun,
    deployment: live.deployment,
    deploymentStatuses: live.deploymentStatuses,
    job: live.job,
    publicationJobAttempt: 1,
  };
  assert.equal(validatePromotionDeploymentProvenance(provenanceInput)?.job.id, 11);
  assert.equal(validatePromotionDeploymentProvenance({
    ...provenanceInput,
    deploymentStatuses: [{
      ...live.deploymentStatuses[0], created_at: "2026-09-03T00:00:00.123456789Z",
    }],
  })?.job.id, 11);
  for (const mutation of [
    { promotionRun: { ...live.promotionRun, id: 0 } },
    { promotionRun: { ...live.promotionRun, run_attempt: 0 } },
    { deployment: { ...live.deployment, id: 0 } },
    { deployment: { ...live.deployment, url: "https://api.github.com/substituted" } },
    { deploymentStatuses: [] },
    { deploymentStatuses: [{ ...live.deploymentStatuses[0], id: 0 }] },
    ...[null, 0, 1, true, "not-a-date", "2026-09-03", "2026-02-30T00:00:00Z",
      "2026-09-03T00:00:00+00:00"]
      .map((createdAt) => ({
        deploymentStatuses: [{ ...live.deploymentStatuses[0], created_at: createdAt }],
      })),
    { deploymentStatuses: [live.deploymentStatuses[0], live.deploymentStatuses[0]] },
  ]) {
    assert.throws(
      () => validatePromotionDeploymentProvenance({ ...provenanceInput, ...mutation }),
      /promotion|workflow|deployment|status|identity|malformed/iu,
    );
  }
  for (const mutation of [
    { deploymentStatuses: [{ ...live.deploymentStatuses[0], log_url: "https://example.invalid/job/11" }] },
    { job: { ...live.job, id: 12 } },
    { job: { ...live.job, run_id: 0 } },
    { job: { ...live.job, run_attempt: 0 } },
    { publicationJobAttempt: 2 },
    { job: { ...live.job, html_url: "https://example.invalid/job/11" } },
    { job: { ...live.job, status: "queued" } },
  ]) {
    assert.equal(
      validatePromotionDeploymentProvenance({ ...provenanceInput, ...mutation }),
      null,
    );
  }
  for (const mutation of [
    { promotionRun: { ...live.promotionRun, conclusion: "failure" } },
    { proofArtifact: { ...live.proofArtifact, id: 1002 } },
    { proof: { ...live.proof, workflow: { run_id: "999" } } },
    { proof: { ...live.proof, workflow: { run_id: "999", publication_job_attempt: 3 } } },
    { proofBytes: Buffer.from("substituted proof\n") },
    { localProofBytes: Buffer.from("substituted local proof\n") },
    { tagRef: { ...live.tagRef, object: { type: "commit", sha: "f".repeat(40) } } },
    { release: { ...live.release, name: "Substituted title" } },
    { release: { ...live.release, body: "Candidate run: 99999" } },
    { release: { ...live.release, draft: true } },
    { release: { ...live.release, assets: [...live.release.assets, { id: 52, name: "extra.txt", size: 1, digest: `sha256:${"c".repeat(64)}` }] } },
  ]) {
    assert.throws(() => validateLivePhase5Promotion({
      ...live, ...mutation, candidateRepository: "owner/gym-tracker",
      candidateCommit: SOURCE_COMMIT, releaseTag: "v1.0.0",
      promotionProofRunId: "999", promotionProofArtifactId: "1001",
      promotionProofArtifactDigest: `sha256:${"e".repeat(64)}`,
    }), /promotion|artifact|proof|tag|release|asset|deployment/iu);
  }

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-live-loader-"));
  const archiveBytes = Buffer.from("sealed promotion proof archive\n");
  const archiveDigest = sha256(archiveBytes);
  const validDeployment = { ...live.deployment, id: 7 };
  const tiedStatusTime = "2026-09-03T00:00:00Z";
  const validStatuses = [
    {
      ...live.deploymentStatuses[0],
      id: 10,
      created_at: tiedStatusTime,
    },
    {
      ...live.deploymentStatuses[0],
      id: 9,
      created_at: tiedStatusTime,
      state: "failure",
      log_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/12",
    },
  ];
  const previousJob = {
    ...live.job,
    id: 12,
    conclusion: "failure",
    html_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/12",
  };
  const loaderProofArtifact = {
    ...live.proofArtifact,
    digest: `sha256:${archiveDigest}`,
  };
  const promotionProof = path.join(temporaryDirectory, "promotion-proof.json");
  writeFileSync(promotionProof, proofBytes);
  const secondValidDeployment = {
    ...validDeployment,
    id: 8,
    url: "https://api.github.com/repos/owner/gym-tracker/deployments/8",
    statuses_url: "https://api.github.com/repos/owner/gym-tracker/deployments/8/statuses",
  };
  const secondValidStatuses = [{
    ...live.deploymentStatuses[0],
    id: 11,
    deployment_url: secondValidDeployment.url,
    log_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/13",
  }];
  let secondValidJob = {
    ...live.job,
    id: 13,
    run_attempt: 2,
    html_url: "https://github.com/owner/gym-tracker/actions/runs/999/job/13",
  };
  let selectedDeployments = [validDeployment, failedSiblingDeployment];
  const jobEndpoints = [];
  const endpointCalls = [];
  const execute = (command, args, settings) => {
    assert.ok(command === "gh" || command === "unzip");
    if (command === "unzip") {
      return args[0] === "-Z1" ? "promotion-proof.json\n" : proofBytes;
    }
    const endpoint = args.find((value) => value.startsWith?.("repos/"));
    if (endpoint !== undefined) endpointCalls.push(endpoint);
    if (endpoint === "repos/owner/gym-tracker/actions/runs/999") {
      return JSON.stringify(live.promotionRun);
    }
    if (endpoint === "repos/owner/gym-tracker/deployments") {
      return JSON.stringify([selectedDeployments]);
    }
    if (endpoint === "repos/owner/gym-tracker/deployments/7/statuses") {
      return JSON.stringify([validStatuses]);
    }
    if (endpoint === "repos/owner/gym-tracker/deployments/6/statuses") {
      return JSON.stringify([failedSiblingStatuses]);
    }
    if (endpoint === "repos/owner/gym-tracker/deployments/8/statuses") {
      return JSON.stringify([secondValidStatuses]);
    }
    if (endpoint?.startsWith("repos/owner/gym-tracker/actions/jobs/")) {
      jobEndpoints.push(endpoint);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/jobs/11") {
      return JSON.stringify(live.job);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/jobs/12") {
      return JSON.stringify(previousJob);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/jobs/10") {
      return JSON.stringify(failedSiblingJob);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/jobs/13") {
      return JSON.stringify(secondValidJob);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/runs/999/artifacts") {
      return JSON.stringify([{ artifacts: [loaderProofArtifact] }]);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/artifacts/1001") {
      return JSON.stringify(loaderProofArtifact);
    }
    if (endpoint === "repos/owner/gym-tracker/actions/artifacts/1001/zip") {
      assert.equal(settings.encoding, null);
      return archiveBytes;
    }
    if (endpoint === "repos/owner/gym-tracker/git/ref/tags/v1.0.0") {
      return JSON.stringify(live.tagRef);
    }
    if (endpoint === "repos/owner/gym-tracker/releases/tags/v1.0.0") {
      return JSON.stringify(live.release);
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
  const previousGhToken = process.env.GH_TOKEN;
  const previousGithubToken = process.env.GITHUB_TOKEN;
  try {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const loaded = loadAndValidateLivePhase5Promotion({
      ...options, promotionProof,
      promotionProofArtifactDigest: `sha256:${archiveDigest}`,
    }, { execute });
    assert.equal(loaded.release.id, 42);
    assert.ok(
      endpointCalls.indexOf("repos/owner/gym-tracker/actions/artifacts/1001/zip")
        < endpointCalls.indexOf("repos/owner/gym-tracker/deployments"),
      "Terminal Seal must authenticate and parse immutable proof bytes before selecting a publication deployment",
    );
    assert.deepEqual(jobEndpoints, [
      "repos/owner/gym-tracker/actions/jobs/11",
      "repos/owner/gym-tracker/actions/jobs/10",
    ]);
    assert.equal(jobEndpoints.includes("repos/owner/gym-tracker/actions/jobs/12"), false);

    selectedDeployments = [failedSiblingDeployment];
    assert.throws(() => loadAndValidateLivePhase5Promotion({
      ...options, promotionProof,
      promotionProofArtifactDigest: "sha256:" + archiveDigest,
    }, { execute }), /deployment provenance is missing or ambiguous/iu);

    selectedDeployments = [validDeployment, secondValidDeployment];
    const mixedAttempt = loadAndValidateLivePhase5Promotion({
      ...options, promotionProof,
      promotionProofArtifactDigest: "sha256:" + archiveDigest,
    }, { execute });
    assert.equal(mixedAttempt.release.id, 42);
    secondValidJob = { ...secondValidJob, run_attempt: 1 };
    assert.throws(() => loadAndValidateLivePhase5Promotion({
      ...options, promotionProof,
      promotionProofArtifactDigest: "sha256:" + archiveDigest,
    }, { execute }), /deployment provenance is missing or ambiguous/iu);

    selectedDeployments = [validDeployment, { ...validDeployment }];
    assert.throws(() => loadAndValidateLivePhase5Promotion({
      ...options, promotionProof,
      promotionProofArtifactDigest: "sha256:" + archiveDigest,
    }, { execute }), /duplicate identities/iu);
  } finally {
    if (previousGhToken === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previousGhToken;
    if (previousGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousGithubToken;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Terminal Seal delegates authentication to the gh credential store", () => {
  const previousGhToken = process.env.GH_TOKEN;
  const previousGithubToken = process.env.GITHUB_TOKEN;
  try {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    assert.throws(() => loadAndValidateLivePhase5Promotion({
      candidateRepository: "owner/gym-tracker",
      promotionProofRunId: "999",
      promotionProofArtifactId: "1001",
    }, {
      execute: () => { throw new Error("synthetic gh failure"); },
    }), /live GitHub promotion provenance query failed/iu);
  } finally {
    if (previousGhToken === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previousGhToken;
    if (previousGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousGithubToken;
  }
});

test("emulator-runner commands are self-contained on one line", () => {
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const candidateWorkflow = readFileSync(
    path.join(projectRoot, ".github/workflows/release-candidate.yml"),
    "utf8",
  );
  const matrix = candidateWorkflow.match(
    /- name: Run exact production candidate automated matrix[\s\S]*?(?=\n      - name:)/u,
  )?.[0];

  assert.ok(matrix);
  assert.doesNotMatch(matrix, /\\\s*$/mu);
  const scriptLines = matrix.match(/\n\s+script: \|\n([\s\S]*)/u)?.[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(scriptLines, [
    "mkdir -p artifacts/release-candidate/evidence",
    'npm run test:maestro:phase5 -- --bundle-dir artifacts/release-candidate --manifest-sha256 "${{ steps.candidate_manifest.outputs.manifest_sha256 }}" --serial emulator-5554 --output artifacts/release-candidate/evidence/maestro.json',
    'npm run benchmark:phase5 -- --bundle-dir artifacts/release-candidate --manifest-sha256 "${{ steps.candidate_manifest.outputs.manifest_sha256 }}" --serial emulator-5554 --device-json artifacts/release-candidate/evidence/maestro.json --output artifacts/release-candidate/evidence/benchmark.json',
    'node scripts/record-phase5-source-evidence.mjs --bundle-dir artifacts/release-candidate --manifest-sha256 "${{ steps.candidate_manifest.outputs.manifest_sha256 }}" --static-report "${RUNNER_TEMP}/phase5-static.txt" --generated-report "${RUNNER_TEMP}/phase5-generated.txt" --device-json artifacts/release-candidate/evidence/maestro.json --output artifacts/release-candidate/evidence/source.json',
    'npm run verify:native:phase5 -- --bundle-dir artifacts/release-candidate --manifest-sha256 "${{ steps.candidate_manifest.outputs.manifest_sha256 }}" --source artifacts/release-candidate/evidence/source.json --maestro artifacts/release-candidate/evidence/maestro.json --benchmark artifacts/release-candidate/evidence/benchmark.json --output artifacts/release-candidate/evidence/automated.json',
    'npm run test:maestro:phase6 -- --bundle-dir artifacts/release-candidate --manifest-sha256 "${{ steps.candidate_manifest.outputs.manifest_sha256 }}" --package com.fchoo.gymtracker --serial emulator-5554 --output artifacts/release-candidate/evidence/phase6.json --report-dir artifacts/release-candidate/evidence/phase6-maestro',
    `grep -F '"mode": "automated-only"' artifacts/release-candidate/evidence/automated.json`,
    `grep -F '"approval_status": "evidence_pending"' artifacts/release-candidate/evidence/automated.json`,
  ]);
});
