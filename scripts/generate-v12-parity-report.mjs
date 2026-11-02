#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(code) {
  throw new Error(`v12_parity_report_${code}`);
}

/**
 * Render an already-derived ledger. This module is deliberately read-only: it
 * accepts no shard observations, maps no verdicts, and writes no evidence.
 */
export function generateV12ParityReport({ ledger } = {}) {
  if (!ledger || !Array.isArray(ledger.rows) || ledger.rows.length !== 172
    || !ledger.verdict_counts || typeof ledger.readiness !== "string") fail("ledger_invalid");
  const ordered = Object.entries(ledger.verdict_counts)
    .map(([verdict, count]) => `${verdict}: ${count}`)
    .join("\n");
  return [
    "Gym Tracker v1.2 parity report",
    `Run: ${ledger.run_id}`,
    `Readiness: ${ledger.readiness}`,
    `Rows: ${ledger.rows.length}`,
    ordered,
    `Accepted exceptions: ${ledger.accepted_exception_count ?? 0}`,
  ].join("\n");
}

export function runV12ParityReportCli(args = process.argv.slice(2), io = process) {
  if (args.length !== 2 || args[0] !== "--final-evidence") {
    io.stderr.write("v12_parity_report_arguments_invalid\n");
    return 1;
  }
  try {
    const file = args[1];
    if (path.isAbsolute(file) || file.includes("\\") || file.split("/").includes("..")) throw new Error("path");
    const seal = JSON.parse(readFileSync(file, "utf8"));
    if (seal?.schema_version !== 3 || !Array.isArray(seal.rows) || seal.rows.length !== 172 || seal.release_authorized !== false) throw new Error("seal");
    io.stdout.write(`${generateV12ParityReport({ ledger: seal })}\n`);
    return 0;
  } catch {
    io.stderr.write("v12_parity_report_seal_invalid\n");
    return 1;
  }
}

if (process.argv[1]?.endsWith("generate-v12-parity-report.mjs")) process.exitCode = runV12ParityReportCli();
