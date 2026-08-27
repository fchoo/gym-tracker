import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { collectPhase2InputSourceAudit } from "./run-phase2-maestro.mjs";

const projectRoot = process.cwd();
const contractSources = [
  ["sqliteKernel.contract.ts", "SQLITE_KERNEL_CONTRACT_CASES"],
  ["migrationsEffects.contract.ts", "MIGRATIONS_EFFECTS_CONTRACT_CASES"],
  ["phase2Fts.contract.ts", "PHASE2_FTS_CASE_IDS"],
  ["phase2Content.contract.ts", "PHASE2_CONTENT_CASE_IDS"],
  ["phase2Search.contract.ts", "PHASE2_SEARCH_CASE_IDS"],
  ["phase2Metrics.contract.ts", "PHASE2_METRICS_CASE_IDS"],
  ["phase2Starter.contract.ts", "PHASE2_STARTER_CASE_IDS"],
  ["phase2Plan.contract.ts", "PHASE2_PLAN_CASE_IDS"],
  ["phase2Schedule.contract.ts", "PHASE2_SCHEDULE_CASE_IDS"],
];

function exactLedger(label, actual, expected) {
  if (!Array.isArray(actual)) {
    throw new Error(`${label} ledger is missing.`);
  }
  const duplicates = actual.filter(
    (id, index) => actual.indexOf(id) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} ledger contains duplicate IDs.`);
  }
  if (
    actual.length !== expected.length
    || actual.some((id, index) => id !== expected[index])
  ) {
    throw new Error(`${label} ledger is incomplete or stale.`);
  }
}

function sourceError(label) {
  throw new Error(label + " source ledger is malformed or stale.");
}

function sortedUnique(label, values, compare = (left, right) =>
  left.localeCompare(right)) {
  if (!Array.isArray(values) || values.length < 1) {
    sourceError(label);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(label + " contains duplicate IDs.");
  }
  if (values.some((value, index) => index > 0
    && compare(values[index - 1], value) >= 0)) {
    throw new Error(label + " is not sorted.");
  }
  return values;
}

function numericIdOrder(prefix) {
  return (left, right) => Number(left.slice(prefix.length))
    - Number(right.slice(prefix.length));
}

function contiguousIds(label, values, prefix, count) {
  const expected = Array.from(
    { length: count },
    (_, index) => prefix + String(index + 1).padStart(2, "0"),
  );
  exactLedger(label, values, expected);
  return values;
}

function parseDelimitedIds(value, label, {
  allowSentinel = false,
  expectedOrder,
} = {}) {
  if (allowSentinel && value === "—") {
    return [];
  }
  if (!value || value === "—" || value.includes(",  ")
    || value.includes(",") && !value.includes(", ")) {
    sourceError(label);
  }
  const values = value.split(", ");
  if (values.some((entry) => !entry.trim()) || new Set(values).size !== values.length) {
    sourceError(label);
  }
  if (expectedOrder) {
    const positions = values.map((entry) => expectedOrder.indexOf(entry));
    if (positions.some((position) => position < 0)
      || positions.some((position, index) => index > 0
        && positions[index - 1] >= position)) {
      sourceError(label);
    }
  }
  return values;
}

export function validateUiSurfaceRemediationCases(
  surfaces,
  remediationCaseIds,
) {
  for (const row of surfaces) {
    const caseIds = parseDelimitedIds(
      row.remediation_cases,
      row.surface_id + " remediation cases",
    );
    if (caseIds.some((caseId) => !remediationCaseIds.includes(caseId))) {
      sourceError(row.surface_id + " remediation case foreign key");
    }
  }
}

function ledgerSection(source, name) {
  const marker = "<!-- phase2-ledger:v1 name=" + name + " -->";
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    sourceError(name + " marker");
  }
  return source.slice(start + marker.length);
}

function parseLedgerTable(source, name, columns) {
  const lines = ledgerSection(source, name).split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => line.startsWith("|"));
  if (headerIndex < 0 || lines[headerIndex + 1] === undefined) {
    sourceError(name);
  }
  const parseCells = (line) => line.split("|").slice(1, -1)
    .map((cell) => cell.trim());
  if (parseCells(lines[headerIndex]).join("|") !== columns.join("|")
    || !/^\|(?:\s*:?-{3,}:?\s*\|)+$/u.test(lines[headerIndex + 1])) {
    sourceError(name + " header");
  }
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) {
      break;
    }
    const cells = parseCells(line);
    if (cells.length !== columns.length || cells.some((cell) => !cell)) {
      sourceError(name + " row");
    }
    rows.push(Object.fromEntries(columns.map((column, index) => [column, cells[index]])));
  }
  if (rows.length < 1) {
    sourceError(name);
  }
  return rows;
}

function sourceIds(source, expression, label, order) {
  const ids = [...source.matchAll(expression)].map((match) => match[1]);
  return sortedUnique(label, ids, order);
}

function sourceArray(root, fileName, exportName) {
  const source = readFileSync(
    path.join(root, "src/testing/contracts", fileName),
    "utf8",
  );
  const block = source.match(
    new RegExp(
      `export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`,
      "u",
    ),
  )?.[1] ?? "";
  const ids = [...block.matchAll(/"([a-z0-9-]+)"/gu)]
    .map((match) => match[1]);
  if (ids.length < 1 || new Set(ids).size !== ids.length) {
    throw new Error(`${exportName} could not be derived from source.`);
  }
  return ids;
}

function integrityFilesFromCoverageRunner(root) {
  const source = readFileSync(
    path.join(root, "scripts/run-coverage-gate.mjs"),
    "utf8",
  );
  const block = source.match(
    /const integrityCriticalFiles = \[([\s\S]*?)\];/u,
  )?.[1] ?? "";
  const files = [...block.matchAll(/"([^"]+\.ts)"/gu)]
    .map((match) => match[1]);
  if (files.length < 1 || new Set(files).size !== files.length) {
    throw new Error("integrity-critical coverage files are invalid.");
  }
  return files;
}

export async function collectPhase2SourceLedger(root = projectRoot) {
  if (path.resolve(root) !== path.resolve(projectRoot)) {
    throw new Error("source ledger root must be the current project.");
  }
  const requirementsSource = readFileSync(path.join(root, ".planning/REQUIREMENTS.md"), "utf8");
  const requirements = sourceIds(requirementsSource, /^- \[.\] \*\*(LIB-\d{2})\*\*:/gmu, "requirement source", numericIdOrder("LIB-"));
  const context = readFileSync(
    path.join(root, ".planning/phases/02-owned-library-and-planning/02-CONTEXT.md"),
    "utf8",
  );
  const decisions = sourceIds(context, /^- \*\*(D-\d{2}):\*\*/gmu, "decision source", numericIdOrder("D-"));
  contiguousIds("decision source", decisions, "D-", 67);

  const validation = readFileSync(path.join(root, ".planning/phases/02-owned-library-and-planning/02-VALIDATION.md"), "utf8");
  const gaps = sourceIds(validation, /^\| (G-02-\d{2}) \|/gmu, "remediation gap source", numericIdOrder("G-02-"));
  contiguousIds("remediation gap source", gaps, "G-02-", 9);
  const coverage = readFileSync(path.join(root, ".planning/phases/02-owned-library-and-planning/COVERAGE.md"), "utf8");
  const uiSpec = readFileSync(path.join(root, ".planning/phases/02-owned-library-and-planning/02-UI-SPEC.md"), "utf8");
  const remediationRows = parseLedgerTable(validation, "remediation-cases", [
    "id", "decision_ids", "gap_ids", "implementation_summary", "automated_evidence", "native_or_device_flow", "attended_roles", "status",
  ]);
  const remediationCaseIds = sortedUnique("remediation case source", remediationRows.map(({ id }) => id));
  const attendedRows = parseLedgerTable(coverage, "attended-rows", ["role", "status", "scope", "identity_rule", "record_owner"]);
  const attendedRoles = sortedUnique("attended role source", attendedRows.map(({ role }) => role));
  for (const row of remediationRows) {
    const decisionIds = parseDelimitedIds(row.decision_ids, row.id, { expectedOrder: decisions });
    const gapIds = parseDelimitedIds(row.gap_ids, row.id, { expectedOrder: gaps });
    const roles = parseDelimitedIds(row.attended_roles, row.id, { expectedOrder: attendedRoles });
    if (decisionIds.some((id) => !decisions.includes(id)) || gapIds.some((id) => !gaps.includes(id)) || roles.some((role) => !attendedRoles.includes(role))
      || !["implemented_host_verified_evidence_pending", "implemented_summary_pending_evidence_pending", "planned", "deferred_phase_3", "failed"].includes(row.status)) {
      sourceError(row.id + " foreign key");
    }
  }
  const requirementRows = parseLedgerTable(validation, "requirement-traceability", ["requirement_id", "implementation_summaries", "remediation_cases", "evidence_owners"]);
  exactLedger("requirement traceability", requirementRows.map(({ requirement_id: id }) => id), requirements);
  for (const row of requirementRows) {
    const summaries = parseDelimitedIds(row.implementation_summaries, row.requirement_id + " summaries");
    const caseIds = parseDelimitedIds(row.remediation_cases, row.requirement_id + " remediation cases", { expectedOrder: remediationCaseIds });
    const plans = parseDelimitedIds(row.evidence_owners, row.requirement_id + " evidence owners");
    if (caseIds.some((id) => !remediationCaseIds.includes(id))
      || summaries.some((file) => !existsSync(path.join(root, ".planning/phases/02-owned-library-and-planning", file)))
      || plans.some((file) => !existsSync(path.join(root, ".planning/phases/02-owned-library-and-planning", file)))) {
      sourceError(row.requirement_id + " traceability foreign key");
    }
  }
  const surfaces = parseLedgerTable(uiSpec, "ui-surfaces", ["surface_id", "ownership", "remediation_cases", "evidence_responsibility"]);
  const surfaceIds = sortedUnique("UI surface source", surfaces.map(({ surface_id: id }) => id));
  validateUiSurfaceRemediationCases(surfaces, remediationCaseIds);
  const uiTruths = coverage.match(/Truth IDs are fixed and ordered as follows: ([^.]+)\./u)?.[1].split(",").map((value) => value.replace(/\x60/gu, "").trim());

  const nativeCaseIds = contractSources.flatMap(
    ([fileName, exportName]) => sourceArray(root, fileName, exportName),
  );
  if (new Set(nativeCaseIds).size !== nativeCaseIds.length) {
    throw new Error("native contract source contains duplicate IDs.");
  }
  const truthRows = parseLedgerTable(coverage, "ui-truth-coverage", ["surface_id", "truth_id", "applicability", "reason_or_expectation", "remediation_cases", "evidence"]);
  const expectedTruthRows = surfaceIds.flatMap((surfaceId) => uiTruths.map((truthId) => surfaceId + "|" + truthId));
  exactLedger("UI truth coverage", truthRows.map((row) => row.surface_id + "|" + row.truth_id), expectedTruthRows);
  for (const row of truthRows) {
    const absent = row.remediation_cases === "—" || row.evidence === "—";
    if (!["required", "not_applicable"].includes(row.applicability)
      || (row.applicability === "not_applicable" && (!absent || row.remediation_cases !== "—" || row.evidence !== "—"))
      || (row.applicability === "required" && absent)) sourceError(row.surface_id + " truth row");
    const caseIds = parseDelimitedIds(row.remediation_cases, row.surface_id + " truth", { allowSentinel: true });
    if (caseIds.some((caseId) => !remediationCaseIds.includes(caseId))) sourceError(row.surface_id + " truth foreign key");
    if (row.applicability === "required") {
      const route = row.evidence.split("+");
      if (row.evidence.includes(" ") || route.some((token) => !["auto", ...attendedRoles].includes(token)) || new Set(route).size !== route.length) {
        sourceError(row.surface_id + " evidence route");
      }
      if (route.includes("auto") && caseIds.some((id) => {
        const remediation = remediationRows.find((candidate) => candidate.id === id);
        return !remediation || remediation.automated_evidence.startsWith("Pending:") || remediation.automated_evidence.length < 24;
      })) sourceError(row.surface_id + " automated evidence route");
      for (const role of route.filter((token) => token !== "auto")) {
        if (caseIds.some((id) => !parseDelimitedIds(remediationRows.find((candidate) => candidate.id === id).attended_roles, id).includes(role))) {
          sourceError(row.surface_id + " attended evidence route");
        }
      }
    }
  }
  const prohibitionRows = parseLedgerTable(coverage, "prohibitions", ["id", "constraint", "enforcement", "attended_review", "remediation_cases", "attended_roles"]);
  const prohibitions = sortedUnique("prohibition source", prohibitionRows.map(({ id }) => id));
  for (const row of prohibitionRows) {
    const caseIds = parseDelimitedIds(row.remediation_cases, row.id, { expectedOrder: remediationCaseIds });
    const roles = parseDelimitedIds(row.attended_roles, row.id, { expectedOrder: attendedRoles });
    if (caseIds.some((caseId) => !remediationCaseIds.includes(caseId)) || roles.some((role) => !attendedRoles.includes(role))) sourceError(row.id + " foreign key");
  }
  const inputSourceAudit = await collectPhase2InputSourceAudit(root);
  return {
    requirements, decisions, edges: [...decisions, ...gaps], gaps,
    remediationCaseIds, remediationRows, surfaceIds,
    uiTruths: (() => {
      if (!Array.isArray(uiTruths) || uiTruths.length < 1 || new Set(uiTruths).size !== uiTruths.length) sourceError("UI truth source");
      return uiTruths;
    })(),
    attendedRoles, uiTruthRows: truthRows, prohibitions, prohibitionRows,
    inputSourceAudit, nativeCaseIds,
    integrityCriticalFiles: integrityFilesFromCoverageRunner(root),
  };
}
