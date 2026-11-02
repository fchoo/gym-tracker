import { fetch as expoFetch } from "expo/fetch";

import { DRIVE_FILE_SCOPE } from "../domains/backup/googleAuthPort";
import { createGoogleAuthAdapter } from "../platform/google/googleAuthAdapter";
import { fetchGoogleDriveIdentity } from "./productionAutomaticBackupRuntime";

export async function performPhase12GoogleAuthSmoke(webClientId: string): Promise<Readonly<{
  authenticated: true;
  refreshed: true;
  scope: typeof DRIVE_FILE_SCOPE;
}>> {
  const auth = createGoogleAuthAdapter({
    webClientId,
    about: (token) => fetchGoogleDriveIdentity(token, expoFetch as typeof fetch),
  });
  const identity = await auth.connect();
  if (identity === null) throw new Error("phase12_google_auth_smoke_cancelled");
  await auth.accessToken();
  return Object.freeze({ authenticated: true, refreshed: true, scope: DRIVE_FILE_SCOPE });
}
