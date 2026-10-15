import { describe, expect, it } from "@jest/globals";

import {
  PHASE20_QUALITY_DATABASE_PREFIX,
  collectPhase20QualityMarkers,
  resolvePhase20QualityRequest,
  validateDistinctRootReadiness,
  type Phase20QualityMarker,
} from "./phase20QualityProtocol";

const nonce = "a".repeat(48);
const digest = (value: string) => ({
  start: "a",
  commit: "b",
  ready: "c",
  sqlite: "d",
  second: "e",
  shared: "f",
  workout: "1",
  calendar: "2",
  library: "3",
  progress: "4",
}[value] ?? "9").repeat(64);

function marker(
  kind: Phase20QualityMarker["kind"],
  overrides: Partial<Phase20QualityMarker> = {},
): Phase20QualityMarker {
  return {
    schema_version: 1,
    nonce,
    action: "performance",
    operation: "committed-set-visible-dock",
    sequence: 1,
    kind,
    source: "phase20-quality-workload/v1",
    monotonic_ms: kind === "start" ? 10 : kind === "commit" ? 11 : 12,
    receipt_sha256: digest(kind),
    database_name: `${PHASE20_QUALITY_DATABASE_PREFIX}${nonce}.db`,
    sqlite_receipt_sha256: digest("sqlite"),
    ...(kind === "ready" ? { readiness_sha256: digest("ready") } : {}),
    ...overrides,
  } as Phase20QualityMarker;
}

describe("Phase 20 quality workload protocol", () => {
  it("accepts only an exact nonce-bound action, operation, and sequence", () => {
    expect(resolvePhase20QualityRequest({
      nonce,
      action: "performance",
      operation: "committed-set-visible-dock",
      sequence: "1",
    })).toEqual({
      nonce,
      action: "performance",
      operation: "committed-set-visible-dock",
      sequence: 1,
    });
    expect(resolvePhase20QualityRequest({ nonce, action: "performance", operation: "idle-loop", sequence: "1" })).toBeNull();
    expect(resolvePhase20QualityRequest({ nonce, action: "accessibility", operation: "committed-set-visible-dock", sequence: "1" })).toBeNull();
    expect(resolvePhase20QualityRequest({ nonce, action: "performance", operation: "committed-set-visible-dock", sequence: "0" })).toBeNull();
  });

  it("requires nonce-bound start, authoritative commit, and readiness markers", () => {
    const result = collectPhase20QualityMarkers([
      marker("start"),
      marker("commit"),
      marker("ready"),
    ], {
      nonce,
      action: "performance",
      operation: "committed-set-visible-dock",
      sequence: 1,
    });
    expect(result.duration_ms).toBe(1);
    expect(result.readiness_sha256).toBe(digest("ready"));
    expect(() => collectPhase20QualityMarkers([
      marker("start"),
      marker("ready"),
    ], result.request)).toThrow("phase20_quality_commit_marker_missing");
  });

  it("rejects duplicate, wrong-operation, idle, static, and unreceipted markers", () => {
    const request = { nonce, action: "performance" as const, operation: "committed-set-visible-dock" as const, sequence: 1 };
    expect(() => collectPhase20QualityMarkers([
      marker("start"), marker("commit"), marker("ready"), marker("ready", { monotonic_ms: 13, receipt_sha256: digest("second") }),
    ], request)).toThrow("phase20_quality_marker_duplicate");
    expect(() => collectPhase20QualityMarkers([
      marker("start", { operation: "numeric-edit" }), marker("commit"), marker("ready"),
    ], request)).toThrow("phase20_quality_marker_identity_mismatch");
    expect(() => collectPhase20QualityMarkers([
      marker("start"), marker("commit", { monotonic_ms: 10 }), marker("ready"),
    ], request)).toThrow("phase20_quality_marker_clock_invalid");
    const { sqlite_receipt_sha256: _receipt, ...withoutSqliteReceipt } = marker("commit");
    expect(() => collectPhase20QualityMarkers([
      marker("start"), withoutSqliteReceipt as Phase20QualityMarker, marker("ready"),
    ], request)).toThrow("phase20_quality_sqlite_receipt_missing");
  });

  it("rejects a shared readiness hash across distinct production roots", () => {
    const shared = digest("shared");
    expect(() => validateDistinctRootReadiness({
      workout: shared,
      calendar: shared,
      library: digest("library"),
      progress: digest("progress"),
    })).toThrow("phase20_quality_root_readiness_not_distinct");
    expect(validateDistinctRootReadiness({
      workout: digest("workout"),
      calendar: digest("calendar"),
      library: digest("library"),
      progress: digest("progress"),
    })).toBe(true);
  });
});
