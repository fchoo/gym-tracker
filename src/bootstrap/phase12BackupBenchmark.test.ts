import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  BACKUP_LIMITS,
  parseLogicalBackupSnapshot,
} from "../domains/portability/backupContracts";
import {
  PHASE12_BENCHMARK_RESULT_MARKER,
  PHASE12_BENCHMARK_START_MARKER,
  PHASE12_SQLITE_FIXTURE_ROW_COUNTS,
  buildPhase12SyntheticSnapshot,
  phase12BenchmarkStartupAction,
} from "./phase12BackupBenchmark";

describe("Phase 12 native backup benchmark", () => {
  it("fails closed outside the exact development-test Phase 12 benchmark route", () => {
    expect(phase12BenchmarkStartupAction({
      enabled: false,
      launchState: "trusted",
      started: false,
      suite: "phase12",
    })).toBe("disabled");
    expect(phase12BenchmarkStartupAction({
      enabled: true,
      launchState: "trusted",
      started: false,
      suite: "phase11",
    })).toBe("disabled");
    expect(phase12BenchmarkStartupAction({
      enabled: true,
      launchState: "booting",
      started: false,
      suite: "phase12",
    })).toBe("wait");
    expect(phase12BenchmarkStartupAction({
      enabled: true,
      launchState: "trusted",
      started: false,
      suite: "phase12",
    })).toBe("start");
    expect(PHASE12_BENCHMARK_START_MARKER).toContain("PHASE12");
    expect(PHASE12_BENCHMARK_RESULT_MARKER).toContain("PHASE12");
  });

  it("creates exactly the supported maximum synthetic merge fixture", () => {
    const snapshot = buildPhase12SyntheticSnapshot();
    expect(snapshot.manifest.totalRows).toBe(100_000);
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength)
      .toBe(24 * 1024 * 1024);
    expect(Math.max(...Object.values(snapshot.tables).map((rows) => rows.length)))
      .toBeLessThanOrEqual(BACKUP_LIMITS.maxRowsPerTable);
    expect(() => parseLogicalBackupSnapshot(snapshot)).not.toThrow();
  });

  it("keeps the native writer fixture inside every canonical row bound", () => {
    expect(Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)
      .reduce((total, count) => total + count, 0)).toBe(BACKUP_LIMITS.maxRowsTotal);
    expect(Math.max(...Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)))
      .toBeLessThanOrEqual(BACKUP_LIMITS.maxRowsPerTable);
  });
});
