import { fetch as expoFetch } from "expo/fetch";

import { DRIVE_FILE_SCOPE } from "../domains/backup/googleAuthPort";
import { createGoogleAuthAdapter } from "../platform/google/googleAuthAdapter";
import { fetchGoogleDriveIdentity } from "./productionAutomaticBackupRuntime";

export async function performPhase12GoogleAuthSmoke(webClientId: string): Promise<Readonly<{
  authenticated: true;
  scope: typeof DRIVE_FILE_SCOPE;
}>> {
  const auth = createGoogleAuthAdapter({
    webClientId,
    about: (token) => fetchGoogleDriveIdentity(token, expoFetch as typeof fetch),
  });
  const identity = await auth.connect();
  if (identity === null) throw new Error("phase12_google_auth_smoke_cancelled");
  return Object.freeze({ authenticated: true, scope: DRIVE_FILE_SCOPE });
}
