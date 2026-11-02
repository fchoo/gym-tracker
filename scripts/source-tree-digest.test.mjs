import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertCleanCommittedTree,
  sourceTreeSha256,
  sourceTreeUntrackedPaths,
  sourceTreeSha256AtHead,
  v12ContractSourceDigests,
} from "./source-tree-digest.mjs";
import { resolveV12GitExecution, V12_TEST_EXECUTION_ORIGIN } from "./v12-native-execution-origin.mjs";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

test("hashes the committed native tree and rejects dirty implementation source", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gym-source-tree-digest-"));
  try {
    git(root, "init", "--quiet");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "Source Digest Test");
    mkdirSync(path.join(root, "android", "app", "src"), { recursive: true });
    writeFileSync(path.join(root, ".gitignore"), "artifacts/\n");
    writeFileSync(path.join(root, "app.ts"), "export const source = 1;\n");
    writeFileSync(path.join(root, "android", "app", "src", "Main.kt"), "class Main\n");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", "initial");

    const firstHead = git(root, "rev-parse", "HEAD");
    const firstDigest = sourceTreeSha256AtHead(firstHead, root);
    assert.doesNotThrow(() => assertCleanCommittedTree(firstHead, root));

    writeFileSync(path.join(root, "android", "app", "src", "Main.kt"), "class Changed\n");
    assert.throws(() => assertCleanCommittedTree(firstHead, root), /dirty implementation tree/u);
    assert.equal(sourceTreeSha256AtHead(firstHead, root), firstDigest);

    git(root, "add", "android/app/src/Main.kt");
    git(root, "commit", "--quiet", "-m", "native source");
    const secondHead = git(root, "rev-parse", "HEAD");
    assert.notEqual(sourceTreeSha256AtHead(secondHead, root), firstDigest);
    assert.doesNotThrow(() => assertCleanCommittedTree(secondHead, root));

    mkdirSync(path.join(root, "artifacts"), { recursive: true });
    mkdirSync(path.join(root, ".gsd"), { recursive: true });
    writeFileSync(path.join(root, "artifacts", "generated.txt"), "generated\n");
    writeFileSync(path.join(root, ".gsd", "session.json"), "local\n");
    assert.doesNotThrow(() => assertCleanCommittedTree(secondHead, root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores generated coverage directories without ignoring similarly named source files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gym-source-tree-coverage-"));
  try {
    git(root, "init", "--quiet");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "Source Digest Test");
    writeFileSync(path.join(root, "app.ts"), "export const source = 1;\n");
    git(root, "add", "app.ts");
    git(root, "commit", "--quiet", "-m", "initial");
    const head = git(root, "rev-parse", "HEAD");

    mkdirSync(path.join(root, "coverage-example"), { recursive: true });
    writeFileSync(
      path.join(root, "coverage-example", "coverage-summary.json"),
      "{}\n",
    );
    assert.deepEqual(sourceTreeUntrackedPaths(root), []);
    assert.doesNotThrow(() => assertCleanCommittedTree(head, root));

    writeFileSync(path.join(root, "coverage-example.ts"), "export const realSource = true;\n");
    assert.deepEqual(sourceTreeUntrackedPaths(root), ["coverage-example.ts"]);
    assert.throws(
      () => assertCleanCommittedTree(head, root),
      /coverage-example\.ts/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores only the generated root .coverage database while retaining similarly named source", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gym-source-tree-dot-coverage-"));
  try {
    git(root, "init", "--quiet");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "Source Digest Test");
    mkdirSync(path.join(root, "src", "nested"), { recursive: true });
    writeFileSync(path.join(root, "app.ts"), "export const source = 1;\n");
    git(root, "add", "app.ts");
    git(root, "commit", "--quiet", "-m", "initial");
    const head = git(root, "rev-parse", "HEAD");
    const initialDigest = sourceTreeSha256(root);

    writeFileSync(path.join(root, ".coverage"), "generated sqlite bytes\n");
    mkdirSync(path.join(root, "coverage"), { recursive: true });
    mkdirSync(path.join(root, "coverage-example"), { recursive: true });
    writeFileSync(path.join(root, "coverage", "summary.json"), "{}\n");
    writeFileSync(path.join(root, "coverage-example", "summary.json"), "{}\n");
    assert.deepEqual(sourceTreeUntrackedPaths(root), []);
    assert.equal(sourceTreeSha256(root), initialDigest);
    assert.doesNotThrow(() => assertCleanCommittedTree(head, root));

    writeFileSync(path.join(root, "coverage-example.ts"), "export const rootSource = true;\n");
    writeFileSync(path.join(root, ".coverage-source.ts"), "export const dotSource = true;\n");
    writeFileSync(path.join(root, "src", "nested", ".coverage-source.ts"), "export const nestedSource = true;\n");
    assert.deepEqual(sourceTreeUntrackedPaths(root), [
      ".coverage-source.ts",
      "coverage-example.ts",
      "src/nested/.coverage-source.ts",
    ]);
    assert.notEqual(sourceTreeSha256(root), initialDigest);
    assert.throws(() => assertCleanCommittedTree(head, root), /coverage-source\.ts|coverage-example\.ts/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recomputes planning, prototype, and fixture authority outside the implementation-tree exclusion", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gym-v12-contract-digest-"));
  const approved = mkdtempSync(path.join(tmpdir(), "gym-v12-approved-"));
  try {
    const files = {
      ".planning/design/v1.2-prototype-parity-matrix.json": "{}\n",
      ".planning/REQUIREMENTS.md": "# Requirements\n",
      ".planning/v1.2-OWNER-BRIEF.md": "# Owner\n",
      ".planning/phases/20-native-acceptance/20-UI-SPEC.md": "# UI\n",
      ".planning/design/v1.2-DEVIATIONS.md": "# Deviations\n",
      ".planning/design/v1.2-browser-evidence/serial-walk.json": "[]\n",
    };
    writeFileSync(path.join(root, "app.ts"), "export const source = 1;\n");
    for (const [relative, bytes] of Object.entries(files)) {
      mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
      writeFileSync(path.join(root, relative), bytes);
    }
    writeFileSync(path.join(approved, "approved.json"), "{\"revision\":18}\n");
    writeFileSync(path.join(approved, "approved-hybrid.html"), "<main>approved</main>\n");
    const sourceManifest = {
      schema_version: 2,
      revision: 18,
      sources: [
        { id: "approved-json", filename: "approved.json", sha256: createHash("sha256").update(readFileSync(path.join(approved, "approved.json"))).digest("hex") },
        { id: "approved-hybrid-html", filename: "approved-hybrid.html", sha256: createHash("sha256").update(readFileSync(path.join(approved, "approved-hybrid.html"))).digest("hex") },
      ],
    };
    writeFileSync(path.join(root, ".planning/design/v1.2-browser-evidence/source-manifest.json"), JSON.stringify(sourceManifest));
    git(root, "init", "--quiet"); git(root, "config", "user.email", "test@example.invalid"); git(root, "config", "user.name", "Source Digest Test");
    git(root, "add", "."); git(root, "commit", "--quiet", "-m", "initial");
    const implementation = sourceTreeSha256(root);
    const first = v12ContractSourceDigests(root, { approvedSourceRoot: approved });
    writeFileSync(path.join(root, ".planning/REQUIREMENTS.md"), "# Changed requirements\n");
    const second = v12ContractSourceDigests(root, { approvedSourceRoot: approved });
    assert.equal(sourceTreeSha256(root), implementation, ".planning remains excluded from the implementation digest");
    assert.notEqual(second.planning.requirements_sha256, first.planning.requirements_sha256);
    writeFileSync(path.join(approved, "approved.json"), "{\"revision\":19}\n");
    assert.throws(() => v12ContractSourceDigests(root, { approvedSourceRoot: approved }), /prototype|approved/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(approved, { recursive: true, force: true });
  }
});

