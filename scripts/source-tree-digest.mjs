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
  /^(?:android|ios|node_modules|artifacts|\.planning|\.gsd|\.expo|\.gradle|\.kotlin|\.cache|coverage|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;

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
  const trackedPaths = new Set(entries.map(({ filePath }) => filePath));
  return digestFiles([
    ...entries.map(({ rawMode, hash, filePath }) => ({
      filePath,
      type: rawMode === "120000" ? "symlink" : "file",
      mode: rawMode === "100755" ? "755" : rawMode === "120000" ? "000" : "644",
      contents: execFileSync(
        "git",
        ["cat-file", "blob", hash],
        { cwd: root, maxBuffer: 64 * 1024 * 1024 },
      ),
    })),
    ...sourceTreeUntrackedPaths(root)
      .filter((filePath) => !trackedPaths.has(filePath))
      .map((filePath) => currentFile(root, filePath)),
  ]);
}

async function executeMain() {
  const args = process.argv.slice(2);
  let head;
  let assertNoUntracked = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--head") {
      head = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--head=")) {
      head = argument.slice("--head=".length);
    } else if (argument === "--assert-no-untracked") {
      assertNoUntracked = true;
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
