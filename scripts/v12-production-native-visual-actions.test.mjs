import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { executeProductionVisualAction, resolveV12ProductionVisualConfiguration } from "./v12-production-native-visual-actions.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runId = "phase20-20261015T000000Z-aaaaaaaaaaaa";
const config = "AP-L-C390-P-F100";
const fixtureId = "v12-synthetic-fixtures-r18";

// A controlled *tool boundary*, not an adapter. The same implementation is
// serialized to fake adb/Maestro executables for the non-test launcher process.
function controlledTool(state, executable, args, options = {}) {
  const ok = (stdout = "") => ({ status: 0, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) });
  const bad = () => ({ status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from("/private/device-private bearer") });
  state.commands.push([executable, ...args]);
  if (executable === "maestro") {
    if (state.noRoute && args.includes("VISUAL_MODE=capture")) return bad();
    const entry = args.find((v) => v.startsWith("VISUAL_LINK="));
    if (!entry) return bad();
    const link = new URL(entry.slice("VISUAL_LINK=".length));
    state.nonce = link.searchParams.get("nonce");
    state.stateId = link.searchParams.get("state");
    state.configurationId = link.searchParams.get("configuration");
    state.mode = link.searchParams.get("mode");
    state.routeParams = Object.fromEntries(link.searchParams);
    state.screenId = args.find((value) => value.startsWith("VISUAL_SCREEN_ID="))?.slice("VISUAL_SCREEN_ID=".length);
    state.readyId = args.find((value) => value.startsWith("VISUAL_READY_ID="))?.slice("VISUAL_READY_ID=".length);
    return ok();
  }
  if (executable !== "adb" || args[0] !== "-s" || args[1] !== "device-private") return bad();
  const a = args.slice(2);
  if (a[0] === "get-state") return ok(state.offline ? "offline" : "device");
  if (a[0] === "exec-out" && a[1] === "screencap") {
    if (state.invalidPng) return ok("not a png");
    return ok(Buffer.from(state.configurationId.includes("-D-") ? state.darkPng : state.png, "base64"));
  }
  if (a[0] === "logcat") {
    if (state.missingMarker) return ok();
    const parts = state.configurationId.split("-");
    const visual = state.visualState;
    const viewport = { C360: [360, 800], C390: [390, 844], M600: [600, 960], X840: [840, 1080] }[parts[2]];
    const portrait = parts[3] === "P";
    const marker = {
      schema_version: 1, nonce: state.staleMarker ? "0".repeat(32) : state.nonce,
      state_id: state.wrongState && state.mode === "capture" ? "BW-002" : state.stateId,
      configuration_id: state.configurationId, fixture_id: fixtureId,
      mode: state.mode, status: state.mode === "reset" ? "reset" : "ready",
      appearance: state.mode === "reset" ? "System" : parts[1] === "L" ? "Light" : parts[1] === "D" ? "Dark" : "System",
      color_scheme: parts[1].startsWith("S") ? state.night === "yes" ? "dark" : "light" : parts[1] === "D" ? "dark" : "light",
      width_dp: state.wrongConfig ? 360 : portrait ? viewport[0] : viewport[1], height_dp: portrait ? viewport[1] : viewport[0], screen_width_dp: portrait ? viewport[0] : viewport[1], screen_height_dp: portrait ? viewport[1] : viewport[0],
      font_scale: state.mode === "reset" ? Number(state.settings.font_scale) : 1,
      density: 1, route: "/__phase20-visual-probe", source_state: "plan-type-chooser",
      source_route: "/library/plan/create", source_component: "PlanTypeChooserScreen",
      fixture_seed: visual.fixture_seed, fixture_variant: visual.fixture_variant, scenario: visual.scenario,
      screen_test_id: visual.readiness.screen_test_id, readiness_test_ids: visual.readiness.test_ids,
      readiness_semantics: visual.readiness.semantics, readiness_actions: visual.readiness.actions,
      readiness_order: visual.readiness.order, readiness_non_color: visual.readiness.non_color,
      focus_target: visual.readiness.focus.target,
      evidence_scope: "production_screen",
      source_revision: 18, source_read_only: true,
    };
    if (state.mode === "reset" && state.badReset) marker.appearance = "Dark";
    if (state.extraMarkerField && state.mode === "capture") marker.private = "/private/device-private";
    return ok(`PHASE20_VISUAL_RESULT ${JSON.stringify(marker)}`);
  }
  // The production module uses shell-quoted argument strings, never payload text.
  if (a[0] !== "shell") return bad();
  const s = a[1].match(/'([^']*)'/gu)?.map((v) => v.slice(1, -1)) ?? [];
  if (s[0] === "getprop") return ok(state.props[s[1]] ?? "");
  if (s[0] === "am" && s[1] === "start") return ok("Status: ok");
  if (s[0] === "pm") return ok("package:/data/app/controlled/base.apk");
  if (s[0] === "sha256sum") return ok(`${state.wrongApk ? "0".repeat(64) : state.apkHash}  base.apk`);
  if (s[0] === "cat" && s[1].endsWith("owner.json")) return ok(JSON.stringify(state.lease));
  if (s[0] === "cat" && s[1].endsWith("restore.json")) return ok(state.badSnapshot ? "{}" : state.savedSnapshot);
  if (s[0] === "mkdir") { if (state.lock) return bad(); state.lock = true; return ok(); }
  if (s[0] === "rmdir") { state.lock = false; return ok(); }
  if (a[1].startsWith("cat >")) { state.savedSnapshot = options.input; return ok(); }
  if (s[0] === "rm") return ok();
  if (s[0] === "settings") {
    const key = s[3];
    if (s[1] === "get") return ok(state.settings[key] ?? "null");
    if (state.failedRestore && key === "font_scale" && s[4] === "1.15") return bad();
    if (s[1] === "delete") delete state.settings[key];
    else state.settings[key] = s[4];
    return ok();
  }
  if (s[0] === "wm") {
    const key = s[1];
    if (s.length === 2) return ok(`Physical ${key}: ${key === "size" ? "1080x2400" : "420"}${state[key] ? `\nOverride ${key}: ${state[key]}` : ""}`);
    state[key] = s[2] === "reset" ? null : s[2]; return ok();
  }
  if (s[0] === "cmd" && s[1] === "uimode") {
    if (s.length === 3) return ok(`Night mode: ${state.night}`);
    state.night = s[3]; return ok();
  }
  if (s[0] === "uiautomator") return ok();
  if (s[0] === "cat" && s[1].endsWith("window.xml")) {
    if (state.wrongTree) return ok('<hierarchy><node text="Private screen" /></hierarchy>');
    const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    const ids = state.visualState.readiness.test_ids.map((id, index) => `<node resource-id="${escape(id)}" package="com.fchoo.gymtracker.devtest" clickable="${index === 0 ? "true" : "false"}" enabled="true" focusable="true" focused="${id === state.visualState.readiness.focus.target ? "true" : "false"}" bounds="[16,${20 + index * 2}][374,${68 + index * 2}]" />`);
    const semantics = state.visualState.readiness.semantics.map((text, index) => `<node text="${escape(text)}" package="com.fchoo.gymtracker.devtest" bounds="[16,${100 + index * 50}][374,${148 + index * 50}]" />`);
    const actions = state.visualState.readiness.actions.map((entry, index) => { const left = index % 2 === 0 ? 10 : 200; const top = 220 + Math.floor(index / 2) * 52; return `<node ${entry.id ? `resource-id="${escape(entry.id)}"` : ""} content-desc="${escape(entry.label ?? entry.id)}" package="com.fchoo.gymtracker.devtest" clickable="true" enabled="true" selected="false" focusable="true" focused="false" bounds="[${left},${top}][${left + 170},${top + 48}]" />`; });
    return ok(`<hierarchy>${ids.join("")}${semantics.join("")}${actions.join("")}</hierarchy>`);
  }
  return bad();
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-visual-controlled-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const relative of ["scripts", "app/__phase20-visual-probe.tsx", "src/testing/phase20VisualProbe.tsx", "src/testing/phase20VisualStateRegistry.json", "maestro/v1.2/visual-production-states.yaml", ".planning/design/v1.2-browser-evidence"]) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    cpSync(path.join(project, relative), path.join(root, relative), { recursive: true });
  }
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const runDir = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runDir, { recursive: true });
  const apk = Buffer.from("controlled APK, not native evidence");
  writeFileSync(path.join(runDir, "test.apk"), apk);
  const facts = { serial: "device-private", abi: "arm64-v8a", apiLevel: "36", model: "controlled" };
  const attestation = { schema_version: 1, action: "visual-capture", launcher_source_sha256: hash(readFileSync(path.join(root, "scripts/v12-production-native-adapter-launcher.mjs"))), run_id: runId, build_profile: "development-test", suite: "v1.2-acceptance", source_tree_sha256: sourceTreeSha256(root), apk_sha256: hash(apk), installed_apk_sha256: hash(apk), apk_signature_sha256: hash("signature"), device_identity_sha256: phase18DeviceIdentitySha256(facts), package: "com.fchoo.gymtracker.devtest" };
  const manifest = { run_id: runId, mode: "live", source: { tree_sha256: attestation.source_tree_sha256 }, build: { profile: "development-test", package: attestation.package, apk: { path: `artifacts/native/v1.2/${runId}/test.apk`, sha256: hash(apk), signature_sha256: attestation.apk_signature_sha256 } }, device: { identity_sha256: attestation.device_identity_sha256, installed_apk_sha256: hash(apk) } };
  writeFileSync(path.join(runDir, "build.json"), JSON.stringify(manifest));
  const image = new PNG({ width: 390, height: 844 }); image.data.fill(255);
  const png = PNG.sync.write(image).toString("base64"); image.data.fill(50);
  const visualState = JSON.parse(readFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.json"), "utf8")).find(({ id }) => id === "BW-054");
  const state = { commands: [], visualState, settings: { font_scale: "1.15", accelerometer_rotation: "1", user_rotation: "0" }, size: null, density: null, night: "auto", png, darkPng: PNG.sync.write(image).toString("base64"), apkHash: hash(apk), props: { "ro.product.cpu.abi": facts.abi, "ro.build.version.sdk": facts.apiLevel, "ro.product.model": facts.model }, lease: { lease_id: "a".repeat(48), native_execution: "EXECUTED", run_id: runId, device_identity_sha256: attestation.device_identity_sha256, settings: {} } };
  const payload = { run_id: runId, state_id: "BW-054", configuration_id: config, fixture_id: fixtureId };
  const call = (action = "visual-capture", body = payload, overrides = {}) => executeProductionVisualAction({ action, payload: body, attestation: { ...attestation, action }, root, serial: facts.serial, runCommand: (exe, args, options) => controlledTool(state, exe, args, options), ...overrides });
  return { root, runDir, state, payload, call, attestation, manifest };
}