test("resolves the checked-in hash-matched prototype authority without an external root", () => {
  const manifest = JSON.parse(readFileSync(
    ".planning/design/v1.2-browser-evidence/source-manifest.json",
    "utf8",
  ));
  const sources = Object.fromEntries(manifest.sources.map(({ id, sha256 }) => [id, sha256]));
  const digests = v12ContractSourceDigests(process.cwd(), { approvedSourceRoot: null });
  assert.deepEqual(digests.prototype, {
    revision: 18,
    approval_sha256: sources["approved-json"],
    html_sha256: sources["approved-hybrid-html"],
  });
});

test("source operations use one explicitly attested absolute Git executable", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gym-source-tree-git-origin-"));
  const tools = mkdtempSync(path.join(tmpdir(), "gym-source-tree-git-tools-"));
  try {
    const systemGit = realpathSync("/usr/bin/git");
    const controlledGit = path.join(tools, "git");
    writeFileSync(controlledGit, `#!/bin/sh\nexec ${JSON.stringify(systemGit)} "$@"\n`, { mode: 0o755 });
    const gitExecution = resolveV12GitExecution({
      env: { V12_EXECUTION_ORIGIN: V12_TEST_EXECUTION_ORIGIN, V12_GIT_PATH: controlledGit },
    });
    git(root, "init", "--quiet");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "Source Digest Test");
    writeFileSync(path.join(root, "app.ts"), "export const source = 1;\n");
    git(root, "add", "app.ts");
    git(root, "commit", "--quiet", "-m", "initial");
    const head = git(root, "rev-parse", "HEAD");

    const digest = sourceTreeSha256AtHead(head, root, { gitExecution, expectedGitAttestation: gitExecution.attestation });
    assert.match(digest, /^[a-f0-9]{64}$/u);
    assert.doesNotThrow(() => assertCleanCommittedTree(head, root, { gitExecution, expectedGitAttestation: gitExecution.attestation }));
    assert.throws(
      () => sourceTreeSha256(root, { gitExecution, expectedGitAttestation: { ...gitExecution.attestation, action: "tampered" } }),
      /git_attestation_invalid/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(tools, { recursive: true, force: true });
  }
});
