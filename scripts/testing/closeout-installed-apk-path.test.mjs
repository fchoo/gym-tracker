import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createV12RunManifest } from "../create-v12-run-manifest.mjs";
import { phase18DeviceIdentitySha256 } from "../phase18-device-identity.mjs";
import { sourceTreeSha256 } from "../source-tree-digest.mjs";
import { digestV12CanonicalRestorationSnapshot, V12_NATIVE_LEASE_PATH, V12_VISUAL_LEASE_PATH } from "../v12-device-settings-contract.mjs";
import { resolveV12GitExecution } from "../v12-native-execution-origin.mjs";
import { readV12FinalDeviceState, verifyV12FinalNativeIdentity, validateV12FinalProductionIdentity } from "../verify-v12-native-evidence.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hash = character => character.repeat(64);

test("both final native readers accept Android installed APK paths containing tildes", t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-apk-path-")));
  const original = Object.fromEntries(["ANDROID_HOME", "ANDROID_SDK_ROOT", "V12_DEVICE_SERIAL", "PATH"].map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });
  const gitExecution = resolveV12GitExecution();
  const git = args => execFileSync(gitExecution.executable, args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "--quiet"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "user.name", "Test fixture"]);
  writeFileSync(path.join(root, "source.txt"), "synthetic installed-path regression\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "fixture"]);
  const head = git(["rev-parse", "HEAD"]);
  const sdk = path.join(root, "artifacts/fake-sdk");
  const apkBytes = Buffer.from("504b0304aabbccdd", "hex");
  const apkSha = sha(apkBytes);
  const installedPath = "/data/app/~~example==/com.fchoo.gymtracker.devtest-example==/base.apk";
  const serial = "controlled-path-device";
  const settingsSha = digestV12CanonicalRestorationSnapshot({ font_scale: "1.0", ui_night_mode: "0", animator_duration_scale: "1.0" });
  const report = `Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`;
  const executable = (relative, body) => {
    const file = path.join(sdk, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    chmodSync(file, 0o755);
    return file;
  };
  const signer = executable("build-tools/36.0.0/apksigner", `#!/bin/sh\nprintf '%s' '${report}'\n`);
  const adb = executable("platform-tools/adb", [
    "#!/bin/sh", 'case "$*" in',
    "  *get-state*) printf 'device\\n' ;;",
    "  *ro.product.cpu.abi*) printf 'arm64-v8a\\n' ;;",
    "  *ro.build.version.sdk*) printf '36\\n' ;;",
    "  *ro.product.model*) printf 'Coverage Device\\n' ;;",
    `  *"pm path"*) printf 'package:${installedPath}\\n' ;;`,
    "  *\"exec-out cat\"*) printf '\\120\\113\\003\\004\\252\\273\\314\\335' ;;",
    `  *sha256sum*) printf '${apkSha}  ${installedPath}\\n' ;;`,
    "  *font_scale*) printf '1.0\\n' ;;",
    "  *ui_night_mode*) printf '0\\n' ;;",
    "  *animator_duration_scale*) printf '1.0\\n' ;;",
    "  *\"[ ! -e \"*) printf 'clear\\n' ;;",
    "  *) exit 1 ;;", "esac", "",
  ].join("\n"));
  const apk = "artifacts/native/v1.2-acceptance/app.apk";
  mkdirSync(path.dirname(path.join(root, apk)), { recursive: true });
  writeFileSync(path.join(root, apk), apkBytes);
  const manifest = createV12RunManifest({ input: {
    created_at: "2026-10-17T00:00:00Z", evidence_origin: "native",
    source: { head, tree_sha256: sourceTreeSha256(root, { gitExecution, expectedGitAttestation: gitExecution.attestation }), dirty: false, package_json_sha256: hash("1"), package_lock_sha256: hash("2") },
    planning: { matrix_sha256: hash("3"), requirements_sha256: hash("4"), source_manifest_sha256: hash("5"), owner_brief_sha256: hash("6"), ui_spec_sha256: hash("7"), deviations_sha256: hash("8") },
    prototype: { revision: 18, approval_sha256: hash("9"), html_sha256: hash("a") }, fixtures: { registry_sha256: hash("b") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 1, apk: { path: apk, sha256: apkSha, size_bytes: apkBytes.length, page_alignment_verified: true, signature_sha256: sha(report), certificate_sha256: "ab".repeat(32) } },
    device: { identity_sha256: phase18DeviceIdentitySha256({ serial, abi: "arm64-v8a", apiLevel: "36", model: "Coverage Device" }), abi: "arm64-v8a", installed_apk_sha256: apkSha, settings_sha256: settingsSha, restoration_sha256: settingsSha },
    configuration: { id: "AP-L-C390-P-F100" },
  } });
  process.env.ANDROID_HOME = sdk;
  process.env.ANDROID_SDK_ROOT = sdk;
  process.env.V12_DEVICE_SERIAL = serial;
  const calls = [];
  const state = readV12FinalDeviceState(manifest, { serial, executeAdb: (...args) => {
    calls.push(args);
    return execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" });
  } });
  assert.equal(state.installed_apk_sha256, apkSha);
  assert.equal(state.restoration_sha256, settingsSha);
  assert.ok(calls.some(args => args.join(" ") === `shell sha256sum ${installedPath}`));
  assert.equal(verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), true);
  const signerBytes = readFileSync(signer);
  const adbBytes = readFileSync(adb);
  for (const replacement of ["#!/bin/sh\nexit 1\n", "#!/bin/sh\nprintf 'no certificate'\n"]) {
    writeFileSync(signer, replacement);
    assert.throws(() => verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), /v12_preflight_native_identity_invalid/u);
  }
  writeFileSync(signer, signerBytes);
  for (const serialValue of ["", "invalid serial"]) {
    process.env.V12_DEVICE_SERIAL = serialValue;
    assert.throws(() => verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), /v12_preflight_native_identity_invalid/u);
  }
  process.env.V12_DEVICE_SERIAL = serial;
  for (const replacement of [
    "#!/bin/sh\nprintf 'offline\\n'\n",
    adbBytes.toString().replace(`package:${installedPath}\\n`, `package:${installedPath}\\npackage:/data/app/other/base.apk\\n`),
    adbBytes.toString().replace(`package:${installedPath}\\n`, "package:/other/base.apk\\n"),
  ]) {
    writeFileSync(adb, replacement);
    assert.throws(() => verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), /v12_preflight_native_identity_invalid/u);
  }
  writeFileSync(adb, adbBytes);
  process.env.ANDROID_HOME = "";
  assert.throws(() => verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), /v12_preflight_native_identity_invalid/u);
  delete process.env.ANDROID_HOME;
  assert.equal(verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), true);
  process.env.ANDROID_SDK_ROOT = path.join(root, "missing-sdk");
  assert.throws(() => verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), /v12_preflight_native_identity_invalid/u);
  process.env.ANDROID_HOME = sdk;
  process.env.ANDROID_SDK_ROOT = sdk;
  assert.throws(() => verifyV12FinalNativeIdentity({ ...manifest, evidence_origin: "test" }, { root, gitExecution }), /v12_preflight_test_origin_forbidden/u);
  assert.throws(() => verifyV12FinalNativeIdentity({ ...manifest, evidence_origin: "other" }, { root, gitExecution }), /v12_preflight_native_origin_required/u);
  const observedDevice={...state,identity_sha256:manifest.device.identity_sha256,lease_state:"clear"};
  const productionOptions={root,currentHead:()=>head,currentSourceTreeSha256:()=>manifest.source.tree_sha256,readDeviceIdentity:()=>observedDevice};
  assert.equal(validateV12FinalProductionIdentity(manifest,productionOptions),true);
  for(const bytes of ["#!/bin/sh\nexit 1\n","#!/bin/sh\nprintf 'no verified signature'\n",`#!/bin/sh\nprintf 'Verified using v2 scheme (APK Signature Scheme v2): false\\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\\n'\n`]){
    writeFileSync(signer,bytes);
    assert.throws(()=>validateV12FinalProductionIdentity(manifest,productionOptions),/v12_preflight_final_identity_invalid/u);
  }
  writeFileSync(signer,signerBytes);
  process.env.ANDROID_HOME="";
  assert.throws(()=>validateV12FinalProductionIdentity(manifest,productionOptions),/v12_preflight_final_identity_invalid/u);
  delete process.env.ANDROID_HOME;
  assert.equal(validateV12FinalProductionIdentity(manifest,productionOptions),true);
  process.env.ANDROID_SDK_ROOT=path.join(root,"missing-sdk");
  assert.throws(()=>validateV12FinalProductionIdentity(manifest,productionOptions),/v12_preflight_final_identity_invalid/u);
  process.env.ANDROID_HOME=sdk;process.env.ANDROID_SDK_ROOT=sdk;
  process.env.PATH=`${path.join(sdk,"platform-tools")}:${original.PATH}`;
  assert.equal(validateV12FinalProductionIdentity(manifest,{root,currentHead:()=>head,currentSourceTreeSha256:()=>manifest.source.tree_sha256}),true);
});

