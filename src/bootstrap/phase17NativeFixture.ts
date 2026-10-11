import type { Phase17CaseActionContract, Phase17ProofMode } from "../testing/contracts/phase17LibraryRunning.contract";

const TOKEN = /^phase17:[a-z0-9-]{16,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export type Phase17Fact = null | boolean | number | string | readonly Phase17Fact[] | Readonly<{ readonly [key: string]: Phase17Fact }>;
export type Phase17Facts = Readonly<Record<string, Phase17Fact>>;
export type Phase17FixtureSelectors = Readonly<Record<string, string>>;
/** Deterministic product-command arguments that deliberately have no
 * pre-action source row. They are distinct from selectors so a fixture never
 * represents an invented value as authoritative SQLite readback. */
export type Phase17FixtureActionInputs = Readonly<Record<string, string>>;
export type Phase17FixtureSelectorSchema = Readonly<{
  selectors: readonly string[];
  actionInputs: readonly string[];
}>;

export type Phase17Fixture = Readonly<{
  caseId: string;
  proofMode: Phase17ProofMode;
  fixtureToken: string;
  baselineDigest: string;
  sourceTable: string;
  /** Facts read immediately after setup, before the Maestro interaction. */
  expectedPreState: Phase17Facts;
  /** Facts that the case's declared source probe must expose after the interaction. */
  expectedPostState: Phase17Facts;
  expectedPreStateHash: string;
  expectedPostStateHash: string;
  /** A deterministic product request/receipt identity; absent only for read-only journeys. */
  actionReceiptId: string | null;
  selectors: Phase17FixtureSelectors;
  actionInputs: Phase17FixtureActionInputs;
}>;

export type Phase17SourceProbe = Readonly<{
  caseId: string;
  fixtureToken: string;
  sourceTable: string;
  rowCount: number;
  identityHash: string;
  expectedPostStateHash: string;
  verdict: "matched";
}>;

export type Phase17FixtureSeed = Readonly<{
  selectors: Phase17FixtureSelectors;
  actionInputs?: Phase17FixtureActionInputs;
  expectedPreState: Phase17Facts;
  expectedPostState: Phase17Facts;
  actionReceiptId: string | null;
}>;

export type Phase17FixtureAdapter = Readonly<{
  baselineDigest(): Promise<string>;
  canonicalHash(value: Phase17Facts): Promise<string>;
  /** Required for production family adapters. Opaque test adapters may omit it,
   * in which case their seed is self-describing only inside the test harness. */
  selectorSchema?(input: Readonly<{ caseId: string; proofMode: Phase17ProofMode }>): Phase17FixtureSelectorSchema;
  seed(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string }>): Promise<Phase17FixtureSeed>;
  probe(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string; selectors: Phase17FixtureSelectors }>): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(input: Readonly<{ caseId: string; fixtureToken: string; selectors: Phase17FixtureSelectors }>): Promise<void>;
  /** Runs after the family has removed fixture-owned rows/projections, but before
   * the baseline digest is read. This keeps dev-test control state out of the
   * same snapshot it is required to restore. */
  finalizeCleanup?(input: Readonly<{ caseId: string; fixtureToken: string }>): Promise<void>;
}>;

function canonical(value: Phase17Fact): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validFacts(value: Phase17Fact): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(validFacts);
  if (typeof value !== "object") return false;
  const record = value as Readonly<Record<string, Phase17Fact>>;
  return Object.keys(record).every((key) => key.trim().length > 0 && validFacts(record[key]!));
}

function sameFacts(left: Phase17Facts, right: Phase17Facts): boolean {
  return canonical(left) === canonical(right);
}

function validFixtureValues(value: Readonly<Record<string, string>>): boolean {
  return Object.entries(value).every(([key, entry]) => key.trim().length > 0 && typeof entry === "string" && entry.length > 0);
}

function matchesSelectorSchema(
  schema: Phase17FixtureSelectorSchema,
  selectors: Phase17FixtureSelectors,
  actionInputs: Phase17FixtureActionInputs,
): boolean {
  const exactKeys = (actual: Readonly<Record<string, string>>, expected: readonly string[]) =>
    Object.keys(actual).sort().join(",") === [...expected].sort().join(",");
  return exactKeys(selectors, schema.selectors)
    && exactKeys(actionInputs, schema.actionInputs)
    && schema.selectors.every((key) => actionInputs[key] === undefined);
}

function requireContract(contracts: readonly Phase17CaseActionContract[], caseId: string): Phase17CaseActionContract {
  const contract = contracts.find((entry) => entry.id === caseId);
  if (contract === undefined) throw new Error("phase17_fixture_case_invalid");
  return contract;
}

function requireFixture(fixture: Phase17Fixture, caseId: string, fixtureToken: string) {
  if (fixture.caseId !== caseId) throw new Error("phase17_fixture_case_mismatch");
  if (!TOKEN.test(fixtureToken) || fixture.fixtureToken !== fixtureToken) throw new Error("phase17_fixture_token_invalid");
}