test("non-owned actions do no work", async () => {
  assert.equal(await executeProductionVisualAction({ action: "sqlite" }), undefined);
});
test("production configuration resolves the exact required portrait and landscape bounds", () => {
  assert.deepEqual(resolveV12ProductionVisualConfiguration("AP-L-C360-P-F100"), { id: "AP-L-C360-P-F100", appearance: "Light", scheme: "light", size: "C360", orientation: "P", width: 360, height: 800, fontScale: 1 });
  assert.deepEqual(resolveV12ProductionVisualConfiguration("AP-D-C390-L-F200"), { id: "AP-D-C390-L-F200", appearance: "Dark", scheme: "dark", size: "C390", orientation: "L", width: 844, height: 390, fontScale: 2 });
  assert.deepEqual(resolveV12ProductionVisualConfiguration("AP-SL-M600-P-F100"), { id: "AP-SL-M600-P-F100", appearance: "System", scheme: "light", size: "M600", orientation: "P", width: 600, height: 960, fontScale: 1 });
  assert.deepEqual(resolveV12ProductionVisualConfiguration("AP-SD-X840-L-F100"), { id: "AP-SD-X840-L-F100", appearance: "System", scheme: "dark", size: "X840", orientation: "L", width: 1080, height: 840, fontScale: 1 });
});
test("capture binds actual PNG, state/configuration and UI geometry, then reads back every setting", async (t) => {
  const f = fixture(t); const result = await f.call();
  assert.equal(result.fixture_id, fixtureId);
  assert.equal(result.native_execution, "EXECUTED");
  assert.equal(result.png_base64, f.state.png);
  assert.equal(result.settings.restored, true);
  assert.equal(result.settings.privacy, "synthetic-only");
  assert.equal(result.settings.state_receipt.state_id, "BW-054");
  assert.equal(result.settings.state_receipt.configuration_id, config);
  assert.equal(result.settings.state_receipt.png_sha256, hash(Buffer.from(f.state.png, "base64")));
  assert.equal(result.settings.observation.targets.length, 1 + f.state.visualState.readiness.actions.length);
  assert.equal(result.settings.observation.targets.every((target) => target.width_dp >= 48 && target.height_dp >= 48 && target.overlap === false), true);
  assert.deepEqual(f.state.settings, { font_scale: "1.15", accelerometer_rotation: "1", user_rotation: "0" });
  assert.equal(f.state.size, null); assert.equal(f.state.density, null); assert.equal(f.state.night, "auto");
  assert.equal(f.state.lock, false);
  assert.equal(f.state.screenId, "plan-type-chooser");
  assert.equal(f.state.readyId, "plan-type-chooser");
  const readyAck = f.state.commands.find((command) => command[0] === "adb" && command.join(" ").includes("android.intent.action.VIEW"));
  assert.match(readyAck?.join(" ") ?? "", /[?&]ready=[a-f0-9]{32}/u);
  assert.doesNotMatch(JSON.stringify(result), /device-private|\/private\/|\/Users\//u);
});
test("batch preserves requested configuration order and individually bound receipts", async (t) => {
  const f = fixture(t);
  const items = [{ ...f.payload, configuration_id: "AP-D-C390-P-F100" }, f.payload];
  const results = await f.call("visual-capture-batch", { run_id: runId, captures: items });
  assert.deepEqual(results.map((x) => x.settings.state_receipt.configuration_id), items.map((x) => x.configuration_id));
  assert.notEqual(results[0].png_base64, results[1].png_base64);
  assert.notEqual(results[0].settings.state_receipt.nonce, results[1].settings.state_receipt.nonce);
  assert.ok(results.every((x) => x.settings.restored));
  await assert.rejects(f.call("visual-capture-batch", { run_id: runId, captures: Array.from({ length: 5 }, () => f.payload) }), /payload_invalid/u);
});
test("System light to dark switches in place and preserves the mounted state receipt", async (t) => {
  const f = fixture(t); const systemDark = { ...f.payload, configuration_id: "AP-SD-C390-P-F100" };
  const result = await f.call("visual-capture", systemDark);
  assert.deepEqual(result.settings.state_receipt.system_transition.before, result.settings.state_receipt.system_transition.after);
  assert.equal(result.settings.state_receipt.system_transition.mounted_nonce, result.settings.state_receipt.nonce);
  const captureRoutes = f.state.commands.filter((command) => command[0] === "maestro" && command.includes("VISUAL_MODE=capture"));
  assert.equal(captureRoutes.length, 1);
});
for (const [mutation, code] of [["wrongState", "state_mismatch"], ["wrongConfig", "configuration_mismatch"], ["wrongTree", "state_mismatch"], ["invalidPng", "png_invalid"], ["noRoute", "command_failed"], ["failedRestore", "restoration_failed"], ["badReset", "restoration_failed"], ["extraMarkerField", "marker_invalid"]]) {
  test(`${mutation} cannot become successful evidence`, async (t) => {
    const f = fixture(t); f.state[mutation] = true;
    await assert.rejects(f.call(), new RegExp(`v12_production_visual_${code}`, "u"));
    if (!["failedRestore", "badReset", "noRoute", "extraMarkerField"].includes(mutation)) assert.equal(f.state.settings.font_scale, "1.15");
    if (["failedRestore", "badReset"].includes(mutation)) assert.equal(f.state.lock, true);
  });
}
test("invalid input, state mapping and identity fail before configuration work", async (t) => {
  const f = fixture(t);
  for (const payload of [{ ...f.payload, run_id: "other" }, { ...f.payload, state_id: "BW-000" }, { ...f.payload, png_sha256: "a".repeat(64) }]) {
    await assert.rejects(f.call("visual-capture", payload), /v12_production_visual_(?:payload_invalid|state_route_missing)/u);
  }
  assert.equal(f.state.commands.length, 0);
  f.state.wrongApk = true; await assert.rejects(f.call(), /apk_mismatch/u);
  assert.ok(!f.state.commands.some((x) => x.join(" ").includes("'put'")));
});
test("source/launcher/manifest attestation mismatch is rejected before ADB", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.call("visual-capture", f.payload, { attestation: { ...f.attestation, source_tree_sha256: "0".repeat(64) } }), /attestation_invalid/u);
  writeFileSync(path.join(f.root, "changed.txt"), "changed source");
  await assert.rejects(f.call(), /source_mismatch/u);
  assert.equal(f.state.commands.length, 0);
});
test("display snapshot must be durable before changing any setting", async (t) => {
  const f = fixture(t); f.state.badSnapshot = true;
  await assert.rejects(f.call(), /snapshot_failed/u);
  assert.ok(!f.state.commands.some((x) => x.join(" ").includes("'put'")));
  assert.equal(f.state.lock, false);
});
test("busy visual lock never reads or overwrites the previous owner's snapshot", async (t) => {
  const f = fixture(t); f.state.lock = true;
  await assert.rejects(f.call(), /command_failed/u);
  assert.equal(f.state.savedSnapshot, undefined);
  assert.ok(!f.state.commands.some((x) => x.join(" ").includes("'settings'")));
});
for (const mutation of ["missingMarker", "staleMarker"]) test(`${mutation} times out without evidence and restores OS settings`, async (t) => {
  const f = fixture(t); f.state[mutation] = true;
  const started = Date.now();
  await assert.rejects(f.call(), /restoration_failed/u);
  assert.ok(Date.now() - started < 15_000);
  assert.equal(f.state.settings.font_scale, "1.15");
  assert.equal(f.state.lock, true);
});
test("absent settings and existing display overrides are restored exactly", async (t) => {
  const f = fixture(t); delete f.state.settings.font_scale;
  f.state.size = "720x1280"; f.state.density = "240"; f.state.night = "yes";
  await f.call();
  assert.equal(f.state.settings.font_scale, undefined);
  assert.equal(f.state.size, "720x1280"); assert.equal(f.state.density, "240"); assert.equal(f.state.night, "yes");
});

