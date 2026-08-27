import {
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  migrations,
} from "../../platform/sqlite/migrations";

import {
  PHASE2_CONTENT_CASE_IDS,
  PHASE2_CONTENT_CASE_METADATA,
} from "./phase2Content.contract";
import {
  PHASE2_METRICS_CASE_IDS,
  PHASE2_METRICS_CASE_METADATA,
} from "./phase2Metrics.contract";
import {
  PHASE2_PLAN_CASE_IDS,
  PHASE2_PLAN_CASE_METADATA,
} from "./phase2Plan.contract";
import {
  PHASE2_SCHEDULE_CASE_IDS,
  PHASE2_SCHEDULE_CASE_METADATA,
} from "./phase2Schedule.contract";
import {
  PHASE2_SEARCH_CASE_IDS,
  PHASE2_SEARCH_CASE_METADATA,
} from "./phase2Search.contract";
import {
  PHASE2_STARTER_CASE_IDS,
  PHASE2_STARTER_CASE_METADATA,
} from "./phase2Starter.contract";

const PHASE2_CASE_IDS = [
  ...PHASE2_CONTENT_CASE_IDS,
  ...PHASE2_SEARCH_CASE_IDS,
  ...PHASE2_METRICS_CASE_IDS,
  ...PHASE2_STARTER_CASE_IDS,
  ...PHASE2_PLAN_CASE_IDS,
  ...PHASE2_SCHEDULE_CASE_IDS,
] as const;

const PHASE2_CASE_METADATA = [
  ...PHASE2_CONTENT_CASE_METADATA,
  ...PHASE2_SEARCH_CASE_METADATA,
  ...PHASE2_METRICS_CASE_METADATA,
  ...PHASE2_STARTER_CASE_METADATA,
  ...PHASE2_PLAN_CASE_METADATA,
  ...PHASE2_SCHEDULE_CASE_METADATA,
] as const;

const PHASE2_PLAN_REMEDIATION_CASE_IDS = [
  "plan-latest-schema-add-warmup",
  "plan-latest-schema-copy-warmup",
  "plan-latest-schema-add-working-set",
  "plan-active-completed-set-revision",
  "plan-rest-alert-preference-persistence",
  "plan-notification-failure-non-authority",
  "plan-foreground-feedback-attempt-once",
] as const;

const CURRENT_MIGRATION_MANIFEST = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

const PHASE2_PLAN_REMEDIATION_METADATA = {
  "plan-latest-schema-add-warmup": {
    remediationCaseId: "RC-02-LATEST-SCHEMA-ADD-COPY",
    decisionIds: ["D-64"],
    gapIds: ["G-02-05"],
    applicableRequirementIds: ["LIB-12"],
  },
  "plan-latest-schema-copy-warmup": {
    remediationCaseId: "RC-02-LATEST-SCHEMA-ADD-COPY",
    decisionIds: ["D-64"],
    gapIds: ["G-02-05"],
    applicableRequirementIds: ["LIB-12"],
  },
  "plan-latest-schema-add-working-set": {
    remediationCaseId: "RC-02-LATEST-SCHEMA-ADD-COPY",
    decisionIds: ["D-64"],
    gapIds: ["G-02-05"],
    applicableRequirementIds: ["LIB-12"],
  },
  "plan-active-completed-set-revision": {
    remediationCaseId: "RC-02-ACTIVE-CORRECTION",
    decisionIds: ["D-63"],
    gapIds: ["G-02-08"],
    applicableRequirementIds: ["LIB-12"],
  },
  "plan-rest-alert-preference-persistence": {
    remediationCaseId: "RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH",
    decisionIds: ["D-61"],
    gapIds: ["G-02-07"],
    applicableRequirementIds: [],
  },
  "plan-notification-failure-non-authority": {
    remediationCaseId: "RC-02-ALERT-BG-DELIVERY-NONAUTH",
    decisionIds: ["D-61"],
    gapIds: ["G-02-07"],
    applicableRequirementIds: [],
  },
  "plan-foreground-feedback-attempt-once": {
    remediationCaseId: "RC-02-ALERT-FG-ATTEMPT-ONCE",
    decisionIds: ["D-61"],
    gapIds: ["G-02-07"],
    applicableRequirementIds: [],
  },
} as const;

