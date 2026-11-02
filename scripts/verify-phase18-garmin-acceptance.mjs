#!/usr/bin/env node

export * from "./acceptance-verifier-evidence.mjs";

import { executePhase18GarminAcceptanceVerifierCli } from "./acceptance-verifier-evidence.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAcceptanceVerifierCli);
