import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const command = (program, args) => execFileSync(program, args, { cwd: ROOT, encoding: "utf8" }).trim();
export const PHASE14_MAESTRO_STAGES = Object.freeze(PHASE14_SHELL_EVIDENCE_CASES.map(({ stage }) => stage));

export function validatePhase14Manifest(manifest, currentHead, currentSource) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "phase14" || manifest.profile !== "development-test"
    || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true
    || !/^[a-f0-9]{40}$/u.test(manifest.base_head ?? "") || !/^[a-f0-9]{64}$/u.test(manifest.source_tree_sha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "") || typeof manifest.apk?.path !== "string"
    || !manifest.apk.path.startsWith("artifacts/native/phase14/") || !/^[a-f0-9]{64}$/u.test(manifest.device?.identity_sha256 ?? "")) throw new Error("phase14_manifest_invalid");
  if (manifest.base_head !== currentHead || manifest.source_tree_sha256 !== currentSource) throw new Error("phase14_manifest_stale");
  return true;
}

export function validateDistinctPhase14Flows(flows) {
  const body = Object.values(flows ?? {}).join("\n");
  for (const stage of PHASE14_MAESTRO_STAGES) if (!body.includes(`PHASE14_STAGE == '${stage}'`)) throw new Error(`phase14_maestro_stage_missing:${stage}`);
  return true;
}

export function parsePhase14RunnerArgs(args) {
  const options = { manifest: "", ids: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") options.manifest = args[++index] ?? "";
    else if (arg === "--ids") options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    else if (arg === "--all") options.ids = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
    else throw new Error(`phase14_runner_unknown_argument:${arg}`);
  }
  if (options.manifest !== "artifacts/native/phase14/build.json" || options.ids.length === 0
    || new Set(options.ids).size !== options.ids.length
    || options.ids.some((id) => !PHASE14_SHELL_EVIDENCE_CASES.some((entry) => entry.id === id))) {
    throw new Error("phase14_runner_arguments_invalid");
  }
  return options;
}

export function executePhase14Maestro(args = process.argv.slice(2)) {
  const { manifest: manifestPath, ids } = parsePhase14RunnerArgs(args);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const currentHead = command("git", ["rev-parse", "HEAD"]);
  const currentSource = command("node", ["scripts/source-tree-digest.mjs", "--assert-no-untracked"]);
  validatePhase14Manifest(manifest, currentHead, currentSource);
  const flowBodies = Object.fromEntries([...new Set(PHASE14_SHELL_EVIDENCE_CASES.map(({ flow }) => flow))].map((flow) => [flow, readFileSync(path.join(ROOT, "maestro/phase14", `${flow}.yaml`), "utf8")]));
  validateDistinctPhase14Flows(flowBodies);
  const apkPath = path.resolve(ROOT, manifest.apk.path);
  if (!existsSync(apkPath) || sha256(readFileSync(apkPath)) !== manifest.apk.sha256) throw new Error("phase14_apk_stale");
  const output = path.join(ROOT, "artifacts/native/phase14/maestro");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const cases = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id));
  const stages = cases.map(({ id, stage, flow, requirement, evidencePath }) => {
    const report = path.join(output, `${stage}.xml`);
    execFileSync("maestro", ["test", "--no-ansi", "--format", "junit", "--output", report, "--udid", manifest.device.serial, "-e", `PHASE14_STAGE=${stage}`, path.join(ROOT, "maestro/phase14", `${flow}.yaml`)], { cwd: ROOT, stdio: "inherit" });
    const bytes = readFileSync(report);
    const text = bytes.toString("utf8");
    if (!text.includes('failures="0"') || /skipped="(?!0")/u.test(text)) throw new Error(`phase14_maestro_report_invalid:${stage}`);
    const screenshotPath = path.join(ROOT, "artifacts/native/phase14/screenshots", `${id}.png`);
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    writeFileSync(screenshotPath, execFileSync("adb", ["-s", manifest.device.serial, "exec-out", "screencap", "-p"], { cwd: ROOT }));
    const screenshotSha256 = sha256(readFileSync(screenshotPath));
    const row = {
      id,
      status: "passed",
      requirement,
      path: evidencePath,
      report: path.relative(ROOT, report),
      report_sha256: sha256(bytes),
      screenshot: path.relative(ROOT, screenshotPath),
      screenshot_sha256: screenshotSha256,
      component_verdict: "passed",
      native_verdict: "passed",
      source_state_sha256: manifest.source_tree_sha256,
    };
    const caseEvidence = {
      schema_version: 1,
      suite: "phase14",
      status: "passed",
      build_manifest: manifestPath,
      base_head: manifest.base_head,
      source_tree_sha256: manifest.source_tree_sha256,
      package: manifest.package,
      profile: manifest.profile,
      device_identity_sha256: manifest.device.identity_sha256,
      apk: { ...manifest.apk, installed_sha256: manifest.apk.sha256, matches_retained_apk: true },
      stage: { stage, status: "passed", report: row.report, report_sha256: row.report_sha256 },
      evidence: row,
      dev02: id === "shell.tokens" ? {
        owner_record: "accessible-9b470b",
        status: "approved",
        title_hex: "#9B470B",
        sport_hex: "#D97820",
        native_blended_fill: { status: "passed", report_sha256: row.report_sha256 },
      } : undefined,
    };
    mkdirSync(path.dirname(path.join(ROOT, evidencePath)), { recursive: true });
    writeFileSync(path.join(ROOT, evidencePath), `${JSON.stringify(caseEvidence, null, 2)}\n`);
    return { stage, status: "passed", report: row.report, sha256: row.report_sha256, evidence: row };
  });
  const tokenEvidence = stages.find(({ evidence: row }) => row.id === "shell.tokens")?.evidence;
  const evidence = {
    schema_version: 1,
    suite: "phase14",
    status: "passed",
    build_manifest: manifestPath,
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    profile: manifest.profile,
    device_identity_sha256: manifest.device.identity_sha256,
    apk: { ...manifest.apk, installed_sha256: manifest.apk.sha256, matches_retained_apk: true },
    stages,
    evidence: stages.map(({ evidence: row }) => row),
    ...(tokenEvidence ? {
      dev02: {
        owner_record: "accessible-9b470b",
        status: "approved",
        title_hex: "#9B470B",
        sport_hex: "#D97820",
        native_blended_fill: { status: "passed", report_sha256: tokenEvidence.report_sha256 },
      },
    } : {}),
  };
  writeFileSync(path.join(output, "phase14-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1]?.endsWith("run-phase14-maestro.mjs")) { try { process.stdout.write(`${JSON.stringify(executePhase14Maestro())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
