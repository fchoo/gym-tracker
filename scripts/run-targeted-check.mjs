import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

const CHECKS = Object.freeze({
  "exercise-library": [
    ["--test", "scripts/content/diff-exercise-pack.test.mjs"],
    ["scripts/content/validate-exercise-pack.mjs", "--self-test"],
    ["scripts/content/validate-exercise-pack.mjs", "--check"],
    ["scripts/content/diff-exercise-pack.mjs", "--check"],
  ],
});

function runNode(argumentsList) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, argumentsList, {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error("targeted_check_interrupted"));
      } else if (code !== 0) {
        reject(new Error(`targeted_check_failed:${code}`));
      } else {
        resolvePromise();
      }
    });
  });
}

const [checkName, ...unexpectedArguments] = process.argv.slice(2);
if (
  checkName === undefined
  || unexpectedArguments.length > 0
  || !Object.hasOwn(CHECKS, checkName)
) {
  process.stderr.write(
    `Usage: node scripts/run-targeted-check.mjs ${Object.keys(CHECKS).join(" | ")}\n`,
  );
  process.exitCode = 2;
} else {
  for (const commandArguments of CHECKS[checkName]) {
    await runNode(commandArguments);
  }
  process.stdout.write(`${JSON.stringify({
    check: checkName,
    status: "pass",
    commands: CHECKS[checkName].length,
  })}\n`);
}
