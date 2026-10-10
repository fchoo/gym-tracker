#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PHASE15_EVIDENCE_CASE_IDS } from "../src/testing/contracts/phase15Workout.contract.ts";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function validatePhase15NativeManifest(manifest, currentHead, currentSource) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "phase15" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || manifest.base_head !== currentHead || manifest.source_tree_sha256 !== currentSource || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "") || manifest.installed_apk?.matches_retained_apk !== true || manifest.installed_apk?.sha256 !== manifest.apk?.sha256 || !manifest.device?.serial || !Number.isInteger(manifest.device?.api_level) || !manifest.device?.abi) throw new Error("phase15_manifest_invalid");
  return true;
}

export function createPhase15RunnerPlan(manifest) {
  return Object.freeze({ suite: "phase15", package: manifest.package, evidence_case_ids: PHASE15_EVIDENCE_CASE_IDS, sqlite_contract: "expo-sqlite-authoritative", disallow_fixture_only: true, required_actions: ["preview", "start", "save", "complete", "rest", "finish", "completion", "keep-plan-as-is"] });
}

export function executePhase15Maestro(args = process.argv.slice(2)) {
  const index = args.indexOf("--manifest");
  if (index < 0 || !args[index + 1]) throw new Error("--manifest is required");
  const manifestPath = args[index + 1];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  validatePhase15NativeManifest(manifest, head, sourceTreeSha256(ROOT));
  const apk = path.join(ROOT, manifest.apk.path);
  if (!existsSync(apk) || sha256(readFileSync(apk)) !== manifest.apk.sha256) throw new Error("phase15_apk_stale");
  throw new Error("phase15_native_matrix_owned_by_15_12");
}

if (process.argv[1]?.endsWith("run-phase15-maestro.mjs")) { try { process.stdout.write(`${JSON.stringify(executePhase15Maestro())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
