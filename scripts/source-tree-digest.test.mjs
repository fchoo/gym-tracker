import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertCleanCommittedTree,
  sourceTreeSha256,
  sourceTreeUntrackedPaths,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";

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
