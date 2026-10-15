import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const project = process.cwd();
const digest = (value) => createHash("sha256").update(value).digest("hex");

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-blackbox-"));
  for (const member of ["scripts", "src/testing/phase20CalendarFixture.ts", "maestro/v1.2", "package.json", "package-lock.json"]) {
    cpSync(path.join(project, member), path.join(root, member), { recursive: true });
  }
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "calendar-blackbox@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Calendar Blackbox"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = spawnSync(process.execPath, [path.join(project, "scripts/source-tree-digest.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(source.status, 0, source.stderr);
  const runId = `phase20-20261016T000000Z-${head.slice(0, 12)}`;
  const base = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(base, { recursive: true });
  writeFileSync(path.join(base, "build.json"), JSON.stringify({
    schema_version: 1,
    run_id: runId,
    mode: "live",
    created_at: "2026-10-16T00:00:00Z",
    source: { head, tree_sha256: source.stdout.trim(), dirty: false, package_json_sha256: "c".repeat(64), package_lock_sha256: "d".repeat(64) },
    planning: { matrix_sha256: "e".repeat(64), requirements_sha256: "f".repeat(64), source_manifest_sha256: "1".repeat(64), owner_brief_sha256: "2".repeat(64), ui_spec_sha256: "3".repeat(64), deviations_sha256: "4".repeat(64) },
    prototype: { revision: 18, approval_sha256: "5".repeat(64), html_sha256: "6".repeat(64) },
    fixtures: { registry_sha256: "7".repeat(64) },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1,
      apk: { path: "artifacts/native/v1.2-acceptance/fake.apk", sha256: "8".repeat(64), size_bytes: 1, page_alignment_verified: true, signature_sha256: "9".repeat(64), certificate_sha256: "a".repeat(64) } },
    device: { identity_sha256: "b".repeat(64), abi: "arm64-v8a", installed_apk_sha256: "8".repeat(64), settings_sha256: "c".repeat(64), restoration_sha256: "d".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  }));
  return { base, root, runId };
}

function invoke(root, runId) {
  return spawnSync(process.execPath, [path.join(project, "scripts/v12-calendar-shard.mjs"), "--run", runId, "--execute", "--test-fixture"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_ENV: "test",
      V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess",
      V12_NATIVE_ADAPTER_TEST_PROCESS: "1",
      V12_NATIVE_ADAPTER_COMMAND: path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"),
      V12_NATIVE_ADAPTER_BATCH: "1",
      V12_DEVICE_SERIAL: "calendar-blackbox-device",
    },
  });
}

test("Calendar subprocess publishes 69 exact nonce-bound probe receipts", (t) => {
  const { base, root, runId } = fixtureRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = invoke(root, runId);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

  const transitions = JSON.parse(readFileSync(path.join(base, "calendar-transitions.json"), "utf8"));
  const requirements = JSON.parse(readFileSync(path.join(base, "calendar-requirements.json"), "utf8"));
  const registry = JSON.parse(readFileSync(path.join(base, "calendar/artifact-registry.json"), "utf8"));
  const publicationPath = path.join(base, "publication/calendar.json");
  assert.equal(lstatSync(publicationPath).isSymbolicLink(), false);
  const publication = JSON.parse(readFileSync(publicationPath, "utf8"));

  assert.equal(transitions.schema_version, 5);
  assert.equal(transitions.producer, "v12-calendar-shard/v6");
  assert.equal(transitions.native_receipt.probe_count, 69);
  assert.equal(requirements.schema_version, 2);
  assert.equal(requirements.records.length, 23);
  assert.equal(requirements.junit_cases.length, 69);
  const receipts = requirements.records.flatMap(({ probe_receipts: probes }) => probes);
  assert.equal(receipts.length, 69);
  assert.equal(new Set(receipts.map(({ nonce }) => nonce)).size, 69);
  assert.equal(receipts.every(({ status, receipt_sha256 }) => status === "PASS" && /^[a-f0-9]{64}$/u.test(receipt_sha256)), true);
  assert.equal(requirements.records.every((record) => !Object.hasOwn(record, "probe_ids")), true);
  assert.equal(registry.schema_version, 2);
  assert.equal(registry.members.length, 208);
  assert.equal(publication.completed, true);
  assert.equal(publication.members.length, 213);
  assert.equal(publication.members.every((member) => {
    const bytes = readFileSync(path.join(base, member.artifact));
    return member.size_bytes === bytes.length && member.sha256 === digest(bytes);
  }), true);
  assert.equal(existsSync(path.join(base, ".staging")), false);

  const duplicate = invoke(root, runId);
  assert.notEqual(duplicate.status, 0);
  assert.match(`${duplicate.stderr}\n${duplicate.stdout}`, /calendar_output_exists|atomic_publication_exists/u);
});
