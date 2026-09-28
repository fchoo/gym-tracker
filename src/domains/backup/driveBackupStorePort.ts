import type { AutomaticBackupEnvironment } from "./automaticBackupContracts";
export type DriveManifestRead = Readonly<{ bytes: Uint8Array; etag: string }>;
export type DriveManifestCreate = Readonly<{ fileId: string; etag: string }>;
export type DriveBackupObject = Readonly<{ fileId: string; name: string; appProperties: Readonly<Record<string, string>> }>;
export type DriveResumableSession = Readonly<{ location: string; uploadedBytes: number }>;
export type DriveBackupStorePort = Readonly<{
  environment: AutomaticBackupEnvironment;
  discover(): Promise<readonly DriveBackupObject[]>;
  readManifest(): Promise<DriveManifestRead | null>;
  /** Creates only the caller-preallocated manifest identity; 409 is never treated as success. */
  createManifest(candidateId: string, bytes: Uint8Array): Promise<DriveManifestCreate>;
  /** Alias for conditional epoch/tombstone promotion; always carries the raw read ETag. */
  claimManifest(manifestId: string, bytes: Uint8Array, etag: string): Promise<string>;
  download(fileId: string, maxBytes: number): Promise<Uint8Array>;
  createSnapshot(candidateId: string, bytes: Uint8Array): Promise<string>;
  createResumableSnapshot(candidateId: string, bytes: Uint8Array): Promise<DriveResumableSession>;
  resumeSnapshot(session: DriveResumableSession, bytes: Uint8Array): Promise<DriveResumableSession | string>;
  updateManifest(manifestId: string, bytes: Uint8Array, etag: string): Promise<string>;
  trash(fileId: string, expectedWriterEpoch: number, etag: string): Promise<void>;
  deleteTombstoned(fileId: string): Promise<void>;
}>;
