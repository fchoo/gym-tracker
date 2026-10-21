#!/usr/bin/env node
// Subprocess transport fixture only. This executable is never native evidence.
// Production knows nothing about these controls; the harness supplies it via PATH.
import { once } from "node:events";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";

const root = process.env.V12_CONTROLLED_STATE;
const stateFile = path.join(root, "state.json");
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const stdout = [];
const stderr = [];
const output = (value) => stdout.push(`${value}\n`);
class ControlledToolExit extends Error { constructor(code) { super("controlled_tool_exit"); this.code = code; } }
const fail = () => { stderr.push("private-native-error /Users/private device-private bearer credential\n"); throw new ControlledToolExit(1); };
async function drain() {
  const outputValue = stdout.join("");
  const errorValue = stderr.join("");
  if (outputValue.length > 0 && !process.stdout.write(outputValue)) await once(process.stdout, "drain");
  if (errorValue.length > 0 && !process.stderr.write(errorValue)) await once(process.stderr, "drain");
}

async function main() {
try {
const rawArgs = process.argv.slice(2);
state.commands = [...(state.commands ?? []), rawArgs];
save();
let args = rawArgs;
if (args[0] === "-s") args = args.slice(2);
if (args[0] === "get-state") { output(state.noDevice ? "offline" : "device"); return 0; }
if (args[0] === "shell") {
  // Production serializes every Android shell argument with POSIX quoting.
  args = [...args[1].matchAll(/'([^']*)'/gu)].map((match) => match[1]);
  const [command, ...rest] = args;
  if (command === "getprop") { output(state.props[rest[0]]); return 0; }
  if (command === "pm") { output("package:/data/app/~~controlled-token==/com.fchoo.gymtracker.devtest-controlled==/base.apk"); return 0; }
  if (command === "sha256sum") { output(`${state.wrongApk ? "0".repeat(64) : state.apkHash}  /data/app/~~controlled-token==/com.fchoo.gymtracker.devtest-controlled==/base.apk`); return 0; }
  const lock = path.join(root, "lock");
  if (command === "mkdir") { try { mkdirSync(lock); } catch { fail(); } return 0; }
  if (command === "rmdir") { try { rmdirSync(lock); } catch { fail(); } return 0; }
  if (command === "rm") { try { rmSync(path.join(lock, "owner.json"), { force: rest.includes("-f") }); } catch { fail(); } return 0; }
  if (process.argv.at(-1).startsWith("cat > ")) {
    writeFileSync(path.join(lock, "owner.json"), readFileSync(0)); return 0;
  }
  if (command === "cat") {
    if (!existsSync(path.join(lock, "owner.json"))) fail();
    output(state.invalidOwnerRead ? "{}" : readFileSync(path.join(lock, "owner.json"), "utf8")); return 0;
  }
  if (command === "settings") {
    const [operation, , key, value] = rest;
    if (operation === "get") output(state.settings[key] ?? "null");
    else {
      state.restorationAttempts = [...(state.restorationAttempts ?? []), key];
      if (state.failedSetting !== key && state.ignoredSetting !== key) {
        if (operation === "delete") delete state.settings[key];
        else state.settings[key] = value;
      }
      save();
      if (state.failedSetting === key) fail();
    }
    return 0;
  }
  if (command === "wm") {
    const [key, value] = rest;
    const current = state.display[key];
    if (value === undefined) output(`Physical ${key}: ${current.physical}${current.override === null ? "" : `\nOverride ${key}: ${current.override}`}`);
    else {
      state.restorationAttempts = [...(state.restorationAttempts ?? []), `wm-${key}`];
      if (state.failedCalendarSetting !== `wm-${key}` && state.ignoredCalendarSetting !== `wm-${key}`) current.override = value === "reset" ? null : value;
      save(); if (state.failedCalendarSetting === `wm-${key}`) fail();
    }
    return 0;
  }
  if (command === "cmd" && rest[0] === "connectivity" && rest[1] === "airplane-mode") {
    if (rest[2] === undefined) output(`Airplane mode is ${state.display.airplane}`);
    else { state.display.airplane = rest[2] === "enable" ? "enabled" : "disabled"; state.settings.airplane_mode_on = rest[2] === "enable" ? "1" : "0"; save(); }
    return 0;
  }
  if (command === "cmd" && rest[0] === "uimode" && rest[1] === "night") {
    if (rest[2] === undefined) output(`Night mode: ${state.display.night}`);
    else {
      state.restorationAttempts = [...(state.restorationAttempts ?? []), "night"];
      if (state.failedCalendarSetting !== "night" && state.ignoredCalendarSetting !== "night") state.display.night = rest[2];
      save(); if (state.failedCalendarSetting === "night") fail();
    }
    return 0;
  }
  if (command === "am") {
    if (rest[0] === "start") {
      const uri = new URL(rest[rest.indexOf("-d") + 1]);
      state.nonce = uri.searchParams.get("runId");
      state.suite = uri.searchParams.get("suite");
      save();
    }
    output("Status: ok"); return 0;
  }
}
if (args[0] === "logcat") {
  if (state.missingMarker) return 0;
  const runId = state.staleMarker ? "stale-request" : state.nonce;
  if (state.routeError) { output(`GYM_TRACKER_SQLITE_CONTRACT_ERROR:${JSON.stringify({ runId, errorCode: "private-route-error" })}`); return 0; }
  const result = JSON.parse(readFileSync(path.join(root, "native-marker.json"), "utf8"));
  const { cases, ...summary } = result;
  for (const entry of cases) output(`GYM_TRACKER_SQLITE_CONTRACT_CASE:${JSON.stringify({ runId, case: entry })}`);
  output(`GYM_TRACKER_SQLITE_CONTRACT_RESULT:${JSON.stringify({ runId, summary })}`);
  return 0;
}
fail();
} catch (error) {
  if (error instanceof ControlledToolExit) return error.code;
  throw error;
} finally {
  await drain();
}
}

process.exitCode = await main();
