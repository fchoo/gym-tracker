#!/usr/bin/env node

export * from "./adversarial-verifier-evidence.mjs";

import { executePhase18GarminAdversarialVerifierCli } from "./adversarial-verifier-evidence.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAdversarialVerifierCli);
