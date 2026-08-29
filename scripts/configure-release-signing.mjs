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

const RELEASE_PROPERTY_NAMES = Object.freeze([
  "RELEASE_STORE_FILE",
  "RELEASE_STORE_PASSWORD",
  "RELEASE_KEY_ALIAS",
  "RELEASE_KEY_PASSWORD",
]);

export function appendReleaseSigningProperties(source, properties) {
  const prefix = source.length === 0 || source.endsWith("\n") ? source : source + "\n";
  const releaseProperties = RELEASE_PROPERTY_NAMES.map((name) => {
    const value = properties[name];
    if (typeof value !== "string" || value.length === 0 || /[\r\n]/u.test(value)) {
      fail(name + " must be a non-empty single-line value.");
    }
    return name + "=" + value;
  });
  return prefix + releaseProperties.join("\n") + "\n";
}

function parseArguments(args) {
  if (args.length !== 4 || args[0] !== "--build-gradle" || args[2] !== "--gradle-properties") {
    fail("expected --build-gradle <path> --gradle-properties <path>.");
  }
  const buildGradlePath = args[1];
  const gradlePropertiesPath = args[3];
  if (typeof buildGradlePath !== "string" || buildGradlePath.length < 1 || path.basename(buildGradlePath) !== "build.gradle") {
    fail("build Gradle path is malformed.");
  }
  if (typeof gradlePropertiesPath !== "string" || gradlePropertiesPath.length < 1 || path.basename(gradlePropertiesPath) !== "gradle.properties") {
    fail("Gradle properties path is malformed.");
  }
  return { buildGradlePath, gradlePropertiesPath };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const { buildGradlePath, gradlePropertiesPath } = parseArguments(process.argv.slice(2));
    writeFileSync(buildGradlePath, configureReleaseSigning(readFileSync(buildGradlePath, "utf8")));
    writeFileSync(
      gradlePropertiesPath,
      appendReleaseSigningProperties(readFileSync(gradlePropertiesPath, "utf8"), process.env),
    );
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : "release_signing_configuration_failed") + "\n");
    process.exitCode = 1;
  }
}
