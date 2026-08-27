import {
  describe,
  expect,
  it,
  test,
} from "@jest/globals";

import {
  AppError,
  createAppError,
  mapUnknownError,
} from "./index";

describe("typed application errors", () => {
  const errorCases: ReadonlyArray<{
    kind: AppError["kind"];
    retryable: boolean;
  }> = [
    { kind: "validation", retryable: false },
    { kind: "conflict", retryable: false },
    { kind: "storage", retryable: true },
    { kind: "migration", retryable: false },
    { kind: "permission", retryable: false },
    { kind: "crypto", retryable: false },
    { kind: "unsupported_version", retryable: false },
    { kind: "transient_platform", retryable: true },
  ];

  test.each(errorCases)("exposes category and retryability for $kind errors", ({
    kind,
    retryable,
  }) => {
    const error = createAppError({
      kind,
      code: `${kind}_failed`,
      retryable,
      correlationCode: "GT-01J5AV2Q",
      metadata: { revision: 12 },
    });

    expect(error).toEqual({
      kind,
      code: `${kind}_failed`,
      retryable,
      correlationCode: "GT-01J5AV2Q",
      metadata: { revision: 12 },
    } satisfies AppError);
    expect(error).not.toHaveProperty("message");
    expect(error).not.toHaveProperty("cause");
  });

  it("bounds correlation codes to a stable non-sensitive format", () => {
    expect(() =>
      createAppError({
        kind: "storage",
        code: "write_failed",
        retryable: true,
        correlationCode: "raw sqlite message with params: hunter2",
      }),
    ).toThrow("Invalid correlation code");
  });

  it("rejects unstable application error codes", () => {
    expect(() =>
      createAppError({
        kind: "validation",
        code: "Raw platform error",
        retryable: false,
        correlationCode: "GT-01J5AV2Q",
      }),
    ).toThrow("Invalid application error code");
  });

  it("maps unknown platform failures without preserving raw messages", () => {
    const mapped = mapUnknownError(
      new Error("SQLITE_CONSTRAINT params=[owner-secret]"),
      {
        kind: "storage",
        code: "storage_unknown",
        retryable: true,
        correlationCode: "GT-01J5AV2Q",
      },
    );

    expect(mapped).toEqual({
      kind: "storage",
      code: "storage_unknown",
      retryable: true,
      correlationCode: "GT-01J5AV2Q",
    } satisfies AppError);
    expect(JSON.stringify(mapped)).not.toContain("SQLITE");
    expect(JSON.stringify(mapped)).not.toContain("owner-secret");
  });
});
