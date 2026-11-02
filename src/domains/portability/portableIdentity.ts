export const PORTABLE_ID_BYTES = 16 as const;
export const PORTABLE_ID_HEX_LENGTH = PORTABLE_ID_BYTES * 2;

const OPAQUE_PORTABLE_ID_PATTERN = /^[a-f0-9]{32}$/u;

export type PortableRecordClass =
  | "custom_exercise"
  | "owned_plan"
  | "workout_session";

export type PortableIdentity = Readonly<{
  ownerNamespace: string;
  recordClass: PortableRecordClass;
  portableId: string;
}>;

export class PortableIdentityError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-PORTABLE-ID01" as const;

  constructor(readonly code: "portable_identity_invalid") {
    super(code);
    this.name = "PortableIdentityError";
  }
}

function invalid(): never {
  throw new PortableIdentityError("portable_identity_invalid");
}

export function isOpaquePortableId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_PORTABLE_ID_PATTERN.test(value);
}

export function assertPortableIdentity(value: unknown): asserts value is string {
  if (!isOpaquePortableId(value)) invalid();
}

export function createOpaquePortableId(randomBytes: Uint8Array): string {
  if (!(randomBytes instanceof Uint8Array) || randomBytes.byteLength !== PORTABLE_ID_BYTES) {
    invalid();
  }
  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function portableIdentityKey(identity: PortableIdentity): string {
  assertPortableIdentity(identity.ownerNamespace);
  assertPortableIdentity(identity.portableId);
  if (identity.recordClass !== "custom_exercise"
    && identity.recordClass !== "owned_plan"
    && identity.recordClass !== "workout_session") {
    invalid();
  }
  return `${identity.ownerNamespace}:${identity.recordClass}:${identity.portableId}`;
}

export function comparePortableMergeFreshness(
  left: Readonly<{ mergeModifiedAtMs: number; portableId: string }>,
  right: Readonly<{ mergeModifiedAtMs: number; portableId: string }>,
): number {
  if (!Number.isSafeInteger(left.mergeModifiedAtMs) || left.mergeModifiedAtMs < 0
    || !Number.isSafeInteger(right.mergeModifiedAtMs) || right.mergeModifiedAtMs < 0) {
    invalid();
  }
  assertPortableIdentity(left.portableId);
  assertPortableIdentity(right.portableId);
  if (left.mergeModifiedAtMs !== right.mergeModifiedAtMs) {
    return left.mergeModifiedAtMs - right.mergeModifiedAtMs;
  }
  return left.portableId.localeCompare(right.portableId);
}
