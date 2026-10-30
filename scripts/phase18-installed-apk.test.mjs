import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { pullInstalledApkSha256 } from "./phase18-installed-apk.mjs";

function withFakeAdb(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-installed-apk-test-"));
  const scratch = path.join(root, "scratch");
  const source = path.join(root, "source.apk");
  const calls = path.join(root, "calls.txt");
  const adb = path.join(root, "adb");
  const originalTmpdir = process.env.TMPDIR;
  mkdirSync(scratch);
  writeFileSync(source, "exact-installed-apk-bytes");
  writeFileSync(adb, `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "${calls}"
if [ "$1" != "-s" ] || [ "$2" != "SELECTED_SERIAL" ] || [ "$3" != "pull" ] || [ "$4" != "/data/app/phase18/base.apk" ]; then
  exit 91
fi
case "\${PHASE18_FAKE_ADB_MODE:-success}" in
  success) cp "${source}" "$5" ;;
  truncated) printf 'short' > "$5" ;;
  empty) : > "$5" ;;
  symlink) ln -s "${source}" "$5" ;;
  directory) mkdir "$5" ;;
  failure) exit 92 ;;
  *) exit 93 ;;
esac
`);
  chmodSync(adb, 0o755);
  process.env.TMPDIR = scratch;
  try {
    callback({ adb, calls, scratch, source });
  } finally {
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
    delete process.env.PHASE18_FAKE_ADB_MODE;
    rmSync(root, { recursive: true, force: true });
  }
}

function pull(adb, expectedByteCount) {
  return pullInstalledApkSha256({
    adb,
    serial: "SELECTED_SERIAL",
    installedPath: "/data/app/phase18/base.apk",
    expectedByteCount,
  });
}

test("installed APK identity uses one selected-device pull, hashes the local regular file, and cleans up", () => {
  withFakeAdb(({ adb, calls, scratch, source }) => {
    const expectedBytes = readFileSync(source);
    assert.equal(
      pull(adb, expectedBytes.length),
      createHash("sha256").update(expectedBytes).digest("hex"),
    );
    assert.match(
      readFileSync(calls, "utf8"),
      /^-s SELECTED_SERIAL pull \/data\/app\/phase18\/base\.apk .+\/installed\.apk\n$/u,
    );
    assert.deepEqual(readdirSync(scratch), []);
  });
});

test("installed APK identity rejects truncation, empty files, symlinks, non-files, and pull failures with cleanup", () => {
  withFakeAdb(({ adb, scratch, source }) => {
    const expectedByteCount = readFileSync(source).length;
    for (const mode of ["truncated", "empty", "symlink", "directory", "failure"]) {
      process.env.PHASE18_FAKE_ADB_MODE = mode;
      assert.throws(
        () => pull(adb, expectedByteCount),
        /phase18_installed_apk_invalid/u,
        mode,
      );
      assert.deepEqual(readdirSync(scratch), [], mode);
    }
  });
});

test("installed APK identity rejects invalid transfer arguments before creating temporary state", () => {
  withFakeAdb(({ adb, scratch }) => {
    for (const input of [
      { adb: "", serial: "SELECTED_SERIAL", installedPath: "/data/app/base.apk", expectedByteCount: 1 },
      { adb, serial: "", installedPath: "/data/app/base.apk", expectedByteCount: 1 },
      { adb, serial: "SELECTED_SERIAL", installedPath: "", expectedByteCount: 1 },
      { adb, serial: "SELECTED_SERIAL", installedPath: "relative.apk", expectedByteCount: 1 },
      { adb, serial: "SELECTED_SERIAL", installedPath: "/data/app/base.apk", expectedByteCount: 1.5 },
      { adb, serial: "SELECTED_SERIAL", installedPath: "/data/app/base.apk", expectedByteCount: 0 },
    ]) {
      assert.throws(() => pullInstalledApkSha256(input), /phase18_installed_apk_invalid/u);
      assert.deepEqual(readdirSync(scratch), []);
    }
  });
});

test("every Phase 18 exact-APK identity owner uses the shared pull helper", () => {
  for (const file of [
    "scripts/proof-runner-evidence.mjs",
    "scripts/proof-verifier-evidence.mjs",
    "scripts/adversarial-verifier-evidence.mjs",
    "scripts/benchmark-evidence-runner.mjs",
    "scripts/acceptance-verifier-evidence.mjs",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /pullInstalledApkSha256/u, file);
    assert.doesNotMatch(source, /exec-out/u, file);
  }
});
