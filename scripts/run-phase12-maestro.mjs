import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";
const FLOW = "maestro/phase12/automatic-drive-backup.yaml";
export const PHASE12_MAESTRO_STAGES = Object.freeze(["disconnected", "no_cloud", "backup_pending", "backing_up", "backed_up", "auth_attention", "checking", "restoring", "finishing", "restore_required", "merge_review", "previous_available", "update_required", "invalid_artifacts", "pending_24h", "stale_writer", "deleted", "deletion_partial"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const command = (program, args) => execFileSync(program, args, { cwd: ROOT, encoding: "utf8" }).trim();
export function validatePhase12Manifest(manifest, currentHead, currentSource) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "phase12" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || typeof manifest.apk?.path !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "") || manifest.base_head !== currentHead || manifest.source_tree_sha256 !== currentSource) throw new Error("manifest is not a current Phase 12 development-test APK contract");
  return true;
}
export function validateDistinctPhase12Flow(flow) {
  for (const stage of PHASE12_MAESTRO_STAGES) {
    if (!flow.includes(`PHASE12_STAGE == '${stage}'`)) throw new Error(`phase12_maestro_stage_missing:${stage}`);
  }
  const assertions = [...flow.matchAll(/assertVisible:\s*"([^"]+)"/gu)].map((match) => match[1]);
  if (new Set(assertions).size < PHASE12_MAESTRO_STAGES.length) throw new Error("phase12_maestro_assertions_repeated");
  return true;
}
export function parseArguments(args) { const index = args.indexOf("--manifest"); if (index < 0 || args[index + 1] === undefined) throw new Error("--manifest is required"); return { manifest: args[index + 1] }; }
export function executePhase12Maestro(args = process.argv.slice(2)) {
  const { manifest: manifestPath } = parseArguments(args);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = command("git", ["rev-parse", "HEAD"]);
  const source = command("node", ["scripts/source-tree-digest.mjs", "--assert-no-untracked"]);
  validatePhase12Manifest(manifest, head, source);
  validateDistinctPhase12Flow(readFileSync(FLOW, "utf8"));
  const apk = path.resolve(ROOT, manifest.apk.path);
  if (!existsSync(apk) || sha256(readFileSync(apk)) !== manifest.apk.sha256) throw new Error("APK bytes are stale");
  const reportDirectory = path.join(ROOT, "artifacts/native/phase12/maestro");
  rmSync(reportDirectory, { recursive: true, force: true }); mkdirSync(reportDirectory, { recursive: true });
  const results = PHASE12_MAESTRO_STAGES.map((stage) => {
    const report = path.join(reportDirectory, `${stage}.xml`);
    execFileSync("maestro", ["test", "--no-ansi", "--format", "junit", "--output", report, "--udid", manifest.device.serial, "-e", `PHASE12_STAGE=${stage}`, path.join(ROOT, FLOW)], { cwd: ROOT, stdio: "inherit" });
    const bytes = readFileSync(report);
    const reportText = bytes.toString("utf8");
    if (!reportText.includes("failures=\"0\"") || /skipped="(?!0")/u.test(reportText)) throw new Error(`invalid Maestro report: ${stage}`);
    return { stage, report: path.relative(ROOT, report), sha256: sha256(bytes) };
  });
  const evidence = {
    schema_version: 1,
    suite: "phase12",
    status: "passed",
    build_manifest: manifestPath,
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    stages: results,
  };
  writeFileSync(path.join(reportDirectory, "phase12-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}
if (process.argv[1]?.endsWith("run-phase12-maestro.mjs")) { try { process.stdout.write(`${JSON.stringify(executePhase12Maestro())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
