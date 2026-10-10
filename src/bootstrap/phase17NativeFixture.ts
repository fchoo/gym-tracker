import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";

const TOKEN = /^phase17:[a-z0-9-]{16,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export type Phase17Fixture = Readonly<{
  caseId: string;
  fixtureToken: string;
  baselineDigest: string;
  sourceTable: string;
  expectedState: string;
  selectors: Readonly<Record<string, string>>;
}>;

export type Phase17SourceProbe = Readonly<{
  caseId: string;
  fixtureToken: string;
  sourceTable: string;
  expectedState: string;
  rowCount: number;
  identityHash: string;
  verdict: "matched";
}>;

export type Phase17FixtureAdapter = Readonly<{
  baselineDigest(): Promise<string>;
  seed(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string }>): Promise<Readonly<Record<string, string>>>;
  probe(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string; expectedState: string; selectors: Readonly<Record<string, string>> }>): Promise<Readonly<{ rowCount: number; identityHash: string; matchesExpectedState: boolean }>>;
  cleanup(input: Readonly<{ caseId: string; fixtureToken: string; selectors: Readonly<Record<string, string>> }>): Promise<void>;
}>;

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
 * Dev-test-only coordinator. The adapter owns production command/repository calls;
 * this layer only permits opaque identifiers and aggregate proof to leave the app.
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
      const selectors = await input.adapter.seed({ caseId, fixtureToken, sourceTable: contract.sourceProbe });
      if (Object.values(selectors).some((value) => typeof value !== "string" || value.length === 0)) {
        throw new Error("phase17_fixture_selector_invalid");
      }
      active = Object.freeze({ caseId, fixtureToken, baselineDigest, sourceTable: contract.sourceProbe, expectedState: contract.uiReadback, selectors: Object.freeze({ ...selectors }) });
      return active;
    },
    async probe(inputValue: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string; expectedState: string }>): Promise<Phase17SourceProbe> {
      if (active === null) throw new Error("phase17_fixture_missing");
      requireFixture(active, inputValue.caseId, inputValue.fixtureToken);
      if (active.sourceTable !== inputValue.sourceTable) throw new Error("phase17_fixture_table_mismatch");
      if (active.expectedState !== inputValue.expectedState) throw new Error("phase17_fixture_expected_state_mismatch");
      const proof = await input.adapter.probe({ ...inputValue, selectors: active.selectors });
      if (!proof.matchesExpectedState || !Number.isSafeInteger(proof.rowCount) || proof.rowCount < 0 || !HASH.test(proof.identityHash)) {
        throw new Error("phase17_fixture_probe_failed");
      }
      return Object.freeze({ ...inputValue, rowCount: proof.rowCount, identityHash: proof.identityHash, verdict: "matched" });
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
