#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const invalidMessage =
  "validate-development-test-app-config: invalid development-test app config.\n";

const rejectConfig = () => {
  process.stderr.write(invalidMessage);
  process.exit(1);
};

const [apkPath, ...extraArguments] = process.argv.slice(2);
if (!apkPath || extraArguments.length > 0) {
  rejectConfig();
}

let entries;
let embeddedConfig;
try {
  entries = execFileSync(
    "unzip",
    ["-Z1", apkPath],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).split(/\r?\n/u).filter(Boolean);
  if (
    entries.filter((entry) => entry === "assets/index.android.bundle").length !== 1
    || entries.filter((entry) => entry === "assets/app.config").length !== 1
  ) {
    rejectConfig();
  }
  embeddedConfig = execFileSync(
    "unzip",
    ["-p", apkPath, "assets/app.config"],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
} catch {
  rejectConfig();
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
) {
  rejectConfig();
}
