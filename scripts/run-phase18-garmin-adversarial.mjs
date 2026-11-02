#!/usr/bin/env node

export * from "./adversarial-runner-evidence.mjs";

import { executePhase18GarminAdversarialRunnerCli } from "./adversarial-runner-evidence.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAdversarialRunnerCli);
