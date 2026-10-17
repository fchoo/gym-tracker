import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseV12EvidenceCliArgs,
  executeV12EvidenceCli,
  deriveV12Ledger,
  readV12FinalDeviceState,
  validateV12FinalNativeIdentity,
  validateV12FinalProductionIdentity,
  validateV12ProductionPublicationOrigins,
} from "./verify-v12-native-evidence.mjs";
import { digestV12CanonicalRestorationSnapshot } from "./v12-device-settings-contract.mjs";

import { loadV12ContractInputs } from "./v12-evidence-contract.mjs";
import { createHash } from "node:crypto";

const RUN_ID = "phase20-20261014T031137Z-5917481c1fd1";
const h = (letter) => letter.repeat(64);
function v12LiveManifest(runId = RUN_ID) {
  return {
    schema_version: 1, run_id: runId, mode: "live", evidence_origin: "native", created_at: "2026-10-14T03:11:37Z",
    source: { head: "5917481c1fd1" + "a".repeat(28), tree_sha256: h("b"), dirty: false, package_json_sha256: h("c"), package_lock_sha256: h("d") },
    planning: { matrix_sha256: h("e"), requirements_sha256: h("f"), source_manifest_sha256: h("1"), owner_brief_sha256: h("2"), ui_spec_sha256: h("3"), deviations_sha256: h("4") },
    prototype: { revision: 18, approval_sha256: h("5"), html_sha256: h("6") }, fixtures: { registry_sha256: h("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: h("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: h("9"), certificate_sha256: h("a") } },
    device: { identity_sha256: h("b"), abi: "arm64-v8a", installed_apk_sha256: h("8"), settings_sha256: h("c"), restoration_sha256: h("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
}

test("the Phase 20 verifier accepts only the explicit unified shard, preseal, and final grammars", () => {
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "shards-only", "--ids", "sqlite,calendar"]),
    { run_id: RUN_ID, mode: "shards-only", ids: ["sqlite", "calendar"], no_final_write: false },
  );
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "preseal", "--no-final-write"]),
    { run_id: RUN_ID, mode: "preseal", ids: null, no_final_write: true },
  );
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "final"]),
    { run_id: RUN_ID, mode: "final", ids: null, no_final_write: false },
  );
  for (const args of [
    ["--mode", "preseal", "--run", RUN_ID],
    ["--run", RUN_ID, "--mode", "preseal"],
    ["--run", RUN_ID, "--mode", "final", "--no-final-write"],
    ["--run", RUN_ID, "--mode", "shards-only"],
    ["--run", RUN_ID, "--mode", "shards-only", "--ids", "sqlite", "--no-final-write"],
  ]) assert.throws(() => parseV12EvidenceCliArgs(args), /v12_preflight_cli_invalid/u);
});

test("unified preflight execution is explicitly source-only and never falls through to the legacy Calendar CLI", () => {
  assert.throws(
    () => executeV12EvidenceCli(["--run", RUN_ID, "--mode", "preseal", "--no-final-write"], { root: process.cwd() }),
    /v12_preflight_/u,
  );
});

test("preseal binds every adapter shard to its expected action and production domain bytes", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-origin-preseal-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceFiles = {
    "scripts/v12-native-adapter.mjs": "adapter\n",
    "scripts/v12-production-native-adapter-launcher.mjs": "launcher\n",
    "scripts/v12-production-native-runtime.mjs": "runtime\n",
    "scripts/v12-production-native-domain-actions.mjs": "domain\n",
    "scripts/v12-production-native-calendar-action.mjs": "calendar\n",
    "scripts/v12-production-native-visual-actions.mjs": "visual\n",
    "scripts/v12-production-native-quality-actions.mjs": "quality\n",
    "scripts/run-v12-maestro.mjs": "maestro\n",
  };
  for (const [relative, bytes] of Object.entries(sourceFiles)) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), bytes);
  }
  const digest = (relative) => createHash("sha256").update(sourceFiles[relative]).digest("hex");
  const contracts = {
    sqlite: ["sqlite", "scripts/v12-production-native-runtime.mjs"],
    recovery: ["recovery", "scripts/v12-production-native-domain-actions.mjs"],
    garmin: ["garmin", "scripts/v12-production-native-domain-actions.mjs"],
    calendar: ["calendar", "scripts/v12-production-native-calendar-action.mjs"],
    visual: ["visual-capture", "scripts/v12-production-native-visual-actions.mjs"],
    comparison: ["visual-compare", "scripts/v12-production-native-visual-actions.mjs"],
    accessibility: ["accessibility", "scripts/v12-production-native-quality-actions.mjs"],
    performance: ["performance", "scripts/v12-production-native-quality-actions.mjs"],
    "multi-plan": ["multi-plan", "scripts/run-v12-maestro.mjs"],
    workout: ["workout", "scripts/run-v12-maestro.mjs"],
    "library-running": ["library-running", "scripts/run-v12-maestro.mjs"],
  };
  const publicationDirectory = path.join(root, "artifacts/native/v1.2", RUN_ID, "publication");
  mkdirSync(publicationDirectory, { recursive: true });
  for (const [shard, [action, domain]] of Object.entries(contracts)) {
    writeFileSync(path.join(publicationDirectory, `${shard}.json`), JSON.stringify({
      execution_origin: {
        schema_version: 1,
        action,
        kind: "production-default-launcher",
        toolchain_origin: "production-attested/v1",
        default_launcher: true,
        test_only: false,
        adapter_source_sha256: digest("scripts/v12-native-adapter.mjs"),
        launcher_source_sha256: digest("scripts/v12-production-native-adapter-launcher.mjs"),
        domain_source_sha256: digest(domain),
        request_attestation_sha256: h("f"),
      },
    }));
  }

  assert.equal(validateV12ProductionPublicationOrigins(root, RUN_ID), true);
  const visualPath = path.join(publicationDirectory, "visual.json");
  const visual = JSON.parse(readFileSync(visualPath, "utf8"));
  visual.execution_origin.action = "visual-capture-batch";
  writeFileSync(visualPath, JSON.stringify(visual));
  assert.equal(validateV12ProductionPublicationOrigins(root, RUN_ID), true);
  assert.equal(JSON.parse(readFileSync(visualPath, "utf8")).execution_origin.action, "visual-capture-batch");
  const calendarPath = path.join(publicationDirectory, "calendar.json");
  const calendar = JSON.parse(readFileSync(calendarPath, "utf8"));
  calendar.execution_origin.toolchain_origin = "test-controlled/v1";
  writeFileSync(calendarPath, JSON.stringify(calendar));
  assert.throws(() => validateV12ProductionPublicationOrigins(root, RUN_ID), /v12_preflight_test_provenance_forbidden/u);
  calendar.execution_origin.toolchain_origin = "production-attested/v1";
  calendar.execution_origin.action = "release-lease";
  writeFileSync(calendarPath, JSON.stringify(calendar));
  assert.throws(() => validateV12ProductionPublicationOrigins(root, RUN_ID), /v12_preflight_adapter_provenance_stale/u);
});

