import {
  describe,
  expect,
  it,
  test,
} from "@jest/globals";

import {
  BoundaryValidationError,
  StableIdSchema,
  TimestampMsSchema,
  VersionedBoundarySchema,
  parseVersionedBoundary,
} from "./index";

describe("versioned boundary contracts", () => {
  test.each([
    {
      name: "accepts a valid strict versioned envelope",
      input: {
        version: 1,
        id: "workout_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000,
      },
    },
  ])("$name", ({ input }) => {
    expect(parseVersionedBoundary(input)).toEqual(input);
  });

  test.each([
    {
      name: "rejects a malformed stable ID",
      input: {
        version: 1,
        id: "not a stable id",
        occurredAtMs: 1_726_780_800_000,
      },
      code: "boundary_invalid",
    },
    {
      name: "rejects a fractional timestamp",
      input: {
        version: 1,
        id: "workout_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000.5,
      },
      code: "boundary_invalid",
    },
    {
      name: "rejects unknown fields",
      input: {
        version: 1,
        id: "workout_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000,
        sqlParameters: ["secret"],
      },
      code: "boundary_invalid",
    },
    {
      name: "rejects an unsupported version distinctly",
      input: {
        version: 2,
        id: "workout_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000,
      },
      code: "boundary_unsupported_version",
    },
    {
      name: "rejects a non-numeric unsupported version without reflecting it",
      input: {
        version: "future",
        id: "workout_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000,
      },
      code: "boundary_unsupported_version",
    },
    {
      name: "rejects a versionless primitive as malformed",
      input: null,
      code: "boundary_invalid",
    },
    {
      name: "rejects a versionless object as malformed",
      input: {
        id: "workout_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000,
      },
      code: "boundary_invalid",
    },
  ])("$name", ({ input, code }) => {
    expect(() => parseVersionedBoundary(input)).toThrow(
      expect.objectContaining({
        kind: code === "boundary_unsupported_version" ? "unsupported_version" : "validation",
        code,
        retryable: false,
      } satisfies Partial<BoundaryValidationError>),
    );
  });

  it("exports schemas whose inferred values are already validated", () => {
    expect(StableIdSchema.parse("set_01J5AV2Q2Z6J83C0H34TDH1J8M")).toBe(
      "set_01J5AV2Q2Z6J83C0H34TDH1J8M",
    );
    expect(TimestampMsSchema.parse(1_726_780_800_000)).toBe(1_726_780_800_000);
    expect(
      VersionedBoundarySchema.parse({
        version: 1,
        id: "set_01J5AV2Q2Z6J83C0H34TDH1J8M",
        occurredAtMs: 1_726_780_800_000,
      }),
    ).toEqual({
      version: 1,
      id: "set_01J5AV2Q2Z6J83C0H34TDH1J8M",
      occurredAtMs: 1_726_780_800_000,
    });
  });
});
