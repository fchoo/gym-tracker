import { describe, expect, it, jest } from "@jest/globals";

import { LOGICAL_BACKUP_TABLES, type LogicalBackupSnapshot } from "../../../domains/portability/backupContracts";
import { RestoreCandidateProbeError } from "../../../domains/portability/restoreCommands";
import {
  createSqliteRestoreCandidateProbe,
  createSqliteRestoreCatalogReferenceAvailabilityPort,
  createSqliteRestoreRetainedReferencePort,
  createSqliteRestoreSchemaPort,
} from "./restorePreflightAdapters";
import type { SqliteKernel } from "../sqliteKernel";

type MutableBackupRow = Record<string, any>;
type FixtureTable = "workout_sessions" | "session_exercises" | "session_sets" | "owned_progression_recommendations" | "progression_recommendations" | "plan_day_exercises";
type MutableTables = Record<string, MutableBackupRow[]> & {
  workout_sessions: MutableBackupRow[];
  session_exercises: MutableBackupRow[];
  session_sets: MutableBackupRow[];
  owned_progression_recommendations: MutableBackupRow[];
  plan_day_exercises: MutableBackupRow[];
  progression_recommendations: MutableBackupRow[];
};
type MutableSnapshot = { tables: MutableTables };

function firstRow(candidate: MutableSnapshot, table: FixtureTable): MutableBackupRow {
  const row = candidate.tables[table][0];
  if (row === undefined) throw new Error(`missing ${table} test fixture row`);
  return row;
}

function snapshot(tables: Partial<LogicalBackupSnapshot["tables"]>): LogicalBackupSnapshot {
  const empty = Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, []]));
  return {
    version: 1, snapshotId: "restore-preflight-adapter", createdAtMs: 1, schemaVersion: 16,
    manifest: { catalogReferenceCount: 0, rowCounts: Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, 0])), totalRows: 0 },
    tables: { ...empty, ...tables }, catalogReferences: [],
  } as LogicalBackupSnapshot;
}

function readKernel(rows: readonly Record<string, unknown>[], statements: string[], values: unknown[][] = []): SqliteKernel {
  return {
    queryAll: async <Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      statements.push(sql);
      values.push(params);
      return rows as readonly Row[];
    },
    write: jest.fn(), connectionConfiguration: jest.fn(), close: jest.fn(),
  } as unknown as SqliteKernel;
}

const metric = { metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 };

function recommendationEvidence(targetColumn: string, targetId: string) {
  return {
    version: 2,
    rule: { id: "load_reps.double_progression.v1", version: 1 },
    metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
    source: { sessionId: "session", sessionExerciseId: "session-exercise", sessionRevision: 4, setIds: ["set"] },
    revisions: { source: 4, target: 2 },
    targetScope: [{ id: targetId, revision: 2 }],
    currentTarget: { load: 50 },
    proposedTarget: { load: 55 },
    decision: "increase", reasonCode: "complete", reason: "threshold met", confidence: "high",
    lifecycle: { createdAtMs: 9, state: "pending" },
    targetColumn,
  };
}

function completeRecommendation(kind: "owned" | "legacy" = "owned") {
  const targetColumn = kind === "owned" ? "owned_plan_working_set_target_id" : "plan_working_set_target_id";
  const targetTable = kind === "owned" ? "owned_plan_working_set_targets" : "plan_working_set_targets";
  const occurrenceTable = kind === "owned" ? "owned_plan_day_exercises" : "plan_day_exercises";
  const recommendationTable = kind === "owned" ? "owned_progression_recommendations" : "progression_recommendations";
  const targetId = `${kind}-target`;
  const evidence = recommendationEvidence(targetColumn, targetId);
  return snapshot({
    workout_sessions: [{ id: "session", revision: 4 }],
    session_exercises: [{ id: "session-exercise", session_id: "session", exercise_id: "exercise", ...metric }],
    session_sets: [{ id: "set", session_exercise_id: "session-exercise", set_kind: "working", source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: null, ...metric }],
    [targetTable]: [{ id: targetId, plan_day_exercise_id: `${kind}-occurrence`, ...metric }],
    [occurrenceTable]: [{ id: `${kind}-occurrence`, exercise_id: "exercise" }],
    [recommendationTable]: [{
      id: "recommendation", exercise_id: "exercise", [targetColumn]: targetId, status: "pending", evidence_version: 2,
      evidence_json: JSON.stringify(evidence), current_target_json: JSON.stringify(evidence.currentTarget), proposed_target_json: JSON.stringify(evidence.proposedTarget),
      rule_version: 1, rule_type: "load_reps", source_revision: 4, target_revision: 2, created_at_ms: 9, decided_at_ms: null, ...metric,
    }],
  });
}