test("the ADB-flattened lease predicate reports clear and either existing lease without shell errors", t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-lease-command-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nativeLease = path.join(root, "native-lease");
  const visualLease = path.join(root, "visual-lease");
  const installedPath = "/data/app/~~leases==/controlled/base.apk";
  const manifest = { build: { package: "com.fchoo.gymtracker.devtest" } };
  let shellCalls = 0;
  const executeAdb = (...args) => {
    const command = args.join(" ");
    if (command === "get-state") return "device";
    if (command.includes("ro.product.cpu.abi")) return "arm64-v8a";
    if (command.includes("ro.build.version.sdk")) return "36";
    if (command.includes("ro.product.model")) return "controlled";
    if (command.includes("pm path")) return `package:${installedPath}`;
    if (command.includes("sha256sum")) return `${hash("8")}  ${installedPath}`;
    if (command.includes("settings get")) return "1";
    if (args[0] === "shell" && command.includes(V12_NATIVE_LEASE_PATH)) {
      shellCalls += 1;
      // ADB passes the joined shell arguments to the remote shell. Substitute
      // only the fixed absolute lease paths so this real shell reads fixtures.
      const flattened = args.slice(1).join(" ")
        .replaceAll(V12_NATIVE_LEASE_PATH, nativeLease)
        .replaceAll(V12_VISUAL_LEASE_PATH, visualLease);
      const result = spawnSync("/bin/sh", ["-c", flattened], { encoding: "utf8" });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      return result.stdout;
    }
    assert.fail(`unexpected controlled ADB command: ${command}`);
  };
  const read = () => readV12FinalDeviceState(manifest, { serial: "controlled-lease-device", executeAdb });
  assert.equal(read().lease_state, "clear");
  writeFileSync(nativeLease, "owned test fixture\n");
  assert.equal(read().lease_state, "active");
  rmSync(nativeLease);
  writeFileSync(visualLease, "owned test fixture\n");
  assert.equal(read().lease_state, "active");
  assert.equal(shellCalls, 3);
});
