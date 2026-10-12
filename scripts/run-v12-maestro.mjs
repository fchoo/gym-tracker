import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const FLOW = "maestro/v1.2/calendar.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const V12_CALENDAR_DIAGNOSTIC_STAGES = Object.freeze([
  "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
  "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
  "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
  "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
  "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
  "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week",
  "rapid-reverse-input", "second-input-interrupt", "rotation-during-transition", "background-during-transition",
  "reduced-motion", "accessibility-keyboard",
]);

export function validateV12CalendarManifest(manifest, current = {}) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "v1.2-calendar" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || !SHA256.test(manifest.base_head ?? "") || !SHA256.test(manifest.source_tree_sha256 ?? "") || !SHA256.test(manifest.apk?.sha256 ?? "") || manifest.installed_apk?.matches_retained_apk !== true || manifest.installed_apk?.sha256 !== manifest.apk.sha256 || !SHA256.test(manifest.device?.identity_sha256 ?? "")) throw new Error("v12_calendar_manifest_invalid");
  if (current.head !== undefined && manifest.base_head !== current.head) throw new Error("v12_calendar_manifest_stale_head");
  if (current.source !== undefined && manifest.source_tree_sha256 !== current.source) throw new Error("v12_calendar_manifest_stale_source");
  return true;
}

export function validateV12CalendarFlow(flow) {
  if (typeof flow !== "string" || !flow.includes("calendar-tracer") || !flow.includes("PHASE16_CALENDAR_STAGE")) throw new Error("v12_calendar_flow_invalid");
  for (const stage of V12_CALENDAR_DIAGNOSTIC_STAGES) if (!flow.includes(`PHASE16_CALENDAR_STAGE == '${stage}'`)) throw new Error(`v12_calendar_stage_missing:${stage}`);
  if (!flow.includes("takeScreenshot")) throw new Error("v12_calendar_capture_missing");
  return true;
}

export function createV12CalendarRunnerPlan(manifest) {
  return Object.freeze({
    suite: "v1.2-calendar",
    native_execution: "NOT_RUN",
    phase20_deferred: true,
    package: manifest.package,
    stages: V12_CALENDAR_DIAGNOSTIC_STAGES,
    flow_sha256: sha256(readFileSync(path.join(ROOT, FLOW))),
    identity: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, apk_sha256: manifest.apk.sha256, device_identity_sha256: manifest.device.identity_sha256 },
    prohibited_verdicts: ["PASS", "FAIL"],
  });
}

export function executeV12Maestro(args = process.argv.slice(2)) {
  if (!args.includes("--diagnostic")) throw new Error("v12_calendar_diagnostic_flag_required");
  const manifestIndex = args.indexOf("--manifest");
  if (manifestIndex < 0 || args[manifestIndex + 1] === undefined) throw new Error("v12_calendar_manifest_required");
  const manifestPath = path.resolve(ROOT, args[manifestIndex + 1]);
  if (!existsSync(manifestPath)) throw new Error("v12_calendar_manifest_missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  validateV12CalendarManifest(manifest, { head, source: sourceTreeSha256(ROOT) });
  validateV12CalendarFlow(readFileSync(path.join(ROOT, FLOW), "utf8"));
  throw new Error("v12_calendar_native_execution_phase20_only");
}

if (process.argv[1]?.endsWith("run-v12-maestro.mjs")) {
  try { process.stdout.write(`${JSON.stringify(executeV12Maestro())}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