function mutateOwnedRecommendation(
  mutate: (recommendation: Record<string, unknown>, evidence: Record<string, unknown>) => void,
): LogicalBackupSnapshot {
  const candidate = structuredClone(completeRecommendation()) as unknown as MutableSnapshot;
  const recommendation = firstRow(candidate, "owned_progression_recommendations");
  const evidence = JSON.parse(String(recommendation.evidence_json)) as Record<string, unknown>;
  mutate(recommendation, evidence);
  if (recommendation.evidence_json !== "invalid-json") recommendation.evidence_json = JSON.stringify(evidence);
  return candidate as unknown as LogicalBackupSnapshot;
}

function mutableOwnedCandidate(): MutableSnapshot {
  return structuredClone(completeRecommendation()) as unknown as MutableSnapshot;
}

describe("SQLite restore preflight adapters", () => {
  it("uses exact retained identities and correct ownership predicates for every supported retained table", async () => {
    const statements: string[] = [];
    const retained = createSqliteRestoreRetainedReferencePort(readKernel([{ present: 1 }], statements));

    await expect(retained.hasRetainedIdentity({ table: "exercises", columns: ["id"], values: ["exercise"] })).resolves.toBe(true);
    await expect(retained.hasRetainedIdentity({ table: "exercise_library_entries", columns: ["exercise_id"], values: ["exercise"] })).resolves.toBe(true);
    await expect(retained.hasRetainedIdentity({ table: "plans", columns: ["id"], values: ["plan"] })).resolves.toBe(true);
    await expect(retained.hasRetainedIdentity({ table: "content_packs", columns: ["id"], values: ["pack"] })).resolves.toBe(true);
    await expect(retained.hasRetainedIdentity({ table: "starter_plan_sources", columns: ["source_namespace", "template_id", "source_revision"], values: ["gym", "starter", 1] })).resolves.toBe(true);

    const sql = statements;
    expect(sql.slice(0, 3).every((statement) => statement.includes("origin = 'bundled'"))).toBe(true);
    expect(sql[3]).not.toContain("origin");
    expect(sql[4]).not.toContain("origin");
    expect(sql[4]).toContain('"source_namespace" = ? AND "template_id" = ? AND "source_revision" = ?');
  });

  it("returns false for missing retained identities and every unallowlisted table or column shape without querying", async () => {
    const statements: string[] = [];
    const retained = createSqliteRestoreRetainedReferencePort(readKernel([], statements));

    await expect(retained.hasRetainedIdentity({ table: "content_packs", columns: ["id"], values: ["missing"] })).resolves.toBe(false);
    expect(statements).toHaveLength(1);
    await expect(retained.hasRetainedIdentity({ table: "content_packs", columns: ["namespace"], values: ["gym"] })).resolves.toBe(false);
    await expect(retained.hasRetainedIdentity({ table: "starter_plan_sources", columns: ["template_id"], values: ["starter"] })).resolves.toBe(false);
    await expect(retained.hasRetainedIdentity({ table: "taxonomy_terms", columns: ["kind", "slug"], values: ["equipment", "bar"] })).resolves.toBe(false);
    expect(statements).toHaveLength(1);
  });

  it.each([
    ["dual legacy and owned target graph", snapshot({ session_sets: [{ id: "set", source_plan_working_set_target_id: "legacy", source_owned_plan_working_set_target_id: "owned" }] })],
    ["owned target metric identity mismatch", snapshot({
      session_sets: [{ id: "set", session_exercise_id: "session-exercise", source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: "owned-target", metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1 }],
      session_exercises: [{ id: "session-exercise", exercise_id: "exercise" }],
      owned_plan_working_set_targets: [{ id: "owned-target", plan_day_exercise_id: "owned-occurrence", metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 }],
      owned_plan_day_exercises: [{ id: "owned-occurrence", exercise_id: "exercise" }],
    })],
    ["pending recommendation with incomplete source evidence", snapshot({
      owned_progression_recommendations: [{ id: "recommendation", exercise_id: "exercise", owned_plan_working_set_target_id: "owned-target", status: "pending", evidence_version: 2, evidence_json: "{}", metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 }],
      owned_plan_working_set_targets: [{ id: "owned-target", plan_day_exercise_id: "owned-occurrence", metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 }],
      owned_plan_day_exercises: [{ id: "owned-occurrence", exercise_id: "exercise" }],
    })],
  ])("rejects %s before any restore writer can be reached", async (_label, candidate) => {
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("rejects a legacy target that belongs to another exercise while accepting its matching graph", async () => {
    const matching = snapshot({
      session_sets: [{ id: "set", session_exercise_id: "session-exercise", source_plan_working_set_target_id: "legacy-target", source_owned_plan_working_set_target_id: null, metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 }],
      session_exercises: [{ id: "session-exercise", exercise_id: "exercise" }],
      plan_working_set_targets: [{ id: "legacy-target", plan_day_exercise_id: "legacy-occurrence", metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 }],
      plan_day_exercises: [{ id: "legacy-occurrence", exercise_id: "exercise" }],
    });
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(matching)).resolves.toBeUndefined();

    const mismatched = snapshot({
      ...matching.tables,
      plan_day_exercises: [{ id: "legacy-occurrence", exercise_id: "other-exercise" }],
    });
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(mismatched)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("checks exact local catalog identities through read-only availability queries", async () => {
    const statements: string[] = [];
    const availability = createSqliteRestoreCatalogReferenceAvailabilityPort(readKernel([{ present: 1 }], statements));

    await expect(availability.availabilityFor({ kind: "exercise", sourceNamespace: "catalog", upstreamId: "exercise-id", sourceRevision: "3" })).resolves.toBe("available");
    await expect(availability.availabilityFor({ kind: "plan", sourceNamespace: "starter", upstreamId: "template-id", sourceRevision: "4" })).resolves.toBe("available");

    expect(statements[0]).toContain("exercise_catalog_sources");
    expect(statements[0]).toContain("COALESCE(upstream_id, linked_upstream_id) = ?");
    expect(statements[0]).toContain("source_revision = ?");
    expect(statements[1]).toContain("starter_plan_sources");
    expect(statements[1]).toContain("CAST(source_revision AS TEXT) = ?");
  });

  it("reports missing local catalog identities as unavailable", async () => {
    const statements: string[] = [];
    const availability = createSqliteRestoreCatalogReferenceAvailabilityPort(readKernel([], statements));
    await expect(availability.availabilityFor({ kind: "exercise", sourceNamespace: "catalog", upstreamId: "missing", sourceRevision: "3" })).resolves.toBe("unavailable");
    expect(statements).toHaveLength(1);
  });

  it("validates the real producer evidence shape while non-pending and pending evidence versions below 2 bypass v2 evidence validation", async () => {
    const probe = createSqliteRestoreCandidateProbe();
    await expect(probe.validateCandidate(completeRecommendation())).resolves.toBeUndefined();
    await expect(probe.validateCandidate(completeRecommendation("legacy"))).resolves.toBeUndefined();
    for (const [status, evidenceVersion] of [["accepted", 2], ["pending", 1]] as const) {
      const candidate = mutateOwnedRecommendation((recommendation) => {
        recommendation.status = status; recommendation.evidence_version = evidenceVersion; recommendation.evidence_json = "invalid-json";
      });
      await expect(probe.validateCandidate(candidate)).resolves.toBeUndefined();
    }
  });

  it("rejects pending evidence versions above 2 before a restore writer can be reached", async () => {
    const candidate = mutateOwnedRecommendation((recommendation) => {
      recommendation.evidence_version = 3;
      recommendation.evidence_json = "invalid-json";
    });

    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("rejects a non-numeric pending evidence version before a restore writer can be reached", async () => {
    const candidate = mutateOwnedRecommendation((recommendation) => {
      recommendation.evidence_version = "2";
    });

    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("rejects a valid JSON array instead of an evidence object", async () => {
    const candidate = mutableOwnedCandidate();
    firstRow(candidate, "owned_progression_recommendations").evidence_json = "[]";

    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate as unknown as LogicalBackupSnapshot)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it.each([
    ["malformed evidence JSON", (r: Record<string, unknown>) => { r.evidence_json = "invalid-json"; }],
    ["non-object evidence", (_r: Record<string, unknown>, e: Record<string, unknown>) => Object.assign(e, { rule: [] })],
    ["missing evidence version", (_r: Record<string, unknown>, e: Record<string, unknown>) => { delete e.version; }],
    ["wrong evidence version", (_r: Record<string, unknown>, e: Record<string, unknown>) => { e.version = 1; }],
    ["wrong rule id", (_r: Record<string, unknown>, e: Record<string, any>) => { e.rule.id = "other"; }],
    ["wrong rule version", (_r: Record<string, unknown>, e: Record<string, any>) => { e.rule.version = 3; }],
    ["wrong rule type", (r: Record<string, unknown>) => { r.rule_type = "timed_hold"; }],
    ["wrong metric identity", (_r: Record<string, unknown>, e: Record<string, any>) => { e.metricIdentity.profile = "timed_hold"; }],
    ["missing source session id", (_r: Record<string, unknown>, e: Record<string, any>) => { delete e.source.sessionId; }],
    ["missing source exercise id", (_r: Record<string, unknown>, e: Record<string, any>) => { delete e.source.sessionExerciseId; }],
    ["source revision mismatch", (_r: Record<string, unknown>, e: Record<string, any>) => { e.source.sessionRevision = 3; }],
    ["empty source sets", (_r: Record<string, unknown>, e: Record<string, any>) => { e.source.setIds = []; }],
    ["numeric source set id", (_r: Record<string, unknown>, e: Record<string, any>) => { e.source.setIds = [1]; }],
    ["blank source set id", (_r: Record<string, unknown>, e: Record<string, any>) => { e.source.setIds = ["    "]; }],
    ["source revision record mismatch", (_r: Record<string, unknown>, e: Record<string, any>) => { e.revisions.source = 3; }],
    ["target revision record mismatch", (_r: Record<string, unknown>, e: Record<string, any>) => { e.revisions.target = 3; }],
    ["missing target scope", (_r: Record<string, unknown>, e: Record<string, any>) => { e.targetScope = []; }],
    ["missing current target", (_r: Record<string, unknown>, e: Record<string, any>) => { e.currentTarget = []; }],
    ["missing proposed target", (_r: Record<string, unknown>, e: Record<string, any>) => { e.proposedTarget = null; }],
    ["non-string decision", (_r: Record<string, unknown>, e: Record<string, any>) => { e.decision = 1; }],
    ["non-string reason code", (_r: Record<string, unknown>, e: Record<string, any>) => { e.reasonCode = 1; }],
    ["non-string reason", (_r: Record<string, unknown>, e: Record<string, any>) => { e.reason = 1; }],
    ["non-string confidence", (_r: Record<string, unknown>, e: Record<string, any>) => { e.confidence = 1; }],
    ["blank decision", (_r: Record<string, unknown>, e: Record<string, any>) => { e.decision = "   "; }],
    ["blank reason code", (_r: Record<string, unknown>, e: Record<string, any>) => { e.reasonCode = "   "; }],
    ["blank reason", (_r: Record<string, unknown>, e: Record<string, any>) => { e.reason = "   "; }],
    ["blank confidence", (_r: Record<string, unknown>, e: Record<string, any>) => { e.confidence = "   "; }],
    ["lifecycle created mismatch", (_r: Record<string, unknown>, e: Record<string, any>) => { e.lifecycle.createdAtMs = 8; }],
    ["lifecycle state mismatch", (_r: Record<string, unknown>, e: Record<string, any>) => { e.lifecycle.state = "accepted"; }],
    ["already decided", (r: Record<string, unknown>) => { r.decided_at_ms = 10; }],
  ])("rejects pending recommendation with %s", async (_label, mutate) => {
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(mutateOwnedRecommendation(mutate))).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it.each([
    ["missing source session", (candidate: MutableSnapshot) => { candidate.tables.workout_sessions = []; }],
    ["wrong source exercise session", (candidate: MutableSnapshot) => { firstRow(candidate, "session_exercises").session_id = "other"; }],
    ["wrong source exercise", (candidate: MutableSnapshot) => { firstRow(candidate, "session_exercises").exercise_id = "other"; }],
    ["source exercise metric mismatch", (candidate: MutableSnapshot) => { firstRow(candidate, "session_exercises").metric_profile = "timed_hold"; }],
    ["missing source set", (candidate: MutableSnapshot) => { candidate.tables.session_sets = []; }],
    ["source set wrong exercise", (candidate: MutableSnapshot) => { firstRow(candidate, "session_sets").session_exercise_id = "other"; }],
    ["source set non-working", (candidate: MutableSnapshot) => { firstRow(candidate, "session_sets").set_kind = "warmup"; }],
    ["source set metric mismatch", (candidate: MutableSnapshot) => { firstRow(candidate, "session_sets").metric_profile = "timed_hold"; }],
    ["target scope non-object entry", (candidate: MutableSnapshot) => { const r = firstRow(candidate, "owned_progression_recommendations"); const e = JSON.parse(String(r.evidence_json)); e.targetScope[0] = "target"; r.evidence_json = JSON.stringify(e); }],
    ["target scope wrong id type", (candidate: MutableSnapshot) => { const r = firstRow(candidate, "owned_progression_recommendations"); const e = JSON.parse(String(r.evidence_json)); e.targetScope[0].id = 1; r.evidence_json = JSON.stringify(e); }],
    ["target scope wrong id", (candidate: MutableSnapshot) => { const r = firstRow(candidate, "owned_progression_recommendations"); const e = JSON.parse(String(r.evidence_json)); e.targetScope[0].id = "other"; r.evidence_json = JSON.stringify(e); }],
    ["target scope wrong revision type", (candidate: MutableSnapshot) => { const r = firstRow(candidate, "owned_progression_recommendations"); const e = JSON.parse(String(r.evidence_json)); e.targetScope[0].revision = "2"; r.evidence_json = JSON.stringify(e); }],
    ["target scope wrong revision", (candidate: MutableSnapshot) => { const r = firstRow(candidate, "owned_progression_recommendations"); const e = JSON.parse(String(r.evidence_json)); e.targetScope[0].revision = 3; r.evidence_json = JSON.stringify(e); }],
    ["invalid current target JSON", (candidate: MutableSnapshot) => { firstRow(candidate, "owned_progression_recommendations").current_target_json = "invalid-json"; }],
    ["current target mismatch", (candidate: MutableSnapshot) => { firstRow(candidate, "owned_progression_recommendations").current_target_json = JSON.stringify({ load: 1 }); }],
    ["invalid proposed target JSON", (candidate: MutableSnapshot) => { firstRow(candidate, "owned_progression_recommendations").proposed_target_json = "invalid-json"; }],
    ["proposed target mismatch", (candidate: MutableSnapshot) => { firstRow(candidate, "owned_progression_recommendations").proposed_target_json = JSON.stringify({ load: 1 }); }],
  ])("rejects valid-looking evidence with %s", async (_label, mutate) => {
    const candidate = mutableOwnedCandidate(); mutate(candidate);
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate as unknown as LogicalBackupSnapshot)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("rejects a legacy recommendation whose occurrence belongs to another exercise", async () => {
    const candidate = structuredClone(completeRecommendation("legacy")) as unknown as MutableSnapshot;
    firstRow(candidate, "plan_day_exercises").exercise_id = "other";
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate as unknown as LogicalBackupSnapshot)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it.each([
    ["missing target", (candidate: MutableSnapshot) => { candidate.tables.plan_working_set_targets = []; }],
    ["missing occurrence", (candidate: MutableSnapshot) => { candidate.tables.plan_day_exercises = []; }],
  ])("rejects a legacy recommendation with %s", async (_label, mutate) => {
    const candidate = structuredClone(completeRecommendation("legacy")) as unknown as MutableSnapshot;
    mutate(candidate);
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate as unknown as LogicalBackupSnapshot)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it.each([
    ["owned", (candidate: MutableSnapshot) => { candidate.tables.owned_plan_working_set_targets = []; }],
    ["legacy", (candidate: MutableSnapshot) => { firstRow(candidate, "owned_progression_recommendations").evidence_json = "invalid-json"; }],
  ])("rejects %s recommendation graph or evidence failures after the graph preflight", async (kind, mutate) => {
    const candidate = structuredClone(completeRecommendation(kind as "owned" | "legacy")) as unknown as MutableSnapshot;
    if (kind === "legacy") {
      firstRow(candidate, "progression_recommendations").evidence_json = "invalid-json";
    } else {
      mutate(candidate);
    }
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate as unknown as LogicalBackupSnapshot)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("rejects an owned session-set target whose occurrence is missing", async () => {
    const candidate = snapshot({
      session_sets: [{ id: "set", session_exercise_id: "session-exercise", source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: "owned-target", ...metric }],
      session_exercises: [{ id: "session-exercise", exercise_id: "exercise" }],
      owned_plan_working_set_targets: [{ id: "owned-target", plan_day_exercise_id: "missing-occurrence", ...metric }],
    });
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("accepts an owned session-set target with a matching occurrence and metric identity", async () => {
    const candidate = snapshot({
      session_sets: [{ id: "set", session_exercise_id: "session-exercise", source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: "owned-target", ...metric }],
      session_exercises: [{ id: "session-exercise", exercise_id: "exercise" }],
      owned_plan_working_set_targets: [{ id: "owned-target", plan_day_exercise_id: "owned-occurrence", ...metric }],
      owned_plan_day_exercises: [{ id: "owned-occurrence", exercise_id: "exercise" }],
    });
    await expect(createSqliteRestoreCandidateProbe().validateCandidate(candidate)).resolves.toBeUndefined();
  });

  it("checks schema allowlist, canonical SQLite types, and nullability", async () => {
    const statements: string[] = [];
    const schema = createSqliteRestoreSchemaPort(readKernel([{ name: "id", type: "integer", notnull: 1 }, { name: "note", type: "TEXT", notnull: 0 }], statements));
    await expect(schema.columnsFor("exercises")).resolves.toEqual([{ name: "id", sqliteType: "INTEGER", notNull: true }, { name: "note", sqliteType: "TEXT", notNull: false }]);
    expect(statements[0]).toBe('PRAGMA table_info("exercises")');
    await expect(schema.columnsFor("not_a_backup_table" as never)).rejects.toBeInstanceOf(RestoreCandidateProbeError);
    const badSchema = createSqliteRestoreSchemaPort(readKernel([{ name: "amount", type: "REAL", notnull: 1 }], []));
    await expect(badSchema.columnsFor("exercises")).rejects.toBeInstanceOf(RestoreCandidateProbeError);
  });

  it("rejects retained identities with bad values or arity before querying and supports the full exercise identity", async () => {
    const statements: string[] = [];
    const retained = createSqliteRestoreRetainedReferencePort(readKernel([{ present: 1 }, { present: 1 }], statements));
    await expect(retained.hasRetainedIdentity({ table: "exercises", columns: ["id", "metric_profile", "metric_contract_version", "exercise_metric_generation"], values: ["exercise", "load_reps", 1, 1] })).resolves.toBe(false);
    await expect(retained.hasRetainedIdentity({ table: "plans", columns: ["id"], values: [] })).resolves.toBe(false);
    await expect(retained.hasRetainedIdentity({ table: "plans", columns: ["id"], values: [null as never] })).resolves.toBe(false);
    expect(statements).toHaveLength(1);
  });

});
