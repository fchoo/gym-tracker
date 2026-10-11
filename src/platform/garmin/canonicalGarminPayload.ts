export type GarminPayloadSha256 = (canonicalPayload: string) => string | Promise<string>;

export function canonicalizeGarminPayload(_value: unknown): string {
  throw new Error("garmin_canonical_not_implemented");
}

export async function hashCanonicalGarminPayload(
  value: unknown,
  sha256: GarminPayloadSha256,
): Promise<string> {
  return sha256(canonicalizeGarminPayload(value));
}
