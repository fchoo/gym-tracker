import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const TRANSIENT_ADB_TRANSPORT = /(?:device (?:'[^'\r\n]+' )?(?:offline|not found)|no devices\/emulators found|cannot connect|connection (?:closed|reset)|protocol fault)/iu;
const INTERRUPTED_ADB_PULL = /\[\s*(?:\d{1,2}|100)%\]\s+[^\r\n]*\.apk(?:\r?\n|$)/iu;
const ADB_ERROR_DIAGNOSTIC = /adb:\s*error:/iu;
const PERMANENT_ADB_PULL = /(?:permission denied|no such file|does not exist|no space left on device|read-only file system|i\/o error)/iu;

function errorOutput(error) {
  const stderr = error !== null
      && typeof error === "object"
      && "stderr" in error
    ? error.stderr
    : "";
  return (error instanceof Error ? error.message : String(error)) + "\n"
    + (Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? ""));
}

function isTransientAdbPull(error) {
  const timedOut = error !== null
      && typeof error === "object"
      && "code" in error
      && error.code === "ETIMEDOUT";
  const output = errorOutput(error);
  if (PERMANENT_ADB_PULL.test(output)) return false;
  if (timedOut || TRANSIENT_ADB_TRANSPORT.test(output)) return true;
  if (ADB_ERROR_DIAGNOSTIC.test(output)) return false;
  return INTERRUPTED_ADB_PULL.test(output);
}

export function pullAdbFileWithRetry({
  attempts = DEFAULT_ATTEMPTS,
  cwd,
  executable = "adb",
  execute = execFileSync,
  localPath,
  remotePath,
  serial,
  stdio = ["ignore", "ignore", "pipe"],
  timeout = DEFAULT_TIMEOUT_MS,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    rmSync(localPath, { force: true });
    try {
      execute(executable, ["-s", serial, "pull", remotePath, localPath], {
        cwd,
        encoding: "utf8",
        stdio,
        timeout,
      });
      return;
    } catch (error) {
      rmSync(localPath, { force: true });
      if (attempt === attempts || !isTransientAdbPull(error)) throw error;
      execute(executable, ["-s", serial, "wait-for-device"], {
        cwd,
        encoding: "utf8",
        stdio,
        timeout,
      });
    }
  }
}
