import { AppState } from "react-native";

import type { RestCountdownSoundOwnership } from "../../domains/rest/restCountdownCuePort";

const NATURAL_EXPIRY_GRACE_MS = 3_000;
type OwnershipEntry = RestCountdownSoundOwnership & Readonly<{ token: symbol }>;
const owners = new Map<string, OwnershipEntry>();
let appStateListenerInstalled = false;

export function claimForegroundRestSound(
  input: RestCountdownSoundOwnership,
): Readonly<{ clear(): void; release(): void }> {
  const token = Symbol("foreground-rest-sound");
  const clear = () => {
    if (owners.get(input.sessionId)?.token === token) owners.delete(input.sessionId);
  };
  if (
    AppState.currentState !== "active"
    || input.sessionId.trim().length === 0
    || !Number.isSafeInteger(input.restRevision)
    || input.restRevision < 0
    || !Number.isSafeInteger(input.endsAtMs)
    || input.endsAtMs <= Date.now()
  ) return { clear, release: clear };

  if (!appStateListenerInstalled) {
    AppState.addEventListener("change", (state) => {
      if (state !== "active") owners.clear();
    });
    appStateListenerInstalled = true;
  }
  for (const [sessionId, owner] of owners) {
    if (Date.now() >= owner.endsAtMs + NATURAL_EXPIRY_GRACE_MS) owners.delete(sessionId);
  }
  owners.set(input.sessionId, { ...input, token });
  return {
    clear,
    release: () => {
      // Natural expiry removes the dock before a queued OS delivery may arrive.
      // Manual changes use clear(), so this grace cannot silence a new revision.
      if (Date.now() < input.endsAtMs || Date.now() >= input.endsAtMs + NATURAL_EXPIRY_GRACE_MS) clear();
    },
  };
}

export function ownsForegroundRestSound(input: RestCountdownSoundOwnership): boolean {
  if (AppState.currentState !== "active") {
    owners.clear();
    return false;
  }
  const owner = owners.get(input.sessionId);
  if (owner === undefined) return false;
  if (Date.now() >= owner.endsAtMs + NATURAL_EXPIRY_GRACE_MS) {
    owners.delete(input.sessionId);
    return false;
  }
  return owner.restRevision === input.restRevision && owner.endsAtMs === input.endsAtMs;
}
