import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const argumentsForJest = process.argv.slice(2).map((argument) => {
  if (!argument.includes("(tabs)")) {
    return argument;
  }

  return resolve(argument).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
});
const result = spawnSync(
  "jest",
  [
    "--config",
    "jest.config.js",
    "--selectProjects",
    "components",
    ...argumentsForJest,
  ],
  {
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
