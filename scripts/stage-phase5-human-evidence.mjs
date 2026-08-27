#!/usr/bin/env node

import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const STAGING_NAME = "gym-tracker-human-evidence";
const MAX_ATTACHMENT_FILES = 256;
const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 512 * 1024 * 1024;

function containedPath(root, relativePath, kind) {
  if (typeof relativePath !== "string" || relativePath.length < 1
    || path.isAbsolute(relativePath)
    || relativePath.split(/[\\/]/u).some((part) => ["", ".", ".."].includes(part))) {
    throw new Error(`${kind} path must be a safe relative path beneath EVIDENCE_ROOT.`);
  }
  const canonicalRoot = realpathSync(root);
  const candidate = path.resolve(canonicalRoot, relativePath);
  if (!candidate.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`${kind} path escapes EVIDENCE_ROOT.`);
  }
  const details = lstatSync(candidate, { throwIfNoEntry: false });
  if (details === undefined || details.isSymbolicLink()
    || realpathSync(candidate) !== candidate) {
    throw new Error(`${kind} path is missing, symlinked, or unsafe.`);
  }
  return { candidate, details };
}

function collectAttachmentFiles(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    const details = lstatSync(candidate);
    if (details.isSymbolicLink() || realpathSync(candidate) !== candidate) {
      throw new Error("attachment descendant is symlinked or escapes the evidence root.");
    }
    if (details.isDirectory()) {
      collectAttachmentFiles(root, candidate, files);
    } else if (details.isFile()) {
      if (details.size < 1 || details.size > MAX_ATTACHMENT_BYTES) {
        throw new Error("attachment file size must be positive and bounded to 64 MiB.");
      }
      files.push({
        source: candidate,
        relative: path.relative(root, candidate),
        size: details.size,
      });
      if (files.length > MAX_ATTACHMENT_FILES) {
        throw new Error("attachment file count exceeds 256.");
      }
      if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error("attachment aggregate size exceeds 512 MiB.");
      }
    } else {
      throw new Error("attachment descendant must be a regular file or directory.");
    }
  }
  return files;
}

export function stagePhase5HumanEvidence({
  evidenceRoot, observationsRelative, attachmentsRelative, stagingRoot,
}) {
  const observations = containedPath(evidenceRoot, observationsRelative, "observations");
  const attachments = containedPath(evidenceRoot, attachmentsRelative, "attachments");
  if (!observations.details.isFile() || observations.details.size < 1
    || observations.details.size > 1024 * 1024 || !attachments.details.isDirectory()) {
    throw new Error("human evidence inputs are not bounded files/directories.");
  }
  const attachmentFiles = collectAttachmentFiles(attachments.candidate);
  if (attachmentFiles.length < 1) {
    throw new Error("attachment directory must contain at least one regular file.");
  }
  const canonicalStagingRoot = realpathSync(stagingRoot);
  const stagingDirectory = path.join(canonicalStagingRoot, STAGING_NAME);
  if (path.dirname(stagingDirectory) !== canonicalStagingRoot
    || path.basename(stagingDirectory) !== STAGING_NAME) {
    throw new Error("human evidence staging target is unsafe.");
  }
  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(path.join(stagingDirectory, "attachments"), { recursive: true });
  writeFileSync(
    path.join(stagingDirectory, "observations.json"),
    readFileSync(observations.candidate),
    { flag: "wx" },
  );
  for (const file of attachmentFiles) {
    const destination = path.join(stagingDirectory, "attachments", file.relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(file.source), { flag: "wx" });
  }
  return { stagingDirectory };
}

function parseArgs(args) {
  if (args.length !== 8) throw new Error("human evidence staging arguments are incomplete.");
  const values = {};
  const mapping = new Map([
    ["--evidence-root", "evidenceRoot"],
    ["--observations-relative", "observationsRelative"],
    ["--attachments-relative", "attachmentsRelative"],
    ["--staging-root", "stagingRoot"],
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = mapping.get(args[index]);
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(values, key)) {
      throw new Error("human evidence staging arguments are malformed.");
    }
    values[key] = value;
  }
  return values;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = stagePhase5HumanEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ ok: true, staging_directory: result.stagingDirectory })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
