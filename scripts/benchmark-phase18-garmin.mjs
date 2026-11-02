#!/usr/bin/env node

export * from "./benchmark-evidence-runner.mjs";

import { executePhase18GarminBenchmarkCli } from "./benchmark-evidence-runner.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminBenchmarkCli);
