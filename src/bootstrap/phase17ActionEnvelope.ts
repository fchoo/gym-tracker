import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";

const TOKEN = /^phase17:[a-z0-9-]{16,128}$/u;
const REQUEST_ID = /^phase17:[a-z0-9.-]{1,160}:[a-z0-9-]{16,128}:action(?::[a-z0-9-]+)?$/u;

export type Phase17ActionEnvelope = Readonly<{
  label: string;
  requestId: string;
}>;

export type Phase17ActionEnvelopeClaim = Readonly<{
  claimToken: string;
  caseId: string;
  fixtureToken: string;
  index: number;
  label: string;
  requestId: string;
}>;

export type Phase17ActionEnvelopeContext = Readonly<{
  version: 2;
  caseId: string;
  fixtureToken: string;
  envelopes: readonly Phase17ActionEnvelope[];
  claims: readonly Phase17ActionEnvelopeClaim[];
  nextEnvelope: number;
}>;

export type Phase17NativeContractIdentity = Readonly<{
  packageName: string | undefined;
  buildProfile: string | undefined;
  nativeContractsEnabled: boolean | undefined;
  suite: string | undefined;
}>;

export type Phase17ActionEnvelopeStore = Readonly<{
  read(): Promise<Phase17ActionEnvelopeContext | null>;
  write(context: Phase17ActionEnvelopeContext): Promise<void>;
  clear(): Promise<void>;
}>;

/** Fixture setup is deliberately distinct from product-action envelopes. */
export function createPhase17FixtureSetupIdentityFactory(input: Readonly<{
  identity(): Phase17NativeContractIdentity;
}>) {
  let activeToken: string | null = null;
  const requireActive = () => {
    if (!phase17ActionEnvelopeSourceEnabled(input.identity())) throw new Error("phase17_fixture_setup_unavailable");
    if (activeToken === null) throw new Error("phase17_fixture_setup_inactive");
    return activeToken;
  };
  const suffix = () => requireActive().slice("phase17:".length);
  return Object.freeze({
    begin(fixtureToken: string): void {
      if (!phase17ActionEnvelopeSourceEnabled(input.identity()) || !TOKEN.test(fixtureToken)) throw new Error("phase17_fixture_setup_unavailable");
      if (activeToken !== null) throw new Error("phase17_fixture_setup_active");
      activeToken = fixtureToken;
    },
    end(fixtureToken: string): void {
      if (activeToken !== fixtureToken) throw new Error("phase17_fixture_setup_token_mismatch");
      activeToken = null;
    },
    customExerciseId(): string { return `phase17:custom:${suffix()}`; },
    requestId(kind: string): string {
      if (!/^[a-z0-9-]+$/u.test(kind)) throw new Error("phase17_fixture_setup_kind_invalid");
      return `phase17:fixture:${kind}:${suffix()}:setup`;
    },
    ownedPlanId(): string { return `phase17:owned-plan:${suffix()}`; },
    ownedPlanDayId(): string { return `phase17:owned-plan-day:${suffix()}`; },
  });
}

export function phase17ActionEnvelopeSourceEnabled(
  identity: Phase17NativeContractIdentity,
): boolean {
  return identity.packageName === "com.fchoo.gymtracker.devtest"
    && identity.buildProfile === "development-test"
    && identity.nativeContractsEnabled === true
    && identity.suite === "phase17";
}

export function phase17ActionLabel(caseId: string): string {
  const labels: Readonly<Record<string, string>> = {
    "library.exercise-favorites": "exercise-favorite",
    "library.true-no-plans": "owned-plan-create",
    "library.owned-lifecycle": "owned-plan-lifecycle",
    "library.starter-activation": "starter-plan-activation",
    "library.create-strength": "owned-plan-save",
    "library.plan-editor": "owned-plan-save",
    "library.schedule-editor": "schedule-save",
    "library.replacement-impact": "plan-impact-replace",
    "library.day-removal-impact": "plan-impact-remove",
    "library.custom-exercise": "custom-exercise-archive",
    "library.create-exercise": "custom-exercise-create",
    "library.copy-metric-migration": "custom-exercise-metric-migration",
    "library.load-error-recovery": "library-load-retry",
    "library.running-create-zero-sessions": "running-plan-create",
    "library.running-goal-edit": "running-plan-save",
    "library.running-session-common": "running-session-save",
    "library.running-recovery": "running-session-save",
    "library.running-long": "running-session-save",
    "library.running-progression": "running-session-save",
    "library.running-tempo": "running-session-save",
    "library.running-intervals": "running-session-save",
    "library.running-hills": "running-session-save",
    "library.running-fartlek": "running-session-save",
    "library.running-session-lifecycle": "running-lifecycle",
    "library.running-conflict": "schedule-collision",
    "library.running-create-typed-sessions": "running-session-save",
    "library.running-two-same-day-slots": "running-plan-save",
  };
  const label = labels[caseId];
  if (label === undefined) throw new Error("phase17_action_label_unimplemented");
  return label;
}

