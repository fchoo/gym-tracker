#!/usr/bin/env node
// Subprocess transport fixture only. This executable is never native evidence.
// Production knows nothing about these controls; the harness supplies it via PATH.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";

const root = process.env.V12_CONTROLLED_STATE;
const stateFile = path.join(root, "state.json");
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const output = (value) => process.stdout.write(`${value}\n`);
const fail = () => { process.stderr.write("private-native-error /Users/private device-private bearer credential\n"); process.exit(1); };
const rawArgs = process.argv.slice(2);
state.commands = [...(state.commands ?? []), rawArgs];
save();
let args = rawArgs;
if (args[0] === "-s") args = args.slice(2);
if (args[0] === "get-state") { output(state.noDevice ? "offline" : "device"); process.exit(0); }
if (args[0] === "shell") {
  // Production serializes every Android shell argument with POSIX quoting.
  args = [...args[1].matchAll(/'([^']*)'/gu)].map((match) => match[1]);
  const [command, ...rest] = args;
  if (command === "getprop") { output(state.props[rest[0]]); process.exit(0); }
  if (command === "pm") { output("package:/data/app/controlled/base.apk"); process.exit(0); }
  if (command === "sha256sum") { output(`${state.wrongApk ? "0".repeat(64) : state.apkHash}  /data/app/controlled/base.apk`); process.exit(0); }
  const lock = path.join(root, "lock");
  if (command === "mkdir") { try { mkdirSync(lock); } catch { fail(); } process.exit(0); }
  if (command === "rmdir") { try { rmdirSync(lock); } catch { fail(); } process.exit(0); }
  if (command === "rm") { try { rmSync(path.join(lock, "owner.json"), { force: rest.includes("-f") }); } catch { fail(); } process.exit(0); }
  if (process.argv.at(-1).startsWith("cat > ")) {
    writeFileSync(path.join(lock, "owner.json"), readFileSync(0)); process.exit(0);
  }
  if (command === "cat") {
    if (!existsSync(path.join(lock, "owner.json"))) fail();
    output(state.invalidOwnerRead ? "{}" : readFileSync(path.join(lock, "owner.json"), "utf8")); process.exit(0);
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
    process.exit(0);
  }
  if (command === "am") {
    if (rest[0] === "start") {
      const uri = new URL(rest[rest.indexOf("-d") + 1]);
      state.nonce = uri.searchParams.get("runId");
      state.suite = uri.searchParams.get("suite");
      save();
    }
    output("Status: ok"); process.exit(0);
  }
}
if (args[0] === "logcat") {
  if (state.missingMarker) process.exit(0);
  const runId = state.staleMarker ? "stale-request" : state.nonce;
  if (state.routeError) { output(`GYM_TRACKER_SQLITE_CONTRACT_ERROR:${JSON.stringify({ runId, errorCode: "private-route-error" })}`); process.exit(0); }
  const result = JSON.parse(readFileSync(path.join(root, "native-marker.json"), "utf8"));
  const { cases, ...summary } = result;
  for (const entry of cases) output(`GYM_TRACKER_SQLITE_CONTRACT_CASE:${JSON.stringify({ runId, case: entry })}`);
  output(`GYM_TRACKER_SQLITE_CONTRACT_RESULT:${JSON.stringify({ runId, summary })}`);
  process.exit(0);
}
fail();
