#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const androidRoot = path.resolve(process.argv[2] ?? "android");
const failures = [];
const read = (relativePath) => {
  try {
    return readFileSync(path.join(androidRoot, relativePath), "utf8");
  } catch {
    failures.push(`missing generated production file: ${relativePath}`);
    return "";
  }
};
const requireMatch = (value, pattern, message) => {
  if (!pattern.test(value)) failures.push(message);
};
const requireExclusions = (value, section, output) => {
  const selected = section === null
    ? value
    : value.match(new RegExp(`<${section}>[\\s\\S]*?</${section}>`, "u"))?.[0] ?? "";
  for (const [domain, excludedPath] of [
    ["database", "."],
    ["root", "backup-staging"],
    ["root", "plaintext-staging"],
    ["file", "backup-staging"],
    ["file", "plaintext-staging"],
    ["external", "backup-staging"],
    ["external", "plaintext-staging"],
  ]) {
    if (!selected.includes(`<exclude domain="${domain}" path="${excludedPath}" />`)) {
      output.push(`production ${section ?? "backup"} rules omit ${domain}:${excludedPath}`);
    }
  }
};

export function validateGeneratedProductionAndroidSources({
  gradle, gradleProperties, manifest, strings, backup, extraction,
}) {
  const output = [];
  const match = (value, pattern, message) => { if (!pattern.test(value)) output.push(message); };
  match(gradle, /applicationId\s+["']com\.fchoo\.gymtracker["']/u, "production applicationId is missing");
  match(
    gradleProperties,
    /^reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64$/mu,
    "production React Native architectures must retain the full ABI set",
  );
  match(manifest, /<data[^>]*android:scheme="gymtracker"/u, "production URL scheme is missing");
  match(strings, /<string name="app_name">Gym Tracker<\/string>/u, "production app label is missing");
  match(manifest, /android:fullBackupContent="@xml\/backup_rules"/u, "production full backup rules are not linked");
  match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/u, "production D2D rules are not linked");
  if (/devtest|GymTrackerPhysicalTestService/iu.test(`${gradle}\n${manifest}\n${strings}`)) {
    output.push("production generated Android contains development-test identity or service");
  }
  requireExclusions(backup, null, output);
  requireExclusions(extraction, "cloud-backup", output);
  requireExclusions(extraction, "device-transfer", output);
  return output;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const sourceFailures = validateGeneratedProductionAndroidSources({
    gradle: read("app/build.gradle"),
    gradleProperties: read("gradle.properties"),
    manifest: read("app/src/main/AndroidManifest.xml"),
    strings: read("app/src/main/res/values/strings.xml"),
    backup: read("app/src/main/res/xml/backup_rules.xml"),
    extraction: read("app/src/main/res/xml/data_extraction_rules.xml"),
  });
  failures.push(...sourceFailures);
  if (failures.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("phase5-source-gate: passed production generated Android, backup, and D2D rules\n");
  }
}
