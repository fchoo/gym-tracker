#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import { GOOGLE_OAUTH_REGISTRATIONS } from "./google-oauth-config.mjs";

const invalidMessage =
  "validate-development-test-app-config: invalid development-test app config.\n";

const rejectConfig = () => {
  process.stderr.write(invalidMessage);
  process.exit(1);
};

const [apkPath, ...extraArguments] = process.argv.slice(2);
if (extraArguments.length > 0) {
  rejectConfig();
}

let embeddedConfig;
if (apkPath) {
  try {
    const entries = execFileSync("unzip", ["-Z1", apkPath], {
      encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/u).filter(Boolean);
    if (
      entries.filter((entry) => entry === "assets/index.android.bundle").length !== 1
      || entries.filter((entry) => entry === "assets/app.config").length !== 1
    ) rejectConfig();
    embeddedConfig = execFileSync("unzip", ["-p", apkPath, "assets/app.config"], {
      encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { rejectConfig(); }
} else {
  try {
    embeddedConfig = execFileSync("npx", ["expo", "config", "--json"], {
      encoding: "utf8", maxBuffer: 1024 * 1024,
      env: { ...process.env, GYM_TRACKER_BUILD_PROFILE: "development-test" },
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { rejectConfig(); }
}

let config;
try {
  config = JSON.parse(embeddedConfig);
} catch {
  rejectConfig();
}

if (
  config === null
  || typeof config !== "object"
  || Array.isArray(config)
  || config.extra?.buildProfile !== "development-test"
  || config.extra?.nativeContractsEnabled !== true
  || config.scheme !== "gymtracker-devtest"
  || config.android?.package !== "com.fchoo.gymtracker.devtest"
  || config.extra?.googleOAuth?.projectNumber !== GOOGLE_OAUTH_REGISTRATIONS.projectNumber
  || config.extra?.googleOAuth?.webClientId !== GOOGLE_OAUTH_REGISTRATIONS.webClientId
  || config.extra?.googleOAuth?.androidClientId !== GOOGLE_OAUTH_REGISTRATIONS.developmentTest.androidClientId
  || config.extra?.googleOAuth?.packageName !== GOOGLE_OAUTH_REGISTRATIONS.developmentTest.packageName
  || config.extra?.googleOAuth?.signingCertificate?.sha1 !== GOOGLE_OAUTH_REGISTRATIONS.developmentTest.sha1
  || config.extra?.googleOAuth?.signingCertificate?.sha256 !== GOOGLE_OAUTH_REGISTRATIONS.developmentTest.sha256
) {
  rejectConfig();
}
