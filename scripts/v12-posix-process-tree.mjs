import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const V12_POSIX_OWNERSHIP_ENV = "V12_POSIX_PROCESS_OWNERSHIP";

const MAX_PROCESS_ROWS = 4_096;
const OWNERSHIP_TOKEN = /^[a-f0-9]{64}$/u;
const POSIX_PLATFORMS = Object.freeze(["aix", "darwin", "freebsd", "linux", "openbsd", "sunos"]);
const PIDFD_HELPER = fileURLToPath(new URL("./v12-linux-pidfd-signal.py", import.meta.url));

function processTreeError(code) {
  return new Error(`v12_posix_process_tree_${code}`);
}

function processTableArguments(platform) {
  const environmentFlag = platform === "darwin" ? "-Eww" : "eww";
  return [environmentFlag, "-axo", "pid=,stat=,args="];
}

function containsExactOwnershipToken(rawCommandAndEnvironment, ownershipToken) {
  const marker = `${V12_POSIX_OWNERSHIP_ENV}=${ownershipToken}`;
  let offset = rawCommandAndEnvironment.indexOf(marker);
  while (offset !== -1) {
    const end = offset + marker.length;
    const startsAtBoundary = offset === 0 || /\s/u.test(rawCommandAndEnvironment[offset - 1]);
    const endsAtBoundary = end === rawCommandAndEnvironment.length || /\s/u.test(rawCommandAndEnvironment[end]);
    if (startsAtBoundary && endsAtBoundary) return true;
    offset = rawCommandAndEnvironment.indexOf(marker, offset + 1);
  }
  return false;
}

function parseOwnedProcesses(stdout, ownershipToken, ownershipIdentity) {
  if (typeof stdout !== "string") throw processTreeError("enumeration_failed");
  const rows = stdout.trim() === "" ? [] : stdout.trim().split(/\r?\n/u);
  if (rows.length > MAX_PROCESS_ROWS) throw processTreeError("enumeration_failed");
  const owned = [];
  for (const row of rows) {
    const match = /^(\d+)\s+(\S+)\s+(.+)$/u.exec(row.trim());
    if (match === null) throw processTreeError("enumeration_failed");
    const pid = Number(match[1]);
    const state = match[2];
    const rawCommandAndEnvironment = match[3];
    if (!Number.isSafeInteger(pid) || pid < 1 || state === "") {
      throw processTreeError("enumeration_failed");
    }
    if (containsExactOwnershipToken(rawCommandAndEnvironment, ownershipToken)) {
      owned.push(Object.freeze({ pid, state, identity: ownershipIdentity }));
    }
  }
  return owned;
}

function ownedProcessTable({ probeImplementation, timeoutMs, platform, ownershipToken, ownershipIdentity }) {
  let outcome;
  try {
    outcome = probeImplementation("ps", processTableArguments(platform), {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs,
    });
  } catch {
    throw processTreeError("enumeration_failed");
  }
  if (outcome?.status !== 0 || outcome.signal !== null || outcome.error !== undefined) {
    throw processTreeError("enumeration_failed");
  }
  return parseOwnedProcesses(outcome.stdout, ownershipToken, ownershipIdentity);
}

function signalOwnedLinuxProcesses({
  candidates,
  ownershipToken,
  signalName,
  timeoutMs,
  pidfdSignalImplementation,
  pidfdPythonExecutable,
}) {
  let outcome;
  try {
    outcome = pidfdSignalImplementation(pidfdPythonExecutable, [
      PIDFD_HELPER,
      signalName,
      String(timeoutMs),
      ...candidates.map(({ pid }) => String(pid)),
    ], {
      encoding: "utf8",
      input: `${ownershipToken}\n`,
      maxBuffer: 64 * 1024,
      timeout: timeoutMs,
    });
  } catch {
    throw processTreeError("stable_signal_failed");
  }
  if (outcome?.status !== 0 || outcome.signal !== null || outcome.error !== undefined
    || outcome.stdout !== "ok\n" || (outcome.stderr ?? "") !== "") {
    throw processTreeError("stable_signal_failed");
  }
}

/**
 * Discovers a launch's live POSIX processes by an opaque token inherited in
 * their environment. Linux signals use one helper transaction that opens
 * pidfds for the complete candidate set, validates every pinned process, and
 * only then signals through those stable handles. Other POSIX platforms fail
 * closed if a token-owned process needs a signal.
 */
export function createV12PosixProcessTreeTracker({
  ownershipToken,
  platform = process.platform,
  probeImplementation = spawnSync,
  pidfdSignalImplementation = spawnSync,
  pidfdPythonExecutable = "python3",
  probeTimeoutMs = 1_000,
} = {}) {
  if (!OWNERSHIP_TOKEN.test(ownershipToken) || !POSIX_PLATFORMS.includes(platform)
    || typeof probeImplementation !== "function" || typeof pidfdSignalImplementation !== "function"
    || typeof pidfdPythonExecutable !== "string" || pidfdPythonExecutable === ""
    || !Number.isSafeInteger(probeTimeoutMs) || probeTimeoutMs < 1) {
    throw processTreeError("arguments_invalid");
  }

  const ownershipIdentity = createHash("sha256").update(ownershipToken).digest("hex");
  let stopped = false;
  let failed = false;
  let verifiedEmpty = false;

  const capture = (timeoutMs = probeTimeoutMs) => {
    if (stopped) throw processTreeError("stopped");
    if (failed) throw processTreeError("failed");
    verifiedEmpty = false;
    try {
      return ownedProcessTable({
        probeImplementation,
        timeoutMs,
        platform,
        ownershipToken,
        ownershipIdentity,
      }).filter(({ state }) => !state.startsWith("Z"));
    } catch (error) {
      failed = true;
      throw error;
    }
  };

  const treeState = () => {
    const live = capture();
    verifiedEmpty = live.length === 0;
    return verifiedEmpty ? "empty" : "alive";
  };

  const signal = (signalName) => {
    if (signalName !== "SIGTERM" && signalName !== "SIGKILL") throw processTreeError("signal_invalid");
    try {
      const deadline = Date.now() + probeTimeoutMs;
      const remainingProbeMs = () => {
        const remaining = deadline - Date.now();
        if (remaining < 1) throw processTreeError("enumeration_failed");
        return remaining;
      };
      const candidates = capture(remainingProbeMs());
      if (candidates.length === 0) return true;
      if (platform !== "linux") throw processTreeError("stable_signal_unavailable");
      signalOwnedLinuxProcesses({
        candidates,
        ownershipToken,
        signalName,
        timeoutMs: remainingProbeMs(),
        pidfdSignalImplementation,
        pidfdPythonExecutable,
      });
      return true;
    } catch (error) {
      failed = true;
      throw error;
    }
  };

  capture();

  return Object.freeze({
    signal,
    treeState,
    stop() {
      if (!verifiedEmpty) throw processTreeError("not_empty");
      const live = capture();
      if (live.length !== 0) throw processTreeError("not_empty");
      verifiedEmpty = true;
      stopped = true;
    },
  });
}