function validContext(
  contracts: readonly Phase17CaseActionContract[],
  context: Phase17ActionEnvelopeContext,
): boolean {
  if (context.version !== 2 || !TOKEN.test(context.fixtureToken)
    || !contracts.some(({ id, proofMode }) => id === context.caseId && proofMode === "mutating")
    || !Number.isSafeInteger(context.nextEnvelope)
    || context.nextEnvelope < 0 || context.nextEnvelope > context.envelopes.length
    || context.envelopes.length === 0
    || context.claims.length !== context.nextEnvelope) return false;
  const requestIds = new Set<string>();
  const envelopesAreValid = context.envelopes.every(({ label, requestId }) => label === phase17ActionLabel(context.caseId)
    && label.length > 0 && !requestIds.has(requestId)
    && (requestIds.add(requestId), REQUEST_ID.test(requestId)));
  return envelopesAreValid && context.claims.every((claim, index) => {
    const envelope = context.envelopes[index];
    return envelope !== undefined
      && claim.claimToken === `${context.fixtureToken}:claim:${index}`
      && claim.caseId === context.caseId
      && claim.fixtureToken === context.fixtureToken
      && claim.index === index
      && claim.label === envelope.label
      && claim.requestId === envelope.requestId;
  });
}

/**
 * A narrow dev-test bridge between a fixture and the real UI callback that
 * creates a product command.  The factory deliberately returns no production
 * fallback while a valid context exists: an incorrect route or command must
 * fail the evidence run instead of committing an unrelated random receipt.
 */
export function createPhase17ActionEnvelopeSource(input: Readonly<{
  contracts: readonly Phase17CaseActionContract[];
  identity(): Phase17NativeContractIdentity;
  store: Phase17ActionEnvelopeStore;
}>) {
  let cached: Phase17ActionEnvelopeContext | null = null;
  let reservationQueue: Promise<void> = Promise.resolve();
  const enabled = () => phase17ActionEnvelopeSourceEnabled(input.identity());
  const requireEnabled = () => {
    if (!enabled()) throw new Error("phase17_action_envelope_unavailable");
  };
  const reserve = async (inputValue: Readonly<{ caseId: string; fixtureToken: string; label: string }>): Promise<string | null> => {
    if (!enabled()) return null;
    const active = await input.store.read();
    if (active === null) return null;
    if (!validContext(input.contracts, active)) throw new Error("phase17_action_envelope_invalid");
    if (active.caseId !== inputValue.caseId || active.fixtureToken !== inputValue.fixtureToken) throw new Error("phase17_action_envelope_token_mismatch");
    const expected = active.envelopes[active.nextEnvelope];
    if (expected === undefined || expected.label !== inputValue.label) throw new Error("phase17_action_envelope_label_mismatch");
    const index = active.nextEnvelope;
    const claim = Object.freeze({
      claimToken: `${active.fixtureToken}:claim:${index}`,
      caseId: active.caseId,
      fixtureToken: active.fixtureToken,
      index,
      label: expected.label,
      requestId: expected.requestId,
    });
    const next = Object.freeze({
      ...active,
      claims: Object.freeze([...active.claims, claim]),
      nextEnvelope: index + 1,
    });
    // Do not expose the request ID until the durable reservation commits. A
    // failed write leaves both the cached and persisted envelope retryable.
    await input.store.write(next);
    cached = next;
    return expected.requestId;
  };
  const enqueueReservation = (inputValue: Readonly<{ caseId: string; fixtureToken: string; label: string }>) => {
    const reservation = reservationQueue.then(() => reserve(inputValue));
    reservationQueue = reservation.then(() => undefined, () => undefined);
    return reservation;
  };
  return Object.freeze({
    async activate(context: Omit<Phase17ActionEnvelopeContext, "version" | "nextEnvelope" | "claims">): Promise<Phase17ActionEnvelopeContext> {
      requireEnabled();
      const active: Phase17ActionEnvelopeContext = Object.freeze({ ...context, version: 2, nextEnvelope: 0, claims: Object.freeze([]), envelopes: Object.freeze(context.envelopes.map((envelope) => Object.freeze({ ...envelope }))) });
      if (!validContext(input.contracts, active)) throw new Error("phase17_action_envelope_invalid");
      if (await input.store.read() !== null) throw new Error("phase17_action_envelope_active");
      await input.store.write(active);
      cached = active;
      return active;
    },
    async hydrate(): Promise<Phase17ActionEnvelopeContext | null> {
      if (!enabled()) { cached = null; return null; }
      const active = await input.store.read();
      if (active !== null && !validContext(input.contracts, active)) throw new Error("phase17_action_envelope_invalid");
      cached = active;
      return active;
    },
    async claim(inputValue: Readonly<{ caseId: string; fixtureToken: string; label: string }>): Promise<string | null> {
      return enqueueReservation(inputValue);
    },
    async reserveCached(label: string): Promise<string | null> {
      if (!enabled() || cached === null) return null;
      if (!validContext(input.contracts, cached)) throw new Error("phase17_action_envelope_invalid");
      return enqueueReservation({ caseId: cached.caseId, fixtureToken: cached.fixtureToken, label });
    },
    async assertConsumed(inputValue: Readonly<{ caseId: string; fixtureToken: string }>): Promise<void> {
      requireEnabled();
      const active = await input.store.read();
      if (active === null || !validContext(input.contracts, active)
        || active.caseId !== inputValue.caseId || active.fixtureToken !== inputValue.fixtureToken) {
        throw new Error("phase17_action_envelope_token_mismatch");
      }
      if (active.nextEnvelope !== active.envelopes.length) throw new Error("phase17_action_envelope_unconsumed");
    },
    async clear(): Promise<void> {
      cached = null;
      if (enabled()) await input.store.clear();
    },
  });
}
