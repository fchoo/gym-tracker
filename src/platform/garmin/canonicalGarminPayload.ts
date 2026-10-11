export type GarminPayloadSha256 = (canonicalPayload: string) => string | Promise<string>;

export const GARMIN_CANONICAL_LIMITS = Object.freeze({
  maxDepth: 16,
  maxNodes: 50_000,
  maxObjectKeys: 128,
  maxTotalKeys: 10_000,
  maxArrayLength: 4_000,
  maxStringCodeUnits: 16_384,
  maxKeyCodeUnits: 128,
  maxCanonicalBytes: 2_000_000,
});

export class GarminCanonicalPayloadError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;

  constructor(readonly code: "garmin_json_invalid" | "garmin_json_limit" | "garmin_digest_invalid") {
    super(code);
    this.name = "GarminCanonicalPayloadError";
  }
}

function fail(code: GarminCanonicalPayloadError["code"]): never {
  throw new GarminCanonicalPayloadError(code);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function canonicalizeGarminPayload(value: unknown): string {
  const chunks: string[] = [];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let keys = 0;
  let bytes = 0;

  function write(chunk: string): void {
    bytes += utf8ByteLength(chunk);
    if (bytes > GARMIN_CANONICAL_LIMITS.maxCanonicalBytes) fail("garmin_json_limit");
    chunks.push(chunk);
  }

  function visit(child: unknown, depth: number): void {
    nodes += 1;
    if (depth > GARMIN_CANONICAL_LIMITS.maxDepth || nodes > GARMIN_CANONICAL_LIMITS.maxNodes) {
      fail("garmin_json_limit");
    }
    if (child === null) {
      write("null");
      return;
    }
    if (typeof child === "boolean") {
      write(child ? "true" : "false");
      return;
    }
    if (typeof child === "number") {
      if (!Number.isFinite(child) || Math.abs(child) > Number.MAX_SAFE_INTEGER) fail("garmin_json_invalid");
      write(String(child));
      return;
    }
    if (typeof child === "string") {
      if (child.length > GARMIN_CANONICAL_LIMITS.maxStringCodeUnits) fail("garmin_json_limit");
      write(JSON.stringify(child));
      return;
    }
    if (typeof child !== "object") fail("garmin_json_invalid");
    if (seen.has(child)) fail("garmin_json_invalid");
    seen.add(child);

    if (Array.isArray(child)) {
      if (Object.getPrototypeOf(child) !== Array.prototype || child.length > GARMIN_CANONICAL_LIMITS.maxArrayLength) {
        fail("garmin_json_limit");
      }
      const ownKeys = Reflect.ownKeys(child).filter((key) => key !== "length");
      if (ownKeys.length !== child.length) fail("garmin_json_invalid");
      write("[");
      for (let index = 0; index < child.length; index += 1) {
        if (ownKeys[index] !== String(index)) fail("garmin_json_invalid");
        if (index > 0) write(",");
        visit(child[index], depth + 1);
      }
      write("]");
      return;
    }

    const prototype = Object.getPrototypeOf(child);
    if (prototype !== Object.prototype && prototype !== null) fail("garmin_json_invalid");
    const ownKeys = Reflect.ownKeys(child);
    if (ownKeys.some((key) => typeof key !== "string")) fail("garmin_json_invalid");
    if (ownKeys.length > GARMIN_CANONICAL_LIMITS.maxObjectKeys) fail("garmin_json_limit");
    keys += ownKeys.length;
    if (keys > GARMIN_CANONICAL_LIMITS.maxTotalKeys) fail("garmin_json_limit");
    const sortedKeys = (ownKeys as string[]).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    write("{");
    for (let index = 0; index < sortedKeys.length; index += 1) {
      const key = sortedKeys[index]!;
      if (key.length === 0) fail("garmin_json_invalid");
      if (key.length > GARMIN_CANONICAL_LIMITS.maxKeyCodeUnits) fail("garmin_json_limit");
      const descriptor = Object.getOwnPropertyDescriptor(child, key);
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        fail("garmin_json_invalid");
      }
      if (index > 0) write(",");
      write(JSON.stringify(key));
      write(":");
      visit(descriptor.value, depth + 1);
    }
    write("}");
  }

  visit(value, 0);
  return chunks.join("");
}

export async function hashCanonicalGarminPayload(
  value: unknown,
  sha256: GarminPayloadSha256,
): Promise<string> {
  const digest = await sha256(canonicalizeGarminPayload(value));
  if (!/^[a-f0-9]{64}$/u.test(digest)) fail("garmin_digest_invalid");
  return digest;
}
