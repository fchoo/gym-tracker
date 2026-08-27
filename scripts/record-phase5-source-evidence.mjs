#!/usr/bin/env node

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  loadPhase5Candidate,
  parsePhase5CandidateArguments,
  phase5CandidateIdentity,
  sha256File,
} from "./phase5-candidate-evidence.mjs";
import { validatePhase5SourceEvidence } from "./verify-phase5-native-evidence.mjs";

const sourceReports = Object.freeze([
  Object.freeze({ id: "source-static-gates", option: "staticReport" }),
  Object.freeze({ id: "generated-cng-and-backup-rules", option: "generatedReport" }),
]);

function execute(args = process.argv.slice(2)) {
  const options = parsePhase5CandidateArguments(args, new Map([
    ["--static-report", "staticReport"],
    ["--generated-report", "generatedReport"],
    ["--device-json", "deviceJson"],
    ["--output", "output"],
  ]));
  if (!options.output || !options.deviceJson
    || sourceReports.some(({ option }) => !options[option])) {
    throw new Error("source evidence requires both raw reports and output.");
  }
  const candidate = loadPhase5Candidate(options);
  const device = JSON.parse(readFileSync(options.deviceJson, "utf8")).device;
  const commands = sourceReports.map(({ id, option }) => {
    const contents = readFileSync(options[option], "utf8");
    if (!contents.includes("phase5-source-gate: passed")) {
      throw new Error(`source report did not pass: ${id}`);
    }
    const rawReportFile = path.basename(options[option]);
    const retainedReport = path.join(path.dirname(options.output), rawReportFile);
    copyFileSync(options[option], retainedReport);
    return {
      id, status: "passed", raw_report_file: rawReportFile,
      raw_report_sha256: sha256File(retainedReport),
    };
  });
  const report = {
    schema_version: 1, suite: "phase5", status: "passed",
    mode: "automated-only", approval_status: "evidence_pending",
    attended_scope: "excluded", producer: "phase5-source-gates/v1",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
    device,
    commands,
  };
  validatePhase5SourceEvidence(
    report, candidate.manifest, candidate.manifest_sha256,
    Object.fromEntries(commands.map((command) => [
      command.id, readFileSync(path.join(path.dirname(options.output), command.raw_report_file)),
    ])),
  );
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
}

try {
  execute();
  process.stdout.write("{\"ok\":true}\n");
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
