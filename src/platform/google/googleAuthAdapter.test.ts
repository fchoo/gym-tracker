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

  it("fails closed for malformed configuration, identity, and token responses", async () => {
    expect(() => createGoogleAuthAdapter({ webClientId: "not-a-client-id", bridge: bridge() as never, about: async () => ({}) }))
      .toThrow("google_client_id_invalid");

    const missingIdentity = bridge();
    const malformed = createGoogleAuthAdapter({ webClientId: clientId, bridge: missingIdentity as never, about: async () => ({ user: { emailAddress: "owner@example.com" } }) });
    await expect(malformed.connect()).rejects.toThrow("google_identity_invalid");

    const missingSignInToken = bridge();
    missingSignInToken.requestScopes.mockResolvedValue({ accessToken: "" });
    const noSignInToken = createGoogleAuthAdapter({ webClientId: clientId, bridge: missingSignInToken as never, about: async () => ({ user: { permissionId: "permission" } }) });
    await expect(noSignInToken.connect()).rejects.toThrow("google_token_missing");

    const missingRefreshToken = bridge();
    missingRefreshToken.getTokens.mockResolvedValue({ accessToken: "" });
    const noRefreshToken = createGoogleAuthAdapter({ webClientId: clientId, bridge: missingRefreshToken as never, about: async () => ({ user: { permissionId: "permission" } }) });
    await noRefreshToken.connect();
    await expect(noRefreshToken.accessToken()).rejects.toThrow("google_token_missing");
  });

  it("invalidates an in-flight connection on disconnect and clears its identity", async () => {
    let resolveAbout: ((value: unknown) => void) | undefined;
    const native = bridge();
    const auth = createGoogleAuthAdapter({
      webClientId: clientId,
      bridge: native as never,
      about: async () => new Promise((resolve) => { resolveAbout = resolve; }),
    });

    const connecting = auth.connect();
    await Promise.resolve();
    await auth.disconnect();
    resolveAbout?.({ user: { permissionId: "permission" } });

    await expect(connecting).rejects.toThrow("google_connection_stale");
    expect(auth.identity()).toBeNull();
    expect(native.signOut).toHaveBeenCalledTimes(1);
  });

  it("rejects non-string identity fields and strips only an actual email local part", async () => {
    const badPermission = createGoogleAuthAdapter({ webClientId: clientId, bridge: bridge() as never, about: async () => ({ user: { permissionId: 1 } }) });
    await expect(badPermission.connect()).rejects.toThrow("google_identity_invalid");
    const noEmail = createGoogleAuthAdapter({ webClientId: clientId, bridge: bridge() as never, about: async () => ({ user: { permissionId: "permission", emailAddress: 1 } }) });
    await expect(noEmail.connect()).resolves.toEqual({ permissionId: "permission", displayEmail: null });
  });
});
