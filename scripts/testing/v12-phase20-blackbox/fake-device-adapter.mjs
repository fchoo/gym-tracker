#!/usr/bin/env node
// JSON-stdin fake device protocol. It intentionally contains no device serial,
// credentials, host path, or production data.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "../../v12-evidence-contract.mjs";
import { accessibilityEvidence, performanceEvidence } from "../v12-quality-evidence-fixture.mjs";
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const read = await new Promise((resolve) => { let body = ""; process.stdin.on("data", (chunk) => { body += chunk; }); process.stdin.on("end", () => resolve(JSON.parse(body))); });
const action = process.argv[3]; const fail = process.env.V12_FAKE_DEVICE_FAIL; const mutation = process.env.V12_FAKE_DEVICE_MUTATION;
if (fail && action.includes(fail)) process.exit(1);
if (mutation && action === "garmin") process.exit(1);
const png = (key, reference = false) => { const image = new PNG({ width: 200, height: 1 }); const hash = Buffer.from(sha(key), "hex"); image.data.set([hash[0], hash[1], hash[2], 255, hash[3], hash[4], hash[5], 255]); if (reference) image.data[0] ^= 1; return PNG.sync.write(image).toString("base64"); };
const sample = (index, dx = 25) => ({ timestampMs: index + 1, widthDp: 100, dxDp: dx, dyDp: 0, intentOwner: "horizontal", translationDp: dx, title: "2026-10", selectedCivilDate: "2026-10-14", generation: index + 1, focusedWeek: "week", rowBounds: [0, 48], callbackCount: index + 1, focusIdentity: "calendar", motion: "normal" });
const build = JSON.parse(readFileSync(`artifacts/native/v1.2/${read.attestation.run_id}/build.json`, 'utf8'));
const performanceIdentity = Object.freeze({ base_head: build.source.head, source_tree_sha256: build.source.tree_sha256, apk_sha256: build.build.apk.sha256, installed_apk_sha256: build.device.installed_apk_sha256, package: build.build.package, device_identity_sha256: build.device.identity_sha256, fixture_sha256: build.fixtures.registry_sha256 });
const qualityNonce = sha(read.attestation.run_id).slice(0, 48);
const sqliteCaseIds = [
  "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
  "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
];
const garminCaseIds = [
  "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery",
  "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many",
  "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign", "privacy",
];
const recoveryCaseIds = ["legacy-playback", "foreground-reconciliation", "queued-callback", "relaunch", "restore", "merge", "zero-cue", "between-set-rest-pointer"];
const recoveryCuts = ["pre-transaction", "in-transaction", "post-commit-before-ack", "post-acknowledgement", "relaunch", "retry", "offline", "recovery"];
const recoveryJunit = () => `<testsuites>${recoveryCaseIds.flatMap((caseId) => recoveryCuts.map((cut) => `<testsuite name="v12-recovery"><testcase name="${caseId}:${cut}"><properties><property name="case_id" value="${caseId}"/><property name="cut_id" value="${cut}"/><property name="receipt_sha256" value="${sha(`${caseId}:${cut}`)}"/></properties></testcase></testsuite>`)).join("")}</testsuites>`;
const response = (() => {
  if (action === "acquire-lease") return { id: "lease" }; if (action === "release-lease") return true;
  if (action === "snapshot-settings") return { id: "settings" }; if (action === "restore-settings") return true;
  if (action === "visual-capture") return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${read.payload.state_id}:${read.payload.configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } };
  if (action === "visual-capture-batch") return read.payload.captures.map(({ state_id, configuration_id }) => ({ native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${state_id}:${configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } }));
  if (action === "visual-compare") return V12_BROWSER_WALK_STATE_IDS.flatMap((id) => V12_CONFIG_IDS.map((configuration_id) => {
    const key = `${id}:${configuration_id}`;
    return {
      id,
      configuration_id,
      identity: { fixture: "v12-synthetic-fixtures-r18", clock: "2026-10-14T00:00:00Z", locale: "en-SG", timezone: "Asia/Singapore", content_bounds: { width: 390, height: 844 } },
      approved_reference_png_base64: png(key, true),
      observation: { native_execution: "EXECUTED", state_id: id, configuration_id, content: true, actions: true, copy: true, state: true, route: true, focus: true, order: true, targets: [{ width_dp: 48, height_dp: 48, overlap: false }], non_color_state: true, commit_read_only: true, geometry_dp: 0, baseline_icon_dp: 0, token_exact: true, ciede2000: 0 },
    };
  }));
  if (action === "accessibility") return accessibilityEvidence(performanceIdentity, qualityNonce);
  if (action === "performance" && read.payload.request === "identity") return { identity: performanceIdentity };
  if (action === "performance") return performanceEvidence(performanceIdentity, qualityNonce);
  if (action === "sqlite") return {
    status: "passed",
    contract: {
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: sqliteCaseIds.length,
      passed: sqliteCaseIds.length,
      failed: 0,
      skipped: 0,
      cases: sqliteCaseIds.map((id) => ({ id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 1 } })),
    },
  };
  if (action === "recovery") return recoveryJunit();
  if (action === "garmin") return {
    cases: garminCaseIds.map((id, order) => ({ id, order, status: "PASS", code: "native-passed", count: id === "match-one" ? 1 : 0 })),
  };
  if (action === "calendar") {
    const ids = ["drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1", "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above", "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1", "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above", "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal", "second-input-interrupt", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month", "rapid-reverse-input", "rotation-during-transition", "background-during-transition", "reduced-motion", "dev-01-padding", "dev-02-light-title"];
    const stage = (id, order) => ({ id, order, status: "PASS", samples: [sample(order * 2, 25), sample(order * 2 + 1, 25)], receipt: { content_width_dp: 100, start_dp: [75, 45], end_dp: [50, 45], dx_dp: -25, dy_dp: 0, event_sequence: ["pointer-down", "pointer-move", "pointer-up"], cancelled: false, settled: true, callback_count: 1, semantic_transition: { pre: "month", during: "dragging", post: "month" }, screenshot_sha256: sha(`calendar-shot:${id}`), trace_sha256: sha(`calendar-trace:${id}`), expected_outcome: id } });
    const stages = ids.map(stage);
    return { flow_sha256: read.payload.flow_sha256, flow_revision: read.payload.flow_revision, stages, junit_cases: stages.map(({ id, order, status }) => ({ id, order, status })) };
  }
  // Other actions intentionally return only a shape; the black-box test is the
  // contract that forces producers to reject anything insufficient.
  return { mutation, result: "synthetic" };
})();
const attestation = { ...read.attestation };
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "apk") attestation.apk_sha256 = "0".repeat(64);
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "device") attestation.device_identity_sha256 = "0".repeat(64);
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "source") attestation.source_tree_sha256 = "0".repeat(64);
process.stdout.write(`${JSON.stringify({ schema_version: 1, evidence_origin: "test", action, ok: true, result: response, attestation })}\n`);
