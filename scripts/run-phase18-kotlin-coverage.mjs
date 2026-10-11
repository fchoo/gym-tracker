#!/usr/bin/env node

export * from "./kotlin-coverage-evidence.mjs";

import { executePhase18KotlinCoverageCli } from "./kotlin-coverage-evidence.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

runCliIfMain(import.meta.url, process.argv[1], executePhase18KotlinCoverageCli);
