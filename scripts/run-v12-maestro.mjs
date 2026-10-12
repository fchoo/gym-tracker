import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const FLOW = "maestro/v1.2/calendar.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
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

export const V12_CALENDAR_STAGE_CONTRACTS = Object.freeze({
  "drag-forward-10": Object.freeze(["start: \"70%, 45%\", end: \"60%, 45%\", duration: 160", "assertVisible: \"October 2026\""]),
  "drag-forward-24_9": Object.freeze(["start: \"70%, 45%\", end: \"45.1%, 45%\", duration: 400", "assertVisible: \"October 2026\""]),
  "drag-forward-25": Object.freeze(["start: \"70%, 45%\", end: \"45%, 45%\", duration: 400", "assertVisible: \"November 2026\""]),
  "drag-forward-25_1": Object.freeze(["start: \"70%, 45%\", end: \"44.9%, 45%\", duration: 400", "assertVisible: \"November 2026\""]),
  "drag-forward-release-below": Object.freeze(["start: \"70%, 45%\", end: \"45.1%, 45%\", duration: 320", "assertVisible: \"October 2026\""]),
  "drag-forward-release-exact": Object.freeze(["start: \"70%, 45%\", end: \"45%, 45%\", duration: 320", "assertVisible: \"November 2026\""]),
  "drag-forward-release-above": Object.freeze(["start: \"70%, 45%\", end: \"44.9%, 45%\", duration: 320", "assertVisible: \"November 2026\""]),
  "drag-backward-10": Object.freeze(["start: \"30%, 45%\", end: \"40%, 45%\", duration: 160", "assertVisible: \"October 2026\""]),
  "drag-backward-24_9": Object.freeze(["start: \"30%, 45%\", end: \"54.9%, 45%\", duration: 400", "assertVisible: \"October 2026\""]),
  "drag-backward-25": Object.freeze(["start: \"30%, 45%\", end: \"55%, 45%\", duration: 400", "assertVisible: \"September 2026\""]),
  "drag-backward-25_1": Object.freeze(["start: \"30%, 45%\", end: \"55.1%, 45%\", duration: 400", "assertVisible: \"September 2026\""]),
  "drag-backward-release-below": Object.freeze(["start: \"30%, 45%\", end: \"54.9%, 45%\", duration: 320", "assertVisible: \"October 2026\""]),
  "drag-backward-release-exact": Object.freeze(["start: \"30%, 45%\", end: \"55%, 45%\", duration: 320", "assertVisible: \"September 2026\""]),
  "drag-backward-release-above": Object.freeze(["start: \"30%, 45%\", end: \"55.1%, 45%\", duration: 320", "assertVisible: \"September 2026\""]),
  "drag-fast-subthreshold": Object.freeze(["start: \"70%, 45%\", end: \"60%, 45%\", duration: 40", "assertVisible: \"October 2026\""]),
  "drag-retreat": Object.freeze(["end: \"40%, 45%\", duration: 240", "end: \"60%, 45%\", duration: 120", "assertVisible: \"October 2026\""]),
  "drag-cancel": Object.freeze(["end: \"52%, 45%\", duration: 220", "pressKey: BACK", "assertVisible: \"October 2026\""]),
  "drag-vertical": Object.freeze(["start: \"50%, 70%\", end: \"50%, 30%\", duration: 300", "assertVisible: \"October 2026\""]),
  "drag-diagonal": Object.freeze(["start: \"50%, 70%\", end: \"58%, 30%\", duration: 300", "assertVisible: \"October 2026\""]),
  "week-expand-first-row": Object.freeze(["id: \"calendar-day-2026-09-29\"", "assertVisible: \"Collapse day and return to month\""]),
  "week-expand-middle-row": Object.freeze(["id: \"calendar-day-2026-10-14\"", "assertVisible: \"Collapse day and return to month\""]),
  "week-expand-last-row": Object.freeze(["id: \"calendar-day-2026-11-07\"", "assertVisible: \"Collapse day and return to month\""]),
  "adjacent-week": Object.freeze(["id: \"calendar-day-2026-10-31\"", "id: \"calendar-day-2026-11-01\"", "assertVisible: \"Collapse day and return to month\""]),
  "rapid-reverse-input": Object.freeze(["end: \"44.9%, 45%\", duration: 100", "end: \"55.1%, 45%\", duration: 100", "assertVisible: \"October 2026\""]),
  "second-input-interrupt": Object.freeze(["end: \"44.9%, 45%\", duration: 80", "end: \"44.9%, 45%\", duration: 80", "assertVisible: \"November 2026\""]),
  "rotation-during-transition": Object.freeze(["duration: 80", "setOrientation: LANDSCAPE", "setOrientation: PORTRAIT"]),
  "background-during-transition": Object.freeze(["duration: 80", "pressKey: HOME", "phase16CalendarStage=background-during-transition"]),
  "reduced-motion": Object.freeze(["phase16CalendarReducedMotion=true", "id: \"calendar-day-2026-10-14\"", "assertVisible: \"Collapse day and return to month\""]),
  "accessibility-keyboard": Object.freeze(["pressKey: TAB", "pressKey: DPAD_RIGHT", "pressKey: ENTER", "assertVisible: \"Collapse day and return to month\""]),
});

export function validateV12CalendarManifest(manifest, current = {}) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "v1.2-calendar" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || !GIT_HEAD.test(manifest.base_head ?? "") || !SHA256.test(manifest.source_tree_sha256 ?? "") || !SHA256.test(manifest.source_manifest_sha256 ?? "") || !SHA256.test(manifest.apk?.sha256 ?? "") || manifest.installed_apk?.matches_retained_apk !== true || manifest.installed_apk?.sha256 !== manifest.apk.sha256 || !SHA256.test(manifest.device?.identity_sha256 ?? "") || !SHA256.test(manifest.report_sha256 ?? "")) throw new Error("v12_calendar_manifest_invalid");
  if (current.head !== undefined && manifest.base_head !== current.head) throw new Error("v12_calendar_manifest_stale_head");
  if (current.source !== undefined && manifest.source_tree_sha256 !== current.source) throw new Error("v12_calendar_manifest_stale_source");
  return true;
}

export function validateV12CalendarFlow(flow) {
  if (typeof flow !== "string" || !flow.includes("calendar-tracer") || !flow.includes("PHASE16_CALENDAR_STAGE")) throw new Error("v12_calendar_flow_invalid");
  for (const stage of V12_CALENDAR_DIAGNOSTIC_STAGES) {
    const marker = `PHASE16_CALENDAR_STAGE == '${stage}'`;
    const start = flow.indexOf(marker);
    if (start < 0) throw new Error(`v12_calendar_stage_missing:${stage}`);
    const next = flow.indexOf("- runFlow:", start);
    const block = flow.slice(start, next < 0 ? flow.length : next);
    for (const expected of new Set(V12_CALENDAR_STAGE_CONTRACTS[stage])) {
      const requiredCount = V12_CALENDAR_STAGE_CONTRACTS[stage].filter((value) => value === expected).length;
      if (block.split(expected).length - 1 !== requiredCount) throw new Error(`v12_calendar_flow_stage_invalid:${stage}`);
    }
  }
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
