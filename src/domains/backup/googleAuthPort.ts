export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file" as const;
export type GoogleAuthIdentity = Readonly<{ permissionId: string; displayEmail: string | null }>;
export type GoogleAuthPort = Readonly<{
  connect(): Promise<GoogleAuthIdentity | null>;
  identity(): GoogleAuthIdentity | null;
  /** Gets a currently scoped token; adapters must refresh it before returning it. */
  accessToken(): Promise<string>;
  reauthenticate(): Promise<GoogleAuthIdentity | null>;
  disconnect(): Promise<void>;
}>;
