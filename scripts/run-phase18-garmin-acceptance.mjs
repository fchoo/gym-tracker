#!/usr/bin/env node

export * from "./acceptance-runner-evidence.mjs";

import { executePhase18GarminAcceptanceRunnerCli } from "./acceptance-runner-evidence.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAcceptanceRunnerCli);
