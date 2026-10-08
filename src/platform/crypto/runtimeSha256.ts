import { createHash } from "node:crypto";

export function runtimeSha256(value: string): Promise<string> {
  return Promise.resolve(createHash("sha256").update(value).digest("hex"));
}
