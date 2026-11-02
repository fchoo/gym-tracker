import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SAFE_ARGUMENT = /^[^\u0000\r\n]{1,4096}$/u;

function invalid() {
  throw new Error("phase18_installed_apk_invalid");
}

export function pullInstalledApkSha256({
  adb,
  serial,
  installedPath,
  expectedByteCount,
}) {
  if (
    !SAFE_ARGUMENT.test(adb)
    || !SAFE_ARGUMENT.test(serial)
    || !SAFE_ARGUMENT.test(installedPath)
    || !installedPath.startsWith("/data/app/")
    || !Number.isSafeInteger(expectedByteCount)
    || expectedByteCount <= 0
  ) invalid();

  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "phase18-installed-apk-"));
  let digest;
  let failed = false;
  try {
    const localPath = path.join(temporaryDirectory, "installed.apk");
    execFileSync(
      adb,
      ["-s", serial, "pull", installedPath, localPath],
      { stdio: "ignore" },
    );
    const metadata = lstatSync(localPath);
    if (
      metadata.isSymbolicLink()
      || !metadata.isFile()
      || metadata.size === 0
      || metadata.size !== expectedByteCount
    ) invalid();
    digest = createHash("sha256").update(readFileSync(localPath)).digest("hex");
  } catch {
    failed = true;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  if (failed) invalid();
  return digest;
}
