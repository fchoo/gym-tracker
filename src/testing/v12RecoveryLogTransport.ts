import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

const CHUNK_PREFIX = "GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:";
const RESULT_PREFIX = "GYM_TRACKER_V12_DOMAIN_RESULT:";

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Uses the existing host protocol without dropping or summarizing facts. */
export async function publishV12RecoveryLog(
  result: Readonly<{ nonce: string }> & Readonly<Record<string, unknown>>,
  emit: (line: string) => void,
  options: Readonly<{ sha256?: (body: string) => Promise<string>; assertCurrent?: () => void }> = {},
): Promise<void> {
  const serialized = JSON.stringify(result);
  const chunks: string[] = [];
  let offset = 0;
  while (offset < serialized.length) {
    let length = Math.min(1_500, serialized.length - offset);
    while (utf8Bytes(JSON.stringify(serialized.slice(offset, offset + length))) > 3_000) length -= 100;
    chunks.push(serialized.slice(offset, offset + length));
    offset += length;
  }
  if (chunks.length > 16) throw new Error("v12_recovery_result_too_large");
  const sha256 = options.sha256 ?? ((body: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, body));
  const digest = await sha256(serialized);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("v12_recovery_result_digest_invalid");
  options.assertCurrent?.();
  for (const [index, data] of chunks.entries()) {
    options.assertCurrent?.();
    emit(`${CHUNK_PREFIX}${JSON.stringify({ schema_version: 2, nonce: result.nonce, kind: "chunk", sequence: index + 1, total: chunks.length, sha256: digest, data })}`);
  }
  options.assertCurrent?.();
  emit(`${RESULT_PREFIX}${JSON.stringify({ schema_version: 2, nonce: result.nonce, kind: "chunked", total: chunks.length, sha256: digest })}`);
}
