import { fetch as expoFetch } from "expo/fetch";

import { createDriveBackupStoreAdapter, type DriveFetch } from "../platform/google/driveBackupStoreAdapter";
import { createGoogleAuthAdapter } from "../platform/google/googleAuthAdapter";
import { cleanupPhase12GoogleNamespace } from "../testing/phase12GoogleCleanup";
import { fetchGoogleDriveIdentity } from "./productionAutomaticBackupRuntime";

export async function performPhase12GoogleCleanup(webClientId: string): Promise<Readonly<{ deleted: number; remaining: 0 }>> {
  const request = expoFetch as DriveFetch;
  const auth = createGoogleAuthAdapter({
    webClientId,
    about: (token) => fetchGoogleDriveIdentity(token, request as typeof fetch),
  });
  const token = await auth.accessToken();
  return cleanupPhase12GoogleNamespace({
    drive: createDriveBackupStoreAdapter({ environment: "development-test", token: async () => token, fetch: request }),
  });
}
