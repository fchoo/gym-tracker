#!/usr/bin/env node
// Disposable executable used only by v12-phase20-cli-blackbox.test.mjs.
import { createHash } from "node:crypto";

const [flag, tool, ...args] = process.argv.slice(2);
if (flag !== "--tool" || !["adb", "maestro", "unzip"].includes(tool)) process.exit(64);
if (tool === "adb") {
  const command = args.slice(2);
  const joined = command.join(" ");
  if (command[0] === "get-state") process.stdout.write("device\n");
  else if (joined === "shell getprop ro.product.cpu.abi") process.stdout.write("arm64-v8a\n");
  else if (joined === "shell getprop ro.build.version.sdk") process.stdout.write("36\n");
  else if (joined === "shell getprop ro.product.model") process.stdout.write("Samsung N4\n");
  else if (joined === "shell pm list packages com.fchoo.gymtracker.devtest") process.stdout.write("package:com.fchoo.gymtracker.devtest\n");
  else if (joined === "shell pm path com.fchoo.gymtracker.devtest") process.stdout.write("package:/data/app/com.fchoo.gymtracker.devtest/base.apk\n");
  else if (joined === "shell sha256sum /data/app/com.fchoo.gymtracker.devtest/base.apk") process.stdout.write(`${createHash("sha256").update("apk").digest("hex")}  /data/app/com.fchoo.gymtracker.devtest/base.apk\n`);
  else if (joined.includes("settings get")) process.stdout.write("1\n");
  process.exit(0);
}
if (tool === "unzip") process.exit(0);
if (args.includes("--version")) {
  process.stdout.write("2.8.0\n");
  process.exit(0);
}
const output = args[args.indexOf("--output") + 1];
if (output) {
  const { mkdirSync, writeFileSync } = await import("node:fs"); const { dirname } = await import("node:path");
  const caseId = args.find(arg => arg.startsWith('V12_CASE_ID='))?.slice('V12_CASE_ID='.length) ?? 'fake';
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `<testsuite name="fake"><testcase name="${caseId}"/></testsuite>\n`);
}
process.exit(0);