/** The only receipt identity accepted for a mutating ledger case.  Keeping it
 * deterministic lets the source probe reject an otherwise-valid mutation from
 * a prior retry or an unrelated fixture. */
export function phase17ActionReceiptId(caseId: string, fixtureToken: string): string {
  return `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
}

/**
 * Dev-test-only coordinator. Source setup and cleanup are behind a port so this
 * coordinator cannot manufacture route identifiers or observe raw SQLite rows.
 */
export function createPhase17FixtureProtocol(input: Readonly<{
  contracts: readonly Phase17CaseActionContract[];
  adapter: Phase17FixtureAdapter;
  createToken(): string;
}>) {
  let active: Phase17Fixture | null = null;
  let probeComplete = false;
  return Object.freeze({
    async setup(caseId: string): Promise<Phase17Fixture> {
      if (active !== null) throw new Error("phase17_fixture_active");
      const contract = requireContract(input.contracts, caseId);
      const fixtureToken = input.createToken();
      if (!TOKEN.test(fixtureToken)) throw new Error("phase17_fixture_token_invalid");
      const baselineDigest = await input.adapter.baselineDigest();
      if (!HASH.test(baselineDigest)) throw new Error("phase17_fixture_baseline_invalid");
      const seed = await input.adapter.seed({ caseId, fixtureToken, sourceTable: contract.sourceProbe });
      const actionInputs = seed.actionInputs ?? Object.freeze({});
      const schema = input.adapter.selectorSchema?.({ caseId, proofMode: contract.proofMode }) ?? Object.freeze({
        selectors: Object.freeze(Object.keys(seed.selectors)),
        actionInputs: Object.freeze(Object.keys(actionInputs)),
      });
      if (!validFixtureValues(seed.selectors) || !validFixtureValues(actionInputs) || !matchesSelectorSchema(schema, seed.selectors, actionInputs) || !validFacts(seed.expectedPreState) || !validFacts(seed.expectedPostState)) {
        throw new Error("phase17_fixture_manifest_invalid");
      }
      const expectedPreStateHash = await input.adapter.canonicalHash(seed.expectedPreState);
      const expectedPostStateHash = await input.adapter.canonicalHash(seed.expectedPostState);
      if (!HASH.test(expectedPreStateHash) || !HASH.test(expectedPostStateHash)) throw new Error("phase17_fixture_expected_state_invalid");
      if (contract.proofMode === "mutating") {
        if (seed.actionReceiptId !== phase17ActionReceiptId(caseId, fixtureToken) || expectedPreStateHash === expectedPostStateHash) {
          throw new Error("phase17_fixture_mutation_contract_invalid");
        }
      } else if (seed.actionReceiptId !== null) {
        throw new Error("phase17_fixture_read_only_receipt_invalid");
      }
      active = Object.freeze({ caseId, proofMode: contract.proofMode, fixtureToken, baselineDigest, sourceTable: contract.sourceProbe, expectedPreState: Object.freeze({ ...seed.expectedPreState }), expectedPostState: Object.freeze({ ...seed.expectedPostState }), expectedPreStateHash, expectedPostStateHash, actionReceiptId: seed.actionReceiptId, selectors: Object.freeze({ ...seed.selectors }), actionInputs: Object.freeze({ ...actionInputs }) });
      probeComplete = false;
      return active;
    },
    async probe(inputValue: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string }>): Promise<Phase17SourceProbe> {
      if (active === null) throw new Error("phase17_fixture_missing");
      requireFixture(active, inputValue.caseId, inputValue.fixtureToken);
      if (active.sourceTable !== inputValue.sourceTable) throw new Error("phase17_fixture_table_mismatch");
      const proof = await input.adapter.probe({ ...inputValue, selectors: active.selectors });
      if (!Number.isSafeInteger(proof.rowCount) || proof.rowCount < 1 || !HASH.test(proof.identityHash) || !validFacts(proof.facts) || !sameFacts(proof.facts, active.expectedPostState)) {
        throw new Error("phase17_fixture_probe_failed");
      }
      probeComplete = true;
      return Object.freeze({ ...inputValue, rowCount: proof.rowCount, identityHash: proof.identityHash, expectedPostStateHash: active.expectedPostStateHash, verdict: "matched" });
    },
    async cleanup(inputValue: Readonly<{ caseId: string; fixtureToken: string }>) {
      if (active === null) throw new Error("phase17_fixture_missing");
      requireFixture(active, inputValue.caseId, inputValue.fixtureToken);
      if (!probeComplete) throw new Error("phase17_fixture_probe_incomplete");
      const fixture = active;
      await input.adapter.cleanup({ ...inputValue, selectors: fixture.selectors });
      await input.adapter.finalizeCleanup?.(inputValue);
      const digest = await input.adapter.baselineDigest();
      if (digest !== fixture.baselineDigest) throw new Error("phase17_fixture_cleanup_digest_mismatch");
      active = null;
      probeComplete = false;
      return Object.freeze({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, baselineDigest: digest, verdict: "restored" as const });
    },
  });
}