describe("Phase 2 aggregate shared native contracts", () => {
  it("rejects duplicate source-owned case IDs and derives the aggregate count", () => {
    expect(PHASE2_CASE_IDS.length).toBe(PHASE2_CASE_METADATA.length);
    expect(new Set(PHASE2_CASE_IDS).size).toBe(PHASE2_CASE_IDS.length);
    expect(PHASE2_CASE_METADATA.map(({ id }) => id)).toEqual(
      PHASE2_CASE_IDS,
    );
  });

  it("registers every current-schema remediation case without a fixed total", () => {
    expect(PHASE2_PLAN_CASE_IDS).toEqual(
      expect.arrayContaining([...PHASE2_PLAN_REMEDIATION_CASE_IDS]),
    );
    expect(new Set(PHASE2_PLAN_CASE_IDS).size).toBe(
      PHASE2_PLAN_CASE_IDS.length,
    );
    for (const caseId of PHASE2_PLAN_REMEDIATION_CASE_IDS) {
      const metadata = PHASE2_PLAN_CASE_METADATA.find(({ id }) => id === caseId);
      expect(metadata).toEqual(expect.objectContaining({
        id: caseId,
        category: expect.stringMatching(/^remediation-/u),
        ...PHASE2_PLAN_REMEDIATION_METADATA[caseId],
      }));
      expect(metadata).not.toHaveProperty("requirement");
    }
  });

  it("runs native remediation contracts against the Phase 2 prefix and later additive migrations", () => {
    const versions = migrations.map(({ version }) => version);
    expect(versions.slice(0, CURRENT_MIGRATION_MANIFEST.length)).toEqual(
      CURRENT_MIGRATION_MANIFEST,
    );
    expect(versions.at(-1)).toBeGreaterThanOrEqual(
      CURRENT_MIGRATION_MANIFEST.at(-1)!,
    );
  });

  it("covers every E-01 through E-78 edge with complete source metadata", () => {
    const expectedEdges = Array.from(
      { length: 78 },
      (_, index) => `E-${String(index + 1).padStart(2, "0")}`,
    );
    const mappedEdges = [
      ...new Set(PHASE2_CASE_METADATA.flatMap(({ edgeIds }) => edgeIds)),
    ].sort();

    expect(mappedEdges).toEqual(expectedEdges);
    for (const metadata of PHASE2_CASE_METADATA) {
      const requirementIds = "applicableRequirementIds" in metadata
        ? metadata.applicableRequirementIds
        : [metadata.requirement];
      for (const requirementId of requirementIds) {
        expect(requirementId).toMatch(/^LIB-(?:0[2-9]|1[0-2])$/u);
      }
      expect(metadata.category).not.toHaveLength(0);
      expect(metadata.sourceTest).toMatch(/\.test\.tsx?#/u);
    }
  });

  it("registers every distinct suite plus aggregate phase2 with source-derived totals", () => {
    const repositoryRoot = join(__dirname, "../../..");
    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"),
      "utf8",
    );

    for (const suite of [
      "sqlite-kernel",
      "migrations-effects",
      "phase2-fts",
      "phase2-content",
      "phase2-search",
      "phase2-metrics",
      "phase2-starter",
      "phase2-plan",
      "phase2-schedule",
      "phase2",
    ]) {
      expect(route).toContain(`"${suite}"`);
      expect(runner).toContain(`'${suite}'`);
    }
    for (const exportName of [
      "PHASE2_CONTENT_CASE_IDS",
      "PHASE2_SEARCH_CASE_IDS",
      "PHASE2_METRICS_CASE_IDS",
      "PHASE2_STARTER_CASE_IDS",
      "PHASE2_PLAN_CASE_IDS",
      "PHASE2_SCHEDULE_CASE_IDS",
    ]) {
      expect(route).toContain(exportName);
      expect(runner).toContain(exportName);
    }
    expect(route).toContain("const PHASE2_CASE_IDS = [");
    expect(route).toContain("const PHASE2_AGGREGATE_CASE_IDS = [");
    expect(route).toContain("PHASE2_AGGREGATE_CASE_IDS.length");
    expect(runner).toContain("const PHASE2_CASE_IDS = [");
    expect(runner).toContain("const PHASE2_AGGREGATE_CASE_IDS = [");
    expect(runner).toContain("'phase2': PHASE2_AGGREGATE_CASE_IDS");
    expect(route).not.toMatch(/phase2"\s*:\s*\d+/u);
    expect(runner).not.toMatch(/'phase2'\s*:\s*\d+/u);
  });

  it("keeps aggregate results bounded to IDs, status, counts, and timing", () => {
    const repositoryRoot = join(__dirname, "../../..");
    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"),
      "utf8",
    );

    expect(route).toContain("failed: aggregate.failed");
    expect(route).toContain("skipped: 0");
    expect(runner).toContain("exactKeys");
    expect(runner).toContain("contractCase?.status === 'passed'");
    expect(route).not.toContain("rawSql");
    expect(route).not.toContain("rawPayload");
  });
});
