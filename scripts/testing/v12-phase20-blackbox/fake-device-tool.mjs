#!/usr/bin/env node
// Disposable executable used only by v12-phase20-cli-blackbox.test.mjs.
const [flag, tool, ...args] = process.argv.slice(2);
if (flag !== "--tool" || !["adb", "maestro"].includes(tool)) process.exit(64);
if (tool === "adb") {
  if (args.join(" ").includes("settings get")) process.stdout.write("1\n");
  else if (args.join(" ").includes("get-state")) process.stdout.write("device\n");
  process.exit(0);
}
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