function retain(f, result) {
  const base = path.join(f.runDir, "screenshots/BW-054", config); mkdirSync(base, { recursive: true });
  const bytes = Buffer.from(result.png_base64, "base64"); writeFileSync(path.join(base, "native.png"), bytes);
  writeFileSync(path.join(base, "capture.json"), JSON.stringify({ schema_version: 3, producer: "v12-visual-capture/v3", run_id: runId, state_id: "BW-054", configuration_id: config, fixture_id: fixtureId, native_execution: "EXECUTED", settings: result.settings, native_png: { path: `artifacts/native/v1.2/${runId}/screenshots/BW-054/${config}/native.png`, sha256: hash(bytes), size_bytes: bytes.length, width: 390, height: 844 } }));
  writeFileSync(path.join(f.runDir, "screenshots/index.json"), JSON.stringify({ schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: runId, capture_count: 1, windows: [{ ordinal: 0, offset: 0, count: 1, first: `BW-054/${config}`, last: `BW-054/${config}` }], records: [JSON.parse(readFileSync(path.join(base, "capture.json")))] }));
}
test("comparison reads pinned approved PNG and recaptures instrumented state; never accepts caller metrics", async (t) => {
  const f = fixture(t); retain(f, await f.call());
  const comparePayload = { run_id: runId, captures: [{ state_id: "BW-054", configuration_id: config }] };
  const [result] = await f.call("visual-compare", comparePayload);
  const approved = readFileSync(path.join(f.root, ".planning/design/v1.2-browser-evidence/light-plan-type-chooser.png"));
  assert.equal(result.reference_binding.path, ".planning/design/v1.2-browser-evidence/light-plan-type-chooser.png");
  assert.equal(result.reference_binding.sha256, hash(approved));
  assert.equal(result.observation.state_id, "BW-054");
  assert.equal(result.observation.configuration_id, config);
  assert.equal(result.observation.targets.every((target) => target.height_dp >= 48), true);
  assert.equal(result.observation.capture_png_sha256, hash(Buffer.from(f.state.png, "base64")));
  assert.equal(result.observation.measurement.kind, "source_semantic");
  assert.match(result.observation.measurement.renderer_digest, /^[a-f0-9]{64}$/u);
  await assert.rejects(f.call("visual-compare", { run_id: runId, observation: { geometry_dp: 0 } }), /payload_invalid/u);
});
test("reference absence/drift and captured-state drift fail closed", async (t) => {
  const f = fixture(t); retain(f, await f.call());
  const comparePayload = { run_id: runId, captures: [{ state_id: "BW-054", configuration_id: config }] };
  f.state.png = f.state.darkPng;
  await assert.rejects(f.call("visual-compare", comparePayload), /capture_mismatch/u);
  const reference = path.join(f.root, ".planning/design/v1.2-browser-evidence/light-plan-type-chooser.png");
  writeFileSync(reference, "unapproved reference");
  await assert.rejects(f.call("visual-compare", comparePayload), /reference_invalid/u);
  rmSync(reference);
  await assert.rejects(f.call("visual-compare", comparePayload), /reference_missing/u);
});

