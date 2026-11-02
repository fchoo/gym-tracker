#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { writeSync } from "node:fs";

const [executable, ...args] = process.argv.slice(2);
if (typeof executable !== "string" || executable.length === 0) {
  process.exitCode = 64;
} else {
  let targetClosed = false;
  let targetStatus = 1;
  let targetSignal = null;
  let finishing = false;

  const groupHasTargetMembers = () => {
    if (process.platform === "win32") return false;
    const result = spawnSync("ps", ["-axo", "pid=,pgid="], {
      encoding: "utf8",
      timeout: 1_000,
      windowsHide: true,
    });
    if (result.error || result.signal || result.status !== 0) return true;
    return result.stdout.split(/\r?\n/u).some((line) => {
      const [pid, group] = line.trim().split(/\s+/u).map(Number);
      return group === process.pid && pid !== process.pid && pid !== result.pid;
    });
  };

  const finishWhenUnowned = () => {
    if (!targetClosed || finishing) return;
    finishing = true;
    const poll = () => {
      if (groupHasTargetMembers()) {
        setTimeout(poll, 10);
        return;
      }
      if (targetSignal !== null || !Number.isInteger(targetStatus)) process.exitCode = 1;
      else process.exitCode = targetStatus;
    };
    poll();
  };

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, finishWhenUnowned);
  }

  const target = spawn(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    detached: false,
    stdio: "inherit",
    windowsHide: true,
  });
  target.once("error", () => {
    targetClosed = true;
    targetStatus = 1;
    finishWhenUnowned();
  });
  target.once("close", (status, signal) => {
    targetClosed = true;
    targetStatus = status;
    targetSignal = signal;
    finishWhenUnowned();
  });
  try { writeSync(3, "ready\n"); } catch { /* fd 3 is an internal optional readiness channel */ }
}