test("final native identity requires current source, retained APK bytes, signature, installed bytes, settings, and device", () => {
  const manifest = {
    run_id: RUN_ID,
    evidence_origin: "native",
    source: { head: "a".repeat(40), tree_sha256: h("b") },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: h("c"), size_bytes: 3, signature_sha256: h("d"), certificate_sha256: h("e") } },
    device: { installed_apk_sha256: h("c"), identity_sha256: h("f"), settings_sha256: h("1"), restoration_sha256: h("1") },
  };
  const observed = { source_head: manifest.source.head, source_tree_sha256: manifest.source.tree_sha256,
    apk_sha256: manifest.build.apk.sha256, apk_size_bytes: 3, signature_sha256: manifest.build.apk.signature_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
    device_identity_sha256: manifest.device.identity_sha256, settings_sha256: manifest.device.settings_sha256 };
  assert.equal(validateV12FinalNativeIdentity(manifest, observed), true);
  for (const key of ["source_tree_sha256", "apk_sha256", "signature_sha256", "installed_apk_sha256", "device_identity_sha256", "settings_sha256"]) {
    assert.throws(() => validateV12FinalNativeIdentity(manifest, { ...observed, [key]: h("9") }), /v12_final_native_identity_invalid/u, key);
  }
  assert.throws(() => validateV12FinalNativeIdentity({ ...manifest, evidence_origin: "test" }, observed), /v12_final_test_origin_forbidden/u);
  assert.throws(() => validateV12FinalNativeIdentity({ ...manifest, evidence_origin: undefined }, observed), /v12_final_native_identity_invalid/u);
});

