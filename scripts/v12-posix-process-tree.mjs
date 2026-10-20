import { spawnSync } from "node:child_process";

const PROCESS_TABLE_ARGUMENTS = Object.freeze(["-axo", "pid=,ppid=,pgid=,sess=,stat=,lstart="]);
const MAX_PROCESS_ROWS = 4_096;

function processTreeError(code) {
  return new Error(`v12_posix_process_tree_${code}`);
}

function parseProcessTable(stdout) {
  if (typeof stdout !== "string") throw processTreeError("enumeration_failed");
  const rows = stdout.trim() === "" ? [] : stdout.trim().split(/\r?\n/u);
  if (rows.length > MAX_PROCESS_ROWS) throw processTreeError("enumeration_failed");
  const processes = [];
  for (const row of rows) {
    const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u.exec(row.trim());
    if (match === null) throw processTreeError("enumeration_failed");
    const [pid, ppid, pgid, session] = match.slice(1, 5).map(Number);
    const state = match[5];
    const bornAt = match[6].trim();
    if (![pid, ppid, pgid, session].every(Number.isSafeInteger) || pid < 1 || ppid < 0 || pgid < 1 || session < 0 || bornAt === "") {
      throw processTreeError("enumeration_failed");
    }
    processes.push({ pid, ppid, pgid, session, state, bornAt, identity: `${String(pid)}:${bornAt}` });
  }
  return processes;
}

function processTable(probeImplementation, timeoutMs) {
  let outcome;
  try {
    outcome = probeImplementation("ps", PROCESS_TABLE_ARGUMENTS, {
      encoding: "utf8", maxBuffer: 1024 * 1024, timeout: timeoutMs,
    });
  } catch {
    throw processTreeError("enumeration_failed");
  }
  if (outcome?.status !== 0 || outcome.signal !== null || outcome.error !== undefined) throw processTreeError("enumeration_failed");
  return parseProcessTable(outcome.stdout);
}

/**
 * Tracks only descendants observed while the supervised leader still has a
 * verified birth identity. A descendant remains owned after it calls setsid or
 * is reparented, but a reused PID is never signalled.
 */
export function createV12PosixProcessTreeTracker({
  leaderPid,
  probeImplementation = spawnSync,
  killImplementation = process.kill.bind(process),
  probeTimeoutMs = 1_000,
  pollMs = 10,
} = {}) {
  if (!Number.isSafeInteger(leaderPid) || leaderPid < 1 || typeof probeImplementation !== "function"
    || typeof killImplementation !== "function" || !Number.isSafeInteger(probeTimeoutMs) || probeTimeoutMs < 1
    || !Number.isSafeInteger(pollMs) || pollMs < 1) {
    throw processTreeError("arguments_invalid");
  }

  const tracked = new Map();
  const ownedGroups = new Set();
  let polling;
  let stopped = false;
  let trackingFailed = false;

  const capture = () => {
    const processes = processTable(probeImplementation, probeTimeoutMs);
    const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
    if (tracked.size === 0) {
      const leader = byPid.get(leaderPid);
      if (leader === undefined) throw processTreeError("leader_unavailable");
      tracked.set(leader.pid, leader);
      ownedGroups.add(leader.pgid);
    }
    const connected = new Set();
    for (const entry of tracked.values()) {
      const current = byPid.get(entry.pid);
      if (current?.identity === entry.identity) connected.add(entry.pid);
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const entry of processes) {
        if (!connected.has(entry.ppid) || tracked.has(entry.pid)) continue;
        tracked.set(entry.pid, entry);
        ownedGroups.add(entry.pgid);
        connected.add(entry.pid);
        expanded = true;
      }
    }
    for (const entry of tracked.values()) {
      const current = byPid.get(entry.pid);
      if (current?.identity === entry.identity) ownedGroups.add(current.pgid);
    }
    return { byPid, processes };
  };

  const liveTracked = (byPid) => [...tracked.values()].flatMap((entry) => {
    const current = byPid.get(entry.pid);
    return current?.identity === entry.identity && !current.state.startsWith("Z") ? [current] : [];
  });
  const treeState = () => {
    if (trackingFailed) throw processTreeError("enumeration_failed");
    const { byPid, processes } = capture();
    if (liveTracked(byPid).length > 0) return "alive";
    for (const pgid of ownedGroups) {
      if (processes.some((entry) => entry.pgid === pgid && !entry.state.startsWith("Z"))) return "alive";
    }
    return "empty";
  };
  const signal = (signalName) => {
    if (trackingFailed) return false;
    let byPid;
    try { ({ byPid } = capture()); }
    catch { return false; }
    const live = liveTracked(byPid);
    const groups = new Set(live.map(({ pgid }) => pgid));
    let signalled = true;
    for (const pgid of groups) {
      try { killImplementation(-pgid, signalName); }
      catch (error) { if (error?.code !== "ESRCH") signalled = false; }
    }
    for (const { pid, identity } of live) {
      const current = byPid.get(pid);
      if (current?.identity !== identity) continue;
      try { killImplementation(pid, signalName); }
      catch (error) { if (error?.code !== "ESRCH") signalled = false; }
    }
    return signalled;
  };

  capture();
  polling = setInterval(() => {
    if (stopped) return;
    try { capture(); }
    catch { trackingFailed = true; stopped = true; clearInterval(polling); }
  }, pollMs);

  return Object.freeze({
    signal,
    treeState,
    stop() {
      stopped = true;
      clearInterval(polling);
    },
  });
}
