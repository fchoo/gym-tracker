#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const resultPath = path.resolve(
  projectRoot,
  process.argv[2] ?? "artifacts/native/rest-lifecycle/lifecycle-result.json",
);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const buildPath = path.resolve(projectRoot, result.build_manifest);
const build = JSON.parse(readFileSync(buildPath, "utf8"));
const failures = [];

function fail(message) {
  failures.push(message);
}

function same(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label}: ${String(actual)} != ${String(expected)}`);
  }
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
}

function sourceTreeSha256() {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: projectRoot },
  );
  const excluded = /^(?:android|ios|node_modules|artifacts|\.expo|\.gradle|\.kotlin|\.cache|coverage|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;
  const files = output.toString("utf8").split("\0")
    .filter(Boolean)
    .filter((filePath) => !excluded.test(filePath))
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const hash = createHash("sha256");
  for (const filePath of files) {
    const details = lstatSync(filePath);
    const type = details.isSymbolicLink()
      ? "symlink"
      : details.isFile()
        ? "file"
        : "other";
    const contents = details.isSymbolicLink()
      ? Buffer.from(readlinkSync(filePath))
      : details.isFile()
        ? readFileSync(filePath)
        : Buffer.alloc(0);
    const pathBytes = Buffer.from(filePath);
    hash.update(Buffer.from(
      `${pathBytes.length}\0${type}\0${(details.mode & 0o777).toString(8)}\0${contents.length}\0`,
    ));
    hash.update(pathBytes);
    hash.update(Buffer.from("\0"));
    hash.update(contents);
    hash.update(Buffer.from("\0"));
  }
  return hash.digest("hex");
}

same("result status", result.status, "passed");
same("suite", result.suite, "rest-lifecycle");
same("manifest suite", build.suite, "rest-lifecycle");
same("result/manifest head", result.base_head, build.base_head);
same("current head", build.base_head, git("rev-parse", "HEAD"));
same(
  "result/manifest source digest",
  result.source_tree_sha256,
  build.source_tree_sha256,
);
same("current source digest", build.source_tree_sha256, sourceTreeSha256());
same("APK digest", result.apk.sha256, build.apk.sha256);
same("installed byte match", result.installed_apk.matches_retained_apk, true);
same("Maestro failures", result.maestro.failures, 0);
same("Maestro errors", result.maestro.errors, 0);
same("Maestro skipped", result.maestro.skipped, 0);
if (!Number.isInteger(result.maestro.tests) || result.maestro.tests < 1) {
  fail("Maestro tests must be a positive integer");
}
if (!Array.isArray(result.maestro.assertions) || result.maestro.assertions.length < 5) {
  fail("Lifecycle assertions are incomplete");
}
if (!build.apk.page_alignment_verified || build.apk.page_alignment_kib !== 16) {
  fail("16 KiB APK alignment proof is missing");
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    error: "rest_lifecycle_evidence_failed",
    failures,
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  suite: result.suite,
  base_head: result.base_head,
  source_tree_sha256: result.source_tree_sha256,
  apk_sha256: result.apk.sha256,
  maestro_tests: result.maestro.tests,
}));
