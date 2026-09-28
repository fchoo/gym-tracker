import { GoogleOneTapSignIn, isSuccessResponse } from "react-native-nitro-google-signin";
import { DRIVE_FILE_SCOPE, type GoogleAuthIdentity, type GoogleAuthPort } from "../../domains/backup/googleAuthPort";

type AboutFetcher = (token: string) => Promise<unknown>;
type OneTapBridge = Pick<typeof GoogleOneTapSignIn, "configure" | "signIn" | "requestScopes" | "getTokens" | "signOut">;
function identity(value: unknown): GoogleAuthIdentity {
  if (typeof value !== "object" || value === null) throw new Error("google_identity_invalid");
  const user = (value as { user?: unknown }).user;
  if (typeof user !== "object" || user === null || typeof (user as { permissionId?: unknown }).permissionId !== "string") throw new Error("google_identity_invalid");
  const email = (user as { emailAddress?: unknown }).emailAddress;
  return Object.freeze({ permissionId: (user as { permissionId: string }).permissionId, displayEmail: typeof email === "string" ? email.replace(/^[^@]+/u, "…") : null });
}
export function createGoogleAuthAdapter(input: Readonly<{ webClientId: string; about: AboutFetcher; bridge?: OneTapBridge }>): GoogleAuthPort {
  const bridge = input.bridge ?? GoogleOneTapSignIn;
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/u.test(input.webClientId)) throw new Error("google_client_id_invalid");
  bridge.configure({ webClientId: input.webClientId, offlineAccess: true, scopes: [DRIVE_FILE_SCOPE] });
  let generation = 0;
  let connected: GoogleAuthIdentity | null = null;
  async function current(): Promise<GoogleAuthIdentity | null> {
    const startedAt = ++generation;
    const response = await bridge.signIn();
    if (!isSuccessResponse(response)) return null;
    const authorization = await bridge.requestScopes([DRIVE_FILE_SCOPE]);
    const token = authorization.accessToken;
    if (typeof token !== "string" || token.length === 0) throw new Error("google_token_missing");
    const verified = identity(await input.about(token));
    if (startedAt !== generation) throw new Error("google_connection_stale");
    connected = verified;
    return verified;
  }
  return Object.freeze({
    connect: current,
    reauthenticate: current,
    identity: () => connected,
    async accessToken() {
      if (connected === null) throw new Error("google_not_connected");
      const token = await bridge.getTokens();
      if (typeof token.accessToken !== "string" || token.accessToken.length === 0) throw new Error("google_token_missing");
      const verified = identity(await input.about(token.accessToken));
      if (verified.permissionId !== connected.permissionId) throw new Error("google_account_mismatch");
      return token.accessToken;
    },
    async disconnect() { ++generation; connected = null; await bridge.signOut(); },
  });
}
