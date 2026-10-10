import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";

const TOKEN = /^phase17:[a-z0-9-]{16,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export type Phase17Fact = null | boolean | number | string | readonly Phase17Fact[] | Readonly<{ readonly [key: string]: Phase17Fact }>;
export type Phase17Facts = Readonly<Record<string, Phase17Fact>>;

export type Phase17Fixture = Readonly<{
  caseId: string;
  fixtureToken: string;
  baselineDigest: string;
  sourceTable: string;
  expectedState: Phase17Facts;
  expectedStateHash: string;
  selectors: Readonly<Record<string, string>>;
}>;

export type Phase17SourceProbe = Readonly<{
  caseId: string;
  fixtureToken: string;
  sourceTable: string;
  rowCount: number;
  identityHash: string;
  expectedStateHash: string;
  verdict: "matched";
}>;

export type Phase17FixtureSeed = Readonly<{
  selectors: Readonly<Record<string, string>>;
  expectedState: Phase17Facts;
}>;

export type Phase17FixtureAdapter = Readonly<{
  baselineDigest(): Promise<string>;
  canonicalHash(value: Phase17Facts): Promise<string>;
  seed(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string }>): Promise<Phase17FixtureSeed>;
  probe(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string; selectors: Readonly<Record<string, string>> }>): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(input: Readonly<{ caseId: string; fixtureToken: string; selectors: Readonly<Record<string, string>> }>): Promise<void>;
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

function requireContract(contracts: readonly Phase17CaseActionContract[], caseId: string): Phase17CaseActionContract {
  const contract = contracts.find((entry) => entry.id === caseId);
  if (contract === undefined) throw new Error("phase17_fixture_case_invalid");
  return contract;
}

function requireFixture(fixture: Phase17Fixture, caseId: string, fixtureToken: string) {
  if (fixture.caseId !== caseId) throw new Error("phase17_fixture_case_mismatch");
  if (!TOKEN.test(fixtureToken) || fixture.fixtureToken !== fixtureToken) throw new Error("phase17_fixture_token_invalid");
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
  return Object.freeze({
    async setup(caseId: string): Promise<Phase17Fixture> {
      if (active !== null) throw new Error("phase17_fixture_active");
      const contract = requireContract(input.contracts, caseId);
      const fixtureToken = input.createToken();
      if (!TOKEN.test(fixtureToken)) throw new Error("phase17_fixture_token_invalid");
      const baselineDigest = await input.adapter.baselineDigest();
      if (!HASH.test(baselineDigest)) throw new Error("phase17_fixture_baseline_invalid");
      const seed = await input.adapter.seed({ caseId, fixtureToken, sourceTable: contract.sourceProbe });
      if (Object.values(seed.selectors).some((value) => typeof value !== "string" || value.length === 0) || !validFacts(seed.expectedState)) {
        throw new Error("phase17_fixture_manifest_invalid");
      }
      const expectedStateHash = await input.adapter.canonicalHash(seed.expectedState);
      if (!HASH.test(expectedStateHash)) throw new Error("phase17_fixture_expected_state_invalid");
      active = Object.freeze({ caseId, fixtureToken, baselineDigest, sourceTable: contract.sourceProbe, expectedState: Object.freeze({ ...seed.expectedState }), expectedStateHash, selectors: Object.freeze({ ...seed.selectors }) });
      return active;
    },
    async probe(inputValue: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string }>): Promise<Phase17SourceProbe> {
      if (active === null) throw new Error("phase17_fixture_missing");
      requireFixture(active, inputValue.caseId, inputValue.fixtureToken);
      if (active.sourceTable !== inputValue.sourceTable) throw new Error("phase17_fixture_table_mismatch");
      const proof = await input.adapter.probe({ ...inputValue, selectors: active.selectors });
      if (!Number.isSafeInteger(proof.rowCount) || proof.rowCount < 1 || !HASH.test(proof.identityHash) || !validFacts(proof.facts) || !sameFacts(proof.facts, active.expectedState)) {
        throw new Error("phase17_fixture_probe_failed");
      }
      return Object.freeze({ ...inputValue, rowCount: proof.rowCount, identityHash: proof.identityHash, expectedStateHash: active.expectedStateHash, verdict: "matched" });
    },
    async cleanup(inputValue: Readonly<{ caseId: string; fixtureToken: string }>) {
      if (active === null) throw new Error("phase17_fixture_missing");
      requireFixture(active, inputValue.caseId, inputValue.fixtureToken);
      const fixture = active;
      await input.adapter.cleanup({ ...inputValue, selectors: fixture.selectors });
      const digest = await input.adapter.baselineDigest();
      if (digest !== fixture.baselineDigest) throw new Error("phase17_fixture_cleanup_digest_mismatch");
      active = null;
      return Object.freeze({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, baselineDigest: digest, verdict: "restored" as const });
    },
  });
}
