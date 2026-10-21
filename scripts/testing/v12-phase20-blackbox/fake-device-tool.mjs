#!/usr/bin/env node
// Disposable executable used only by v12-phase20-cli-blackbox.test.mjs.
import { createHash } from "node:crypto";
import { once } from "node:events";

const stdout = [];
const output = (value) => stdout.push(String(value));
async function drain() {
  const value = stdout.join("");
  if (value.length > 0 && !process.stdout.write(value)) await once(process.stdout, "drain");
}

async function main() {
  try {
    const [flag, tool, ...args] = process.argv.slice(2);
    if (flag !== "--tool" || !["adb", "maestro", "unzip"].includes(tool)) return 64;
    if (tool === "adb") {
      const command = args.slice(2);
      const joined = command.join(" ");
      if (command[0] === "get-state") output("device\n");
      else if (joined === "shell getprop ro.product.cpu.abi") output("arm64-v8a\n");
      else if (joined === "shell getprop ro.build.version.sdk") output("36\n");
      else if (joined === "shell getprop ro.product.model") output("Samsung N4\n");
      else if (joined === "shell pm list packages com.fchoo.gymtracker.devtest") output("package:com.fchoo.gymtracker.devtest\n");
      else if (joined === "shell pm path com.fchoo.gymtracker.devtest") output("package:/data/app/com.fchoo.gymtracker.devtest/base.apk\n");
      else if (joined === "shell sha256sum /data/app/com.fchoo.gymtracker.devtest/base.apk") output(`${createHash("sha256").update("apk").digest("hex")}  /data/app/com.fchoo.gymtracker.devtest/base.apk\n`);
      else if (joined.includes("settings get")) output("1\n");
      return 0;
    }
    if (tool === "unzip") return 0;
    if (args.includes("--version")) {
      output("2.8.0\n");
      return 0;
    }
    const report = args[args.indexOf("--output") + 1];
    if (report) {
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      const caseId = args.find((arg) => arg.startsWith("V12_CASE_ID="))?.slice("V12_CASE_ID=".length) ?? "fake";
      mkdirSync(dirname(report), { recursive: true });
      writeFileSync(report, `<testsuite name="fake"><testcase name="${caseId}"/></testsuite>\n`);
    }
    return 0;
  } finally {
    await drain();
  }
}

process.exitCode = await main();
