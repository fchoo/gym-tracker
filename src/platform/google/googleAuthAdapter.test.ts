import { describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-nitro-google-signin", () => ({
  GoogleOneTapSignIn: {},
  isSuccessResponse: (value: unknown) => (value as { ok?: unknown })?.ok === true,
}));

import { createGoogleAuthAdapter } from "./googleAuthAdapter";

const clientId = "359232211920-gqfkasvsr8r5qbmprc6ukh9fofu246r9.apps.googleusercontent.com";
const bridge = () => ({
  configure: jest.fn(), signIn: jest.fn(async () => ({ ok: true })),
  requestScopes: jest.fn(async () => ({ accessToken: "token" })),
  getTokens: jest.fn(async () => ({ accessToken: "token" })), signOut: jest.fn(async () => undefined),
});

describe("Google auth adapter", () => {
  it("uses drive.file and verifies the opaque permission ID", async () => {
    const native = bridge();
    const auth = createGoogleAuthAdapter({ webClientId: clientId, bridge: native as never, about: async () => ({ user: { permissionId: "permission-1", emailAddress: "owner@example.com" } }) });
    await expect(auth.connect()).resolves.toEqual({ permissionId: "permission-1", displayEmail: "…@example.com" });
    expect(native.configure).toHaveBeenCalledWith(expect.objectContaining({ offlineAccess: true, scopes: ["https://www.googleapis.com/auth/drive.file"] }));
    await expect(auth.accessToken()).resolves.toBe("token");
    expect(auth.identity()).toEqual({ permissionId: "permission-1", displayEmail: "…@example.com" });
  });

  it("rejects cancellation, unconnected access and account switches", async () => {
    const cancelled = bridge(); cancelled.signIn.mockResolvedValue({ ok: false });
    const auth = createGoogleAuthAdapter({ webClientId: clientId, bridge: cancelled as never, about: async () => ({ user: { permissionId: "permission-1" } }) });
    await expect(auth.connect()).resolves.toBeNull();
    await expect(auth.accessToken()).rejects.toThrow("google_not_connected");
    const switched = bridge(); let calls = 0;
    const switchedAuth = createGoogleAuthAdapter({ webClientId: clientId, bridge: switched as never, about: async () => ({ user: { permissionId: ++calls === 1 ? "permission-1" : "permission-2" } }) });
    await switchedAuth.connect(); await expect(switchedAuth.accessToken()).rejects.toThrow("google_account_mismatch");
  });
});
