import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  PortableIdentityError,
  assertPortableIdentity,
  comparePortableMergeFreshness,
  createOpaquePortableId,
  isOpaquePortableId,
  portableIdentityKey,
} from "./portableIdentity";

describe("portable identity contract", () => {
  it("creates opaque lower-case random identifiers from exactly 16 source bytes", () => {
    const id = createOpaquePortableId(
      Uint8Array.from({ length: 16 }, (_value, index) => index),
    );

    expect(id).toBe("000102030405060708090a0b0c0d0e0f");
    expect(isOpaquePortableId(id)).toBe(true);
  });

  it.each([
    "",
    "not-an-opaque-id",
    "A00102030405060708090a0b0c0d0e0f",
    "000102030405060708090a0b0c0d0e0",
    "000102030405060708090a0b0c0d0e0ff",
  ])("rejects malformed opaque identifiers without exposing source values", (id) => {
    expect(isOpaquePortableId(id)).toBe(false);
    expect(() => assertPortableIdentity(id)).toThrow(PortableIdentityError);
    expect(() => assertPortableIdentity(id)).toThrow("portable_identity_invalid");
  });

  it("rejects a random byte source with the wrong length", () => {
    expect(() => createOpaquePortableId(new Uint8Array(15)))
      .toThrow("portable_identity_invalid");
  });

  it("keys an immutable owner-scoped tuple by record class and opaque id", () => {
    expect(portableIdentityKey({
      ownerNamespace: "11111111111111111111111111111111",
      recordClass: "workout_session",
      portableId: "22222222222222222222222222222222",
    })).toBe(
      "11111111111111111111111111111111:workout_session:22222222222222222222222222222222",
    );
  });

  it("rejects an unknown record class before constructing a portable key", () => {
    expect(() => portableIdentityKey({
      ownerNamespace: "11111111111111111111111111111111",
      recordClass: "unknown" as never,
      portableId: "22222222222222222222222222222222",
    })).toThrow("portable_identity_invalid");
  });

  it("orders roots by canonical modified timestamp then portable id", () => {
    expect(comparePortableMergeFreshness(
      { mergeModifiedAtMs: 20, portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { mergeModifiedAtMs: 10, portableId: "ffffffffffffffffffffffffffffffff" },
    )).toBeGreaterThan(0);
    expect(comparePortableMergeFreshness(
      { mergeModifiedAtMs: 20, portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { mergeModifiedAtMs: 20, portableId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    )).toBeLessThan(0);
    expect(comparePortableMergeFreshness(
      { mergeModifiedAtMs: 20, portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { mergeModifiedAtMs: 20, portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    )).toBe(0);
    expect(() => comparePortableMergeFreshness(
      { mergeModifiedAtMs: -1, portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { mergeModifiedAtMs: 0, portableId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    )).toThrow("portable_identity_invalid");
  });
});
