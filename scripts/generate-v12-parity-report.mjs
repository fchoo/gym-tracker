#!/usr/bin/env node

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
  if (args.length !== 0) {
    io.stderr.write("v12_parity_report_arguments_invalid\n");
    return 1;
  }
  io.stderr.write("v12_parity_report_ledger_required\n");
  return 1;
}

if (process.argv[1]?.endsWith("generate-v12-parity-report.mjs")) process.exitCode = runV12ParityReportCli();
