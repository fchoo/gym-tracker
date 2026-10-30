import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/u;
const RESTORE_PARSER = "src/domains/portability/restoreCommands.ts#createRestoreCommands";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function fail(code) { throw new Error(`v12_rollback_${code}`); }

/** Shared unchanged proof validator. It cannot authenticate an archive or manufacture source facts. */
export function archiveInspection(value, archiveBytes, declaredSchemaVersion) {
  if (!exact(value, ["format_version", "schema_version", "clean_restore_receipt", "canonical_post_restore_facts"])
    || !Number.isSafeInteger(value.format_version) || !Number.isSafeInteger(value.schema_version)
    || value.schema_version !== declaredSchemaVersion) fail("schema_boundary_invalid");
  const facts = value.canonical_post_restore_facts;
  if (!exact(facts, ["schema_version", "producer", "archive_sha256", "source_schema_version", "table_count", "row_count",
    "source_facts_sha256", "reopened_facts_sha256", "integrity_check", "foreign_key_violations"])
    || facts.schema_version !== 1 || facts.producer !== "v12-canonical-post-restore-facts/v1"
    || facts.archive_sha256 !== sha256(archiveBytes) || facts.source_schema_version !== value.schema_version
    || !Number.isSafeInteger(facts.table_count) || facts.table_count < 1
    || !Number.isSafeInteger(facts.row_count) || facts.row_count < 0
    || ![facts.source_facts_sha256, facts.reopened_facts_sha256].every(hash => HASH.test(hash ?? ""))
    || facts.source_facts_sha256 !== facts.reopened_facts_sha256
    || facts.integrity_check !== "ok" || facts.foreign_key_violations !== 0) fail("restore_facts_invalid");
  const factsBytes = jsonBytes(facts);
  const receipt = value.clean_restore_receipt;
  if (!exact(receipt, ["schema_version", "producer", "parser", "outcome", "clean_target", "archive_sha256",
    "archive_format_version", "archive_schema_version", "post_restore_facts_sha256", "reopened_post_restore_facts_sha256"])
    || receipt.schema_version !== 1 || receipt.producer !== "v12-production-clean-restore-receipt/v1"
    || receipt.parser !== RESTORE_PARSER || receipt.outcome !== "restored" || receipt.clean_target !== true
    || receipt.archive_sha256 !== sha256(archiveBytes) || receipt.archive_format_version !== value.format_version
    || receipt.archive_schema_version !== value.schema_version
    || receipt.post_restore_facts_sha256 !== sha256(factsBytes)
    || receipt.reopened_post_restore_facts_sha256 !== sha256(factsBytes)) fail("restore_receipt_invalid");
  return Object.freeze({ formatVersion: value.format_version, schemaVersion: value.schema_version,
    receipt: Object.freeze(receipt), receiptBytes: jsonBytes(receipt), facts: Object.freeze(facts), factsBytes });
}
