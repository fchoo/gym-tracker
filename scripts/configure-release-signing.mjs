#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
  throw new Error("release_signing_configuration_failed: " + message);
}

function matchingClosingBrace(source, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  fail("generated Gradle signing block is unbalanced.");
}

export function configureReleaseSigning(source) {
  if (source.includes("signingConfigs.release")) {
    fail("generated Gradle source already contains a release signing configuration.");
  }
  const blockStart = source.indexOf("signingConfigs {");
  if (blockStart < 0) {
    fail("generated Gradle source has no signing configuration block.");
  }
  const openingBrace = source.indexOf("{", blockStart);
  const closingBrace = matchingClosingBrace(source, openingBrace);
  const debugReferences = [...source.matchAll(/signingConfig signingConfigs\.debug/g)];
  if (debugReferences.length < 1) {
    fail("generated Gradle release signing shape changed.");
  }
  const reference = debugReferences.at(-1);
  const replaced = source.slice(0, reference.index)
    + "signingConfig signingConfigs.release"
    + source.slice(reference.index + reference[0].length);
  const releaseConfig = "\n        release {\n"
    + "            storeFile file(RELEASE_STORE_FILE)\n"
    + "            storePassword RELEASE_STORE_PASSWORD\n"
    + "            keyAlias RELEASE_KEY_ALIAS\n"
    + "            keyPassword RELEASE_KEY_PASSWORD\n"
    + "        }\n";
  return replaced.slice(0, closingBrace)
    + releaseConfig
    + replaced.slice(closingBrace);
}

function parseArguments(args) {
  if (args.length !== 2 || args[0] !== "--build-gradle") {
    fail("expected --build-gradle <path>.");
  }
  const filePath = args[1];
  if (typeof filePath !== "string" || filePath.length < 1 || path.basename(filePath) !== "build.gradle") {
    fail("build Gradle path is malformed.");
  }
  return filePath;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const filePath = parseArguments(process.argv.slice(2));
    writeFileSync(filePath, configureReleaseSigning(readFileSync(filePath, "utf8")));
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : "release_signing_configuration_failed") + "\n");
    process.exitCode = 1;
  }
}