// Deliberately uses the former PASS-by-hash shape. This must never regain a
// compatibility path through deriveV12Ledger, even outside the CLI.
test("172 untyped PASS assertions cannot masquerade as validated source results", () => {
  const hash = value => createHash("sha256").update(value).digest("hex");
  const manifest = {
    schema_version: 1, run_id: RUN_ID, mode: "live", created_at: "2026-10-14T03:11:37Z",
    source: { head: "5917481c1fd1" + "a".repeat(28), tree_sha256: h("b"), dirty: false, package_json_sha256: h("c"), package_lock_sha256: h("d") },
    planning: { matrix_sha256: h("e"), requirements_sha256: h("f"), source_manifest_sha256: h("1"), owner_brief_sha256: h("2"), ui_spec_sha256: h("3"), deviations_sha256: h("4") },
    prototype: { revision: 18, approval_sha256: h("5"), html_sha256: h("6") }, fixtures: { registry_sha256: h("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/fake.apk", sha256: h("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: h("9"), certificate_sha256: h("a") } },
    device: { identity_sha256: h("b"), abi: "arm64-v8a", installed_apk_sha256: h("8"), settings_sha256: h("c"), restoration_sha256: h("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
  const inputs = loadV12ContractInputs();
  const evidence = inputs.matrix.rows.map(row => ({ row_id: row.requirement_id, artifact: `artifacts/native/v1.2/${RUN_ID}/proof/${row.requirement_id}.json`, sha256: hash(row.requirement_id), result: "PASS", configuration_id: manifest.configuration.id }));
  assert.equal(evidence.length, 172);
  assert.throws(() => deriveV12Ledger({ inputs, manifest, evidence, readArtifact: () => Buffer.from("unvalidated") }), /v12_final_evidence_schema_invalid/u);
});

test("final identity re-reads retained APK bytes, signature, source and device", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-final-identity-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const apkPath = "artifacts/native/v1.2-acceptance/app.apk";
  const apk = Buffer.from("PK\u0003\u0004controlled-apk");
  mkdirSync(path.join(root, path.dirname(apkPath)), { recursive: true });
  writeFileSync(path.join(root, apkPath), apk);
  const manifest = {
    ...v12LiveManifest(RUN_ID),
    build: {
      ...v12LiveManifest(RUN_ID).build,
      apk: {
        ...v12LiveManifest(RUN_ID).build.apk,
        path: apkPath,
        sha256: createHash("sha256").update(apk).digest("hex"),
        size_bytes: apk.length,
      },
    },
  };
  manifest.device.installed_apk_sha256 = manifest.build.apk.sha256;
  const restorationSha256 = digestV12CanonicalRestorationSnapshot({
    font_scale: "1.15",
    ui_night_mode: "1",
    animator_duration_scale: "0.5",
  });
  manifest.device.settings_sha256 = restorationSha256;
  manifest.device.restoration_sha256 = restorationSha256;
  const dependencies = {
    root,
    currentHead: () => manifest.source.head,
    currentSourceTreeSha256: () => manifest.source.tree_sha256,
    verifyApkSignature: () => ({ signature_sha256: manifest.build.apk.signature_sha256, certificate_sha256: manifest.build.apk.certificate_sha256 }),
    readDeviceIdentity: () => ({
      identity_sha256: manifest.device.identity_sha256,
      installed_apk_sha256: manifest.device.installed_apk_sha256,
      abi: "arm64-v8a",
      restoration_sha256: restorationSha256,
      lease_state: "clear",
    }),
  };
  assert.equal(validateV12FinalProductionIdentity(manifest, dependencies), true);
  writeFileSync(path.join(root, apkPath), Buffer.from("PK\u0003\u0004different-apk"));
  assert.throws(() => validateV12FinalProductionIdentity(manifest, dependencies), /v12_preflight_final_identity_invalid/u);
  writeFileSync(path.join(root, apkPath), apk);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    verifyApkSignature: () => ({ signature_sha256: h("0"), certificate_sha256: manifest.build.apk.certificate_sha256 }),
  }), /v12_preflight_final_identity_invalid/u);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    currentSourceTreeSha256: () => h("0"),
  }), /v12_preflight_final_identity_invalid/u);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    readDeviceIdentity: () => ({
      identity_sha256: h("0"),
      installed_apk_sha256: manifest.device.installed_apk_sha256,
      abi: "arm64-v8a",
      restoration_sha256: restorationSha256,
      lease_state: "clear",
    }),
  }), /v12_preflight_final_identity_invalid/u);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    readDeviceIdentity: () => ({
      ...dependencies.readDeviceIdentity(),
      restoration_sha256: h("0"),
    }),
  }), /v12_preflight_final_restoration_invalid/u);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    readDeviceIdentity: () => ({
      ...dependencies.readDeviceIdentity(),
      lease_state: "active",
    }),
  }), /v12_preflight_final_lease_active/u);
});

test("final device state re-reads the canonical restoration settings and both lease paths", () => {
  const calls = [];
  const executeAdb = (...args) => {
    calls.push(args);
    const command = args.join(" ");
    if (command === "get-state") return "device\n";
    if (command === "shell getprop ro.product.cpu.abi") return "arm64-v8a\n";
    if (command === "shell getprop ro.build.version.sdk") return "36\n";
    if (command === "shell getprop ro.product.model") return "controlled\n";
    if (command === "shell pm path com.fchoo.gymtracker.devtest") return "package:/data/app/controlled/base.apk\n";
    if (command === "shell sha256sum /data/app/controlled/base.apk") return `${h("8")}  /data/app/controlled/base.apk\n`;
    if (command === "shell settings get system font_scale") return "1.15\n";
    if (command === "shell settings get secure ui_night_mode") return "1\n";
    if (command === "shell settings get global animator_duration_scale") return "0.5\n";
    if (command.startsWith("shell sh -c ")) return "clear\n";
    throw new Error(`unexpected command: ${command}`);
  };

  const state = readV12FinalDeviceState(v12LiveManifest(), { serial: "controlled-device-20", executeAdb });
  assert.equal(state.installed_apk_sha256, h("8"));
  assert.equal(state.abi, "arm64-v8a");
  assert.equal(state.restoration_sha256, digestV12CanonicalRestorationSnapshot({
    font_scale: "1.15",
    ui_night_mode: "1",
    animator_duration_scale: "0.5",
  }));
  assert.equal(state.lease_state, "clear");
  const leaseProbe = calls.find((args) => args[0] === "shell" && args[1] === "sh");
  assert.match(leaseProbe.at(-1), /gym-tracker-v12-native-lease/u);
  assert.match(leaseProbe.at(-1), /gym-tracker-v12-visual/u);
});
