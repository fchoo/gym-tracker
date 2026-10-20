import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const V12_POSIX_OWNERSHIP_ENV = "V12_POSIX_PROCESS_OWNERSHIP";

const MAX_PROCESS_ROWS = 4_096;
const OWNERSHIP_TOKEN = /^[a-f0-9]{64}$/u;
const POSIX_PLATFORMS = Object.freeze(["aix", "darwin", "freebsd", "linux", "openbsd", "sunos"]);

function processTreeError(code) {
  return new Error(`v12_posix_process_tree_${code}`);
}

function processTableArguments(platform, targetPid) {
  const environmentFlag = platform === "darwin" ? "-Eww" : "eww";
  return targetPid === undefined
    ? [environmentFlag, "-axo", "pid=,stat=,args="]
    : [environmentFlag, "-p", String(targetPid), "-o", "pid=,stat=,args="];
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

function ownedProcessTable({ probeImplementation, timeoutMs, platform, ownershipToken, ownershipIdentity, targetPid }) {
  let outcome;
  try {
    outcome = probeImplementation("ps", processTableArguments(platform, targetPid), {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs,
    });
  } catch {
    throw processTreeError("enumeration_failed");
  }
  if (targetPid !== undefined && outcome?.status === 1 && outcome.signal === null
    && outcome.error === undefined && typeof outcome.stdout === "string" && outcome.stdout.trim() === "") return [];
  if (outcome?.status !== 0 || outcome.signal !== null || outcome.error !== undefined) {
    throw processTreeError("enumeration_failed");
  }
  return parseOwnedProcesses(outcome.stdout, ownershipToken, ownershipIdentity);
}

/**
 * Discovers a launch's live POSIX processes by an opaque token inherited in
 * their environment. Every state check and signal performs a fresh bounded
 * probe, so detached/reparented descendants remain owned and a reused PID
 * without the exact token is never signalled.
 */
export function createV12PosixProcessTreeTracker({
  ownershipToken,
  platform = process.platform,
  probeImplementation = spawnSync,
  killImplementation = process.kill.bind(process),
  probeTimeoutMs = 1_000,
} = {}) {
  if (!OWNERSHIP_TOKEN.test(ownershipToken) || !POSIX_PLATFORMS.includes(platform)
    || typeof probeImplementation !== "function" || typeof killImplementation !== "function"
    || !Number.isSafeInteger(probeTimeoutMs) || probeTimeoutMs < 1) {
    throw processTreeError("arguments_invalid");
  }

  const ownershipIdentity = createHash("sha256").update(ownershipToken).digest("hex");
  let stopped = false;
  let verifiedEmpty = false;

  const capture = (timeoutMs = probeTimeoutMs) => {
    if (stopped) throw processTreeError("stopped");
    verifiedEmpty = false;
    return ownedProcessTable({
      probeImplementation,
      timeoutMs,
      platform,
      ownershipToken,
      ownershipIdentity,
    }).filter(({ state }) => !state.startsWith("Z"));
  };

  const treeState = () => {
    const live = capture();
    verifiedEmpty = live.length === 0;
    return verifiedEmpty ? "empty" : "alive";
  };

  const signal = (signalName) => {
    if (signalName !== "SIGTERM" && signalName !== "SIGKILL") throw processTreeError("signal_invalid");
    const deadline = Date.now() + probeTimeoutMs;
    const remainingProbeMs = () => {
      const remaining = deadline - Date.now();
      if (remaining < 1) throw processTreeError("enumeration_failed");
      return remaining;
    };
    const candidates = capture(remainingProbeMs());
    let signalled = true;
    for (const { pid, identity } of candidates) {
      const verified = ownedProcessTable({
        probeImplementation,
        timeoutMs: remainingProbeMs(),
        platform,
        ownershipToken,
        ownershipIdentity,
        targetPid: pid,
      }).some((entry) => entry.pid === pid && entry.identity === identity && !entry.state.startsWith("Z"));
      if (!verified) continue;
      try { killImplementation(pid, signalName); }
      catch (error) { if (error?.code !== "ESRCH") signalled = false; }
    }
    return signalled;
  };

  capture();

  return Object.freeze({
    signal,
    treeState,
    stop() {
      if (!verifiedEmpty) throw processTreeError("not_empty");
      stopped = true;
    },
  });
}
