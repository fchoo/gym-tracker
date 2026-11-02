import type { LogicalBackupSnapshot } from "../domains/portability/backupContracts";
import {
  collectLogicalBackupSnapshot,
} from "../platform/sqlite/repositories/logicalBackupRepository";
import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
} from "../platform/sqlite/sqliteKernel";

const FIXED_SNAPSHOT_METADATA = Object.freeze({
  snapshotId: "phase14-source-state-proof",
  createdAtMs: 0,
});

export type Phase14SourceStateProof = Readonly<{
  digest_sha256: string;
  table_count: number;
  row_count: number;
  schema_version: number;
}>;

type SnapshotCollector = (
  transaction: SqliteReadTransactionExecutor,
  input: Readonly<{ snapshotId: string; createdAtMs: number }>,
) => Promise<LogicalBackupSnapshot>;

function stableJson(value: unknown): string {
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
    || typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

export async function collectPhase14SourceStateProof(input: Readonly<{
  kernel: SqliteKernel;
  sha256(value: string): Promise<string>;
  collect?: SnapshotCollector;
}>): Promise<Phase14SourceStateProof> {
  if (input.kernel.readSnapshot === undefined) {
    throw new Error("phase14_source_state_snapshot_unavailable");
  }
  const collect = input.collect ?? collectLogicalBackupSnapshot;
  const snapshot = await input.kernel.readSnapshot((transaction) =>
    collect(transaction, FIXED_SNAPSHOT_METADATA));
  const digest = await input.sha256(stableJson(snapshot));
  const tableCount = Object.keys(snapshot.tables).length;
  const rowCount = snapshot.manifest.totalRows;
  if (
    !/^[a-f0-9]{64}$/u.test(digest)
    || !Number.isSafeInteger(tableCount)
    || tableCount < 1
    || !Number.isSafeInteger(rowCount)
    || rowCount < 0
    || !Number.isSafeInteger(snapshot.schemaVersion)
    || snapshot.schemaVersion < 1
  ) {
    throw new Error("phase14_source_state_proof_invalid");
  }
  return Object.freeze({
    digest_sha256: digest,
    table_count: tableCount,
    row_count: rowCount,
    schema_version: snapshot.schemaVersion,
  });
}
