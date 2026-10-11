#!/usr/bin/env node

export * from "./proof-runner-evidence.mjs";

import { executePhase18GarminProofRunnerCli } from "./proof-runner-evidence.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminProofRunnerCli);
