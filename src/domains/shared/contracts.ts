import { z } from "zod";

import { BoundaryValidationError } from "./errors";

export const StableIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}_[0-9A-HJKMNP-TV-Z]{26}$/)
  .brand<"StableId">();

export const TimestampMsSchema = z
  .number()
  .int()
  .nonnegative()
  .safe()
  .brand<"TimestampMs">();

export const VersionedBoundarySchema = z.strictObject({
  version: z.literal(1),
  id: StableIdSchema,
  occurredAtMs: TimestampMsSchema,
});

export type StableId = z.infer<typeof StableIdSchema>;
export type TimestampMs = z.infer<typeof TimestampMsSchema>;
export type VersionedBoundary = z.infer<typeof VersionedBoundarySchema>;

const CONTRACT_CORRELATION_CODE = "GT-BOUNDARY01";

function readVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null || !("version" in input)) {
    return undefined;
  }

  return input.version;
}

export function parseVersionedBoundary(input: unknown): VersionedBoundary {
  const version = readVersion(input);

  if (version !== undefined && version !== 1) {
    const errorInput = {
      kind: "unsupported_version",
      code: "boundary_unsupported_version",
      correlationCode: CONTRACT_CORRELATION_CODE,
    } as const;

    throw new BoundaryValidationError(
      typeof version === "number"
        ? { ...errorInput, metadata: { version } }
        : errorInput,
    );
  }

  const result = VersionedBoundarySchema.safeParse(input);
  if (!result.success) {
    throw new BoundaryValidationError({
      kind: "validation",
      code: "boundary_invalid",
      correlationCode: CONTRACT_CORRELATION_CODE,
    });
  }

  return result.data;
}
