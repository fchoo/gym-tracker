import assert from "node:assert/strict";
import test from "node:test";

import { validateGoogleOAuthConfig } from "./google-oauth-config.mjs";

const validWebClientId =
  "359232211920-gqfkasvsr8r5qbmprc6ukh9fofu246r9.apps.googleusercontent.com";

test("accepts the provisioned public web client ID for either supported profile", () => {
  assert.deepEqual(
    validateGoogleOAuthConfig({
      buildProfile: "production",
      webClientId: validWebClientId,
    }),
    {
      buildProfile: "production",
      webClientId: validWebClientId,
      registration: {
        packageName: "com.fchoo.gymtracker",
        androidClientId: "359232211920-j3o9ufmnvvqen70tj9ii2kfceuco2j1p.apps.googleusercontent.com",
        sha1: "7F:9A:3E:4C:B8:14:3B:05:B6:88:D9:24:31:46:51:F9:89:F2:0E:22",
        sha256: "FC:52:14:6C:F2:6F:2D:D6:F7:18:05:73:DB:E4:D5:7A:57:C0:A5:AE:34:D7:93:A6:B8:93:98:E9:3D:24:AC:EC",
      },
    },
  );
  assert.equal(
    validateGoogleOAuthConfig({
      buildProfile: "development-test",
      webClientId: validWebClientId,
    }).buildProfile,
    "development-test",
  );
});

test("rejects missing, placeholder, wrong-project, and malformed client IDs", () => {
  for (const webClientId of [
    undefined,
    "",
    "YOUR_GOOGLE_WEB_CLIENT_ID",
    "359232211921-gqfkasvsr8r5qbmprc6ukh9fofu246r9.apps.googleusercontent.com",
    "359232211920-not-a-google-client-id",
  ]) {
    assert.throws(
      () => validateGoogleOAuthConfig({ buildProfile: "production", webClientId }),
      /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/u,
    );
  }
});

test("rejects unsupported build profiles before emitting OAuth configuration", () => {
  assert.throws(
    () => validateGoogleOAuthConfig({ buildProfile: "preview", webClientId: validWebClientId }),
    /Unsupported GYM_TRACKER_BUILD_PROFILE/u,
  );
});
