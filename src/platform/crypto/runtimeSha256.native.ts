import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

const SHA256 = /^[a-f0-9]{64}$/u;

export async function runtimeSha256(value: string): Promise<string> {
  const testDigest = (globalThis as typeof globalThis & Readonly<{
    __GYM_TRACKER_TEST_SHA256__?: (input: string) => Promise<string>;
  }>).__GYM_TRACKER_TEST_SHA256__;
  if (testDigest !== undefined) return testDigest(value);
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
  if (!SHA256.test(digest)) throw new Error("runtime_sha256_unavailable");
  return digest;
}
