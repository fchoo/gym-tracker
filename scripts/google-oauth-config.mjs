const GOOGLE_PROJECT_NUMBER = "359232211920";
const GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";
const PLACEHOLDER_PATTERN = /^(?:change[-_ ]?me|example|placeholder|your[-_ ]?google|your[-_ ]?client)/iu;

export const GOOGLE_OAUTH_REGISTRATIONS = Object.freeze({
  projectNumber: GOOGLE_PROJECT_NUMBER,
  webClientId: "359232211920-gqfkasvsr8r5qbmprc6ukh9fofu246r9.apps.googleusercontent.com",
  production: Object.freeze({
    packageName: "com.fchoo.gymtracker",
    androidClientId: "359232211920-j3o9ufmnvvqen70tj9ii2kfceuco2j1p.apps.googleusercontent.com",
    sha1: "7F:9A:3E:4C:B8:14:3B:05:B6:88:D9:24:31:46:51:F9:89:F2:0E:22",
    sha256: "FC:52:14:6C:F2:6F:2D:D6:F7:18:05:73:DB:E4:D5:7A:57:C0:A5:AE:34:D7:93:A6:B8:93:98:E9:3D:24:AC:EC",
  }),
  developmentTest: Object.freeze({
    packageName: "com.fchoo.gymtracker.devtest",
    androidClientId: "359232211920-q20m2u1e8019eb626rt8alosr0j2262p.apps.googleusercontent.com",
    sha1: "5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25",
    sha256: "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C",
  }),
});

function requiredClientId(webClientId) {
  if (typeof webClientId !== "string") {
    throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be configured.");
  }
  const normalized = webClientId.trim();
  if (!normalized || PLACEHOLDER_PATTERN.test(normalized)) {
    throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must not be missing or a placeholder.");
  }
  if (
    !new RegExp(`^${GOOGLE_PROJECT_NUMBER}-[a-z0-9]+\\${GOOGLE_CLIENT_ID_SUFFIX}$`, "u").test(
      normalized,
    )
  ) {
    throw new Error(
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be a public client ID from the approved Google Cloud project.",
    );
  }
  return normalized;
}

export function validateGoogleOAuthConfig({ buildProfile, webClientId }) {
  if (buildProfile !== "production" && buildProfile !== "development-test") {
    throw new Error(
      `Unsupported GYM_TRACKER_BUILD_PROFILE "${buildProfile}". Use development-test or production.`,
    );
  }
  return Object.freeze({
    buildProfile,
    webClientId: requiredClientId(webClientId),
    registration: buildProfile === "production"
      ? GOOGLE_OAUTH_REGISTRATIONS.production
      : GOOGLE_OAUTH_REGISTRATIONS.developmentTest,
  });
}
