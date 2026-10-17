#!/usr/bin/env node

import {
  execFileSync,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const excludedSourcePath =
  /^\.coverage$|^(?:node_modules|artifacts|\.planning|\.gsd|\.expo|\.gradle|\.kotlin|\.cache|coverage(?:-[^/.]+)?|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;

const V12_PLANNING_PATHS = Object.freeze({
  matrix_sha256: ".planning/design/v1.2-prototype-parity-matrix.json",
  requirements_sha256: ".planning/REQUIREMENTS.md",
  source_manifest_sha256: ".planning/design/v1.2-browser-evidence/source-manifest.json",
  owner_brief_sha256: ".planning/v1.2-OWNER-BRIEF.md",
  ui_spec_sha256: ".planning/phases/20-native-acceptance/20-UI-SPEC.md",
  deviations_sha256: ".planning/design/v1.2-DEVIATIONS.md",
});
const V12_FIXTURE_REGISTRY = ".planning/design/v1.2-browser-evidence/serial-walk.json";

function normalizedFileMode(mode) {
  return (mode & 0o111) === 0 ? "644" : "755";
}

function digestFiles(files) {
  const hash = createHash("sha256");
  files.sort((left, right) =>
    Buffer.compare(Buffer.from(left.filePath), Buffer.from(right.filePath))
  );
  for (const file of files) {
    const pathBytes = Buffer.from(file.filePath);
    hash.update(Buffer.from(
      `${pathBytes.length}\0${file.type}\0${file.mode}\0${file.contents.length}\0`,
    ));
    hash.update(pathBytes);
    hash.update(Buffer.from("\0"));
    hash.update(file.contents);
    hash.update(Buffer.from("\0"));
  }
  return hash.digest("hex");
}

function safeRegularFile(root, relative, code) {
  if (typeof relative !== "string" || relative.length === 0 || path.isAbsolute(relative)
    || relative.includes("\\") || path.posix.normalize(relative) !== relative
    || relative.split("/").some(part => !part || part === "." || part === "..")) throw new Error(code);
  const base = path.resolve(root); let cursor = base;
  if (lstatSync(base).isSymbolicLink() || !lstatSync(base).isDirectory()) throw new Error(code);
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink()) throw new Error(code);
  }
  if (!lstatSync(cursor).isFile()) throw new Error(code);
  return cursor;
}

function fileSha256(root, relative, code) {
  return createHash("sha256").update(readFileSync(safeRegularFile(root, relative, code))).digest("hex");
}

export function v12ContractSourceDigests(root = process.cwd(), { approvedSourceRoot = process.env.V12_APPROVED_SOURCE_ROOT } = {}) {
  const planning = Object.freeze(Object.fromEntries(
    Object.entries(V12_PLANNING_PATHS).map(([key, relative]) => [key, fileSha256(root, relative, "v12_contract_planning_invalid")]),
  ));
  let manifest;
  try { manifest = JSON.parse(readFileSync(safeRegularFile(root, V12_PLANNING_PATHS.source_manifest_sha256, "v12_contract_prototype_invalid"), "utf8")); }
  catch (error) { if (error instanceof Error && error.message.startsWith("v12_contract_")) throw error; throw new Error("v12_contract_prototype_invalid"); }
  if (manifest?.schema_version !== 2 || manifest.revision !== 18 || !Array.isArray(manifest.sources)
    || manifest.sources.length < 2 || typeof approvedSourceRoot !== "string" || approvedSourceRoot.length === 0) {
    throw new Error("v12_contract_prototype_invalid");
  }
  const sourceById = new Map(manifest.sources.map(source => [source.id, source]));
  const approvedJson = sourceById.get("approved-json"); const approvedHtml = sourceById.get("approved-hybrid-html");
  if (!approvedJson || !approvedHtml) throw new Error("v12_contract_prototype_invalid");
  const approvedRoot = path.resolve(approvedSourceRoot);
  const approvalSha256 = fileSha256(approvedRoot, approvedJson.filename, "v12_contract_prototype_invalid");
  const htmlSha256 = fileSha256(approvedRoot, approvedHtml.filename, "v12_contract_prototype_invalid");
  if (approvalSha256 !== approvedJson.sha256 || htmlSha256 !== approvedHtml.sha256) throw new Error("v12_contract_prototype_invalid");
  return Object.freeze({
    planning,
    prototype: Object.freeze({ revision: 18, approval_sha256: approvalSha256, html_sha256: htmlSha256 }),
    fixtures: Object.freeze({ registry_sha256: fileSha256(root, V12_FIXTURE_REGISTRY, "v12_contract_fixtures_invalid") }),
  });
}

