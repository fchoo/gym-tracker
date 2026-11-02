#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const IDENTITY_KEYS = Object.freeze(["serial", "abi", "apiLevel", "model"]);
const SAFE_FACT = /^[^\u0000\r\n]{1,512}$/u;
const API_LEVEL = /^\d{2,3}$/u;

function invalid() {
  throw new Error("phase18_device_identity_invalid");
}

export function phase18DeviceIdentitySha256(facts) {
  if (
    facts === null
    || typeof facts !== "object"
    || Array.isArray(facts)
    || Object.keys(facts).length !== IDENTITY_KEYS.length
    || IDENTITY_KEYS.some((key) => !Object.hasOwn(facts, key))
    || !SAFE_FACT.test(facts.serial)
    || !SAFE_FACT.test(facts.abi)
    || !API_LEVEL.test(facts.apiLevel)
    || !SAFE_FACT.test(facts.model)
  ) invalid();

  return createHash("sha256").update(JSON.stringify({
    serial: facts.serial,
    abi: facts.abi,
    apiLevel: facts.apiLevel,
    model: facts.model,
  })).digest("hex");
}

function identityFromStdin(input) {
  const lines = input.endsWith("\n")
    ? input.slice(0, -1).split("\n")
    : input.split("\n");
  if (lines.length !== IDENTITY_KEYS.length) invalid();
  return phase18DeviceIdentitySha256(Object.fromEntries(
    IDENTITY_KEYS.map((key, index) => [key, lines[index]]),
  ));
}

function runCli() {
  try {
    process.stdout.write(`${identityFromStdin(readFileSync(0, "utf8"))}\n`);
  } catch {
    process.stderr.write("phase18_device_identity_invalid\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