test("controlled non-test launcher runs default ADB/Maestro transport through production module", async (t) => {
  const f = fixture(t);
  const launcher = path.join(f.root, "scripts/v12-production-native-adapter-launcher.mjs");
  const scratch = path.join(f.root, "artifacts/controlled"); mkdirSync(scratch, { recursive: true });
  const bin = path.join(scratch, "bin"); mkdirSync(bin);
  const tool = path.join(scratch, "tool.mjs");
  writeFileSync(tool, `import fs from 'node:fs';\nconst fixtureId=${JSON.stringify(fixtureId)};\nconst controlledTool=${controlledTool.toString()};\nconst file=process.env.VISUAL_CONTROLLED_STATE; const state=JSON.parse(fs.readFileSync(file)); const r=controlledTool(state,process.argv[2],process.argv.slice(3), {input:fs.readFileSync(0,'utf8')}); fs.writeFileSync(file,JSON.stringify(state));process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;`);
  const quote = (v) => `'${v.replaceAll("'", "'\\''")}'`;
  for (const exe of ["adb", "maestro"]) writeFileSync(path.join(bin, exe), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(tool)} ${exe} "$@"\n`, { mode: 0o755 });
  const statePath = path.join(scratch, "state.json"); writeFileSync(statePath, JSON.stringify(f.state));
  f.manifest.source.tree_sha256 = sourceTreeSha256(f.root);
  writeFileSync(path.join(f.runDir, "build.json"), JSON.stringify(f.manifest));
  const attestation = { ...f.attestation, source_tree_sha256: f.manifest.source.tree_sha256, launcher_source_sha256: hash(readFileSync(launcher)) };
  const env = { ...process.env, NODE_ENV: "production", PATH: `${bin}:${process.env.PATH}`, V12_DEVICE_SERIAL: "device-private", VISUAL_CONTROLLED_STATE: statePath };
  for (const key of ["NODE_TEST_CONTEXT", "V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS"]) delete env[key];
  const invoke = (action, payload) => spawnSync(process.execPath, [launcher, "--action", action], { cwd: f.root, env, input: JSON.stringify({ schema_version: 1, action, payload: { ...payload, lease: { lease_id: f.state.lease.lease_id, native_execution: "EXECUTED" } }, attestation: { ...attestation, action } }), encoding: "utf8", timeout: 90_000, maxBuffer: 32 * 1024 * 1024 });
  const result = invoke("visual-capture", f.payload);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout); assert.equal(output.ok, true); assert.equal(output.result.settings.restored, true);
  const recorded = JSON.parse(readFileSync(statePath));
  assert.ok(recorded.commands.some((x) => x[0] === "maestro" && x.includes("test")));
  assert.ok(recorded.commands.some((x) => x.includes("screencap")));
  assert.equal(recorded.settings.font_scale, "1.15");
  const batch = invoke("visual-capture-batch", { run_id: runId, captures: [{ ...f.payload, configuration_id: "AP-D-C390-P-F100" }, f.payload] });
  assert.equal(batch.status, 0, batch.stderr);
  assert.deepEqual(JSON.parse(batch.stdout).result.map((v) => v.settings.state_receipt.configuration_id), ["AP-D-C390-P-F100", config]);
  retain(f, output.result);
  const compared = invoke("visual-compare", { run_id: runId, captures: [{ state_id: "BW-054", configuration_id: config }] });
  assert.equal(compared.status, 0, compared.stderr);
  assert.equal(JSON.parse(compared.stdout).result[0].observation.capture_png_sha256, output.result.settings.state_receipt.png_sha256);
  const bounded = (result) => {
    assert.notEqual(result.status, 0); assert.equal(result.stdout, "");
    assert.match(result.stderr, /^v12_production_native_launcher_[a-z_]+\n$/u);
    assert.doesNotMatch(result.stderr, /device-private|\/private\/|bearer/u);
  };
  for (const flag of ["wrongState", "failedRestore"]) {
    const state = JSON.parse(readFileSync(statePath)); state[flag] = true;
    writeFileSync(statePath, JSON.stringify(state)); bounded(invoke("visual-capture", f.payload));
    const after = JSON.parse(readFileSync(statePath));
    if (flag === "failedRestore") assert.equal(after.lock, true);
    // Reset the controlled tool state between independent negative cases.
    after[flag] = false; after.lock = false; after.settings.font_scale = "1.15";
    writeFileSync(statePath, JSON.stringify(after));
  }
  rmSync(path.join(f.root, ".planning/design/v1.2-browser-evidence/light-plan-type-chooser.png"));
  bounded(invoke("visual-compare", { run_id: runId, captures: [{ state_id: "BW-054", configuration_id: config }] }));
});