function currentFile(root, filePath) {
  const absolutePath = path.join(root, filePath);
  const details = lstatSync(absolutePath);
  const type = details.isSymbolicLink()
    ? "symlink"
    : details.isFile()
      ? "file"
      : "other";
  return {
    filePath,
    type,
    mode: type === "file" ? normalizedFileMode(details.mode) : "000",
    contents: type === "symlink"
      ? Buffer.from(readlinkSync(absolutePath))
      : type === "file"
        ? readFileSync(absolutePath)
        : Buffer.alloc(0),
  };
}

export function sourceTreeUntrackedPaths(root = process.cwd()) {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--others", "--exclude-standard"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  ).toString("utf8").split("\0")
    .filter(Boolean)
    .filter((filePath) => !excludedSourcePath.test(filePath))
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right))
    );
}

export function sourceTreeSha256(root = process.cwd()) {
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  ).toString("utf8").split("\0")
    .filter(Boolean)
    .filter((filePath) => !excludedSourcePath.test(filePath))
    .map((filePath) => currentFile(root, filePath));
  return digestFiles(files);
}

export function sourceTreeSha256AtHead(head, root = process.cwd()) {
  const entries = execFileSync(
    "git",
    ["ls-tree", "-rz", "--full-tree", head],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  ).toString("utf8").split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(
        /^(\d+)\s+(blob|commit)\s+([0-9a-f]+)\t(.+)$/u,
      );
      if (match === null) {
        throw new Error("implementation tree entry is invalid.");
      }
      return {
        rawMode: match[1],
        type: match[2],
        hash: match[3],
        filePath: match[4],
      };
    })
    .filter(({ type, filePath }) =>
      type === "blob" && !excludedSourcePath.test(filePath)
    );
  return digestFiles(entries.map(({ rawMode, hash, filePath }) => ({
      filePath,
      type: rawMode === "120000" ? "symlink" : "file",
      mode: rawMode === "100755" ? "755" : rawMode === "120000" ? "000" : "644",
      contents: execFileSync(
        "git",
        ["cat-file", "blob", hash],
        { cwd: root, maxBuffer: 64 * 1024 * 1024 },
      ),
    })));
}

export function assertCleanCommittedTree(head, root = process.cwd()) {
  const currentHead = execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  if (head !== currentHead) {
    throw new Error("source digest head does not match the checked-out commit.");
  }
  const status = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ).split(/\r?\n/u).filter(Boolean).map((line) => line.slice(3));
  const sourceChanges = status.filter((filePath) =>
    !excludedSourcePath.test(filePath)
  );
  if (sourceChanges.length > 0) {
    throw new Error(
      `dirty implementation tree prevents an exact source digest: ${sourceChanges.join(", ")}`,
    );
  }
}

async function executeMain() {
  const args = process.argv.slice(2);
  let head;
  let assertNoUntracked = false;
  let assertClean = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--head") {
      head = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--head=")) {
      head = argument.slice("--head=".length);
    } else if (argument === "--assert-no-untracked") {
      assertNoUntracked = true;
    } else if (argument === "--assert-clean") {
      assertClean = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  const untracked = sourceTreeUntrackedPaths();
  if (assertNoUntracked && untracked.length > 0) {
    throw new Error(
      `untracked implementation files prevent an exact source digest: ${untracked.join(", ")}`,
    );
  }
  if (assertClean) {
    if (head === undefined) {
      throw new Error("--assert-clean requires --head.");
    }
    assertCleanCommittedTree(head);
  }
  process.stdout.write(head === undefined
    ? sourceTreeSha256()
    : sourceTreeSha256AtHead(head));
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executeMain().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
