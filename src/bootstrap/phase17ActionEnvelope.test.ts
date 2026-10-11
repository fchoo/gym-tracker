import { describe, expect, it } from "@jest/globals";

import {
  createPhase17ActionEnvelopeSource,
  createPhase17FixtureSetupIdentityFactory,
  phase17ActionEnvelopeSourceEnabled,
} from "./phase17ActionEnvelope";

const contracts = [{ id: "library.running-recovery", proofMode: "mutating" as const }] as any;
const token = "phase17:1234567890abcdef";
const requestId = `phase17:library.running-recovery:${token.slice("phase17:".length)}:action`;

function fixture(identity = { packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }) {
  let saved: any = null;
  return {
    source: createPhase17ActionEnvelopeSource({
      contracts,
      identity: () => identity,
      store: { read: async () => saved, write: async (value) => { saved = value; }, clear: async () => { saved = null; } },
    }),
    saved: () => saved,
  };
}

describe("Phase 17 action envelope source", () => {
  it("creates setup-only identities only during a token-scoped dev-test setup", () => {
    const setup = createPhase17FixtureSetupIdentityFactory({ identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }) });
    expect(() => setup.requestId("custom-exercise-create")).toThrow("phase17_fixture_setup_inactive");
    setup.begin(token);
    expect(setup.customExerciseId()).toBe(`phase17:custom:${token.slice("phase17:".length)}`);
    expect(setup.requestId("custom-exercise-create")).toBe(`phase17:fixture:custom-exercise-create:${token.slice("phase17:".length)}:setup`);
    setup.end(token);
    expect(() => setup.ownedPlanId()).toThrow("phase17_fixture_setup_inactive");
  });

  it("does not expose setup identities to production", () => {
    const setup = createPhase17FixtureSetupIdentityFactory({ identity: () => ({ packageName: "com.fchoo.gymtracker", buildProfile: "production", nativeContractsEnabled: false, suite: undefined }) });
    expect(() => setup.begin(token)).toThrow("phase17_fixture_setup_unavailable");
  });

  it("gates the persisted source on the exact native contract identity", () => {
    expect(phase17ActionEnvelopeSourceEnabled({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" })).toBe(true);
    expect(phase17ActionEnvelopeSourceEnabled({ packageName: "com.fchoo.gymtracker", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" })).toBe(false);
    expect(phase17ActionEnvelopeSourceEnabled({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "production", nativeContractsEnabled: true, suite: "phase17" })).toBe(false);
    expect(phase17ActionEnvelopeSourceEnabled({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase14" })).toBe(false);
  });

  it("reloads a token-bound envelope once and rejects wrong labels, tokens, and duplicate claims", async () => {
    const { source, saved } = fixture();
    await source.activate({ caseId: "library.running-recovery", fixtureToken: token, envelopes: [{ label: "running-session-save", requestId }] });
    expect(saved()).toMatchObject({ nextEnvelope: 0 });
    await expect(source.claim({ caseId: "library.running-recovery", fixtureToken: token, label: "running-lifecycle" })).rejects.toThrow("phase17_action_envelope_label_mismatch");
    await expect(source.claim({ caseId: "library.running-recovery", fixtureToken: "phase17:fedcba0987654321", label: "running-session-save" })).rejects.toThrow("phase17_action_envelope_token_mismatch");
    await expect(source.claim({ caseId: "library.running-recovery", fixtureToken: token, label: "running-session-save" })).resolves.toBe(requestId);
    await expect(source.claim({ caseId: "library.running-recovery", fixtureToken: token, label: "running-session-save" })).rejects.toThrow("phase17_action_envelope_label_mismatch");
    await expect(source.assertConsumed({ caseId: "library.running-recovery", fixtureToken: token })).resolves.toBeUndefined();
  });

  it("hydrates the persisted context after a process restart before a real UI callback claims it", async () => {
    let saved: any = null;
    const identity = () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" });
    const store = { read: async () => saved, write: async (value: any) => { saved = value; }, clear: async () => { saved = null; } };
    const first = createPhase17ActionEnvelopeSource({ contracts, identity, store });
    await first.activate({ caseId: "library.running-recovery", fixtureToken: token, envelopes: [{ label: "running-session-save", requestId }] });
    const restarted = createPhase17ActionEnvelopeSource({ contracts, identity, store });
    await expect(restarted.hydrate()).resolves.toMatchObject({ fixtureToken: token, nextEnvelope: 0 });
    expect(restarted.claimCached("running-session-save")).toBe(requestId);
  });

  it("fails cleanup when an expected envelope was not used, then clears the stale context", async () => {
    const { source, saved } = fixture();
    await source.activate({ caseId: "library.running-recovery", fixtureToken: token, envelopes: [{ label: "running-session-save", requestId }] });
    await expect(source.assertConsumed({ caseId: "library.running-recovery", fixtureToken: token })).rejects.toThrow("phase17_action_envelope_unconsumed");
    await source.clear();
    expect(saved()).toBeNull();
  });

  it("uses the unchanged production path when no exact dev-test contract is active", async () => {
    const { source } = fixture({ packageName: "com.fchoo.gymtracker", buildProfile: "production", nativeContractsEnabled: false, suite: undefined as unknown as string });
    await expect(source.claim({ caseId: "library.running-recovery", fixtureToken: token, label: "running-session-save" })).resolves.toBeNull();
    await expect(source.activate({ caseId: "library.running-recovery", fixtureToken: token, envelopes: [{ label: "running-session-save", requestId }] })).rejects.toThrow("phase17_action_envelope_unavailable");
  });
});
