import type { AutomaticBackupEnvironment } from "../../domains/backup/automaticBackupContracts";
import type { DriveBackupObject, DriveBackupStorePort, DriveManifestRead, DriveResumableSession } from "../../domains/backup/driveBackupStorePort";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_API_V2 = "https://www.googleapis.com/drive/v2";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MULTIPART_LIMIT = 5 * 1024 * 1024;
const MAX_LIST_RESULTS = 8;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024 + 64 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;

export type DriveFetch = (url: string, init: RequestInit) => Promise<Response>;
export type DriveToken = () => Promise<string>;
export type DriveFailureStage = "request_timeout" | "request_failed" | "list_rejected" | "list_invalid";

function namespace(environment: AutomaticBackupEnvironment): Readonly<Record<string, string>> {
  return Object.freeze({ gym_tracker_backup: "v1", environment, package: environment === "production" ? "com.fchoo.gymtracker" : "com.fchoo.gymtracker.devtest" });
}
function escapeDriveQueryLiteral(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'");
}
/**
 * Never enumerate a user's whole Drive and filter it locally.  The namespace is
 * part of the server-side predicate; the parser below is a second fence for
 * malformed or cross-environment metadata returned by a proxy/test double.
 */
function appPropertiesQuery(expected: Readonly<Record<string, string>>): string {
  return ["trashed = false", ...Object.entries(expected).map(([key, value]) =>
    `appProperties has { key='${escapeDriveQueryLiteral(key)}' and value='${escapeDriveQueryLiteral(value)}' }`,
  )].join(" and ");
}
function assertId(value: string): void { if (!/^[A-Za-z0-9_-]{1,256}$/u.test(value)) throw new Error("drive_file_id_invalid"); }
function assertEtag(value: string): void { if (value.length === 0 || value === "*") throw new Error("drive_etag_invalid"); }
function origin(url: string): void { const parsed = new URL(url); if (parsed.origin !== "https://www.googleapis.com") throw new Error("drive_origin_invalid"); }
function bytes(value: Uint8Array, limit: number): void { if (value.byteLength > limit) throw new Error("drive_response_too_large"); }
async function body(response: Response, limit: number, timeoutMs: number): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > limit)) throw new Error("drive_response_too_large");
  let timeout!: ReturnType<typeof setTimeout>;
  let timedOut = false;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      void response.body?.cancel("drive_response_timeout").catch(() => undefined);
      reject(new Error("drive_response_timeout"));
    }, timeoutMs);
  });
  try {
    if (response.body != null && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const result = await Promise.race([reader.read(), timeoutFailure]);
          if (result.done) break;
          const chunk = result.value;
          total += chunk.byteLength;
          if (total > limit) {
            await reader.cancel("drive_response_too_large").catch(() => undefined);
            throw new Error("drive_response_too_large");
          }
          chunks.push(chunk);
        }
      } finally {
        reader.releaseLock();
      }
      const value = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        value.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return value;
    }
    if (length === null) throw new Error("drive_response_length_required");
    const buffer = await Promise.race([response.arrayBuffer(), timeoutFailure]);
    const value = new Uint8Array(buffer);
    bytes(value, limit);
    return value;
  } catch (error) {
    if (timedOut) throw new Error("drive_response_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function json(responseBytes: Uint8Array): unknown { try { return JSON.parse(new TextDecoder().decode(responseBytes)); } catch { throw new Error("drive_response_invalid"); } }
function propertiesMatch(value: unknown, expected: Readonly<Record<string, string>>): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.entries(expected).every(([key, expectedValue]) => (value as Record<string, unknown>)[key] === expectedValue);
}
function parseFile(value: unknown, expected: Readonly<Record<string, string>>): DriveBackupObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("drive_metadata_invalid");
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || typeof entry.name !== "string" || !propertiesMatch(entry.appProperties, expected)) throw new Error("drive_metadata_invalid");
  assertId(entry.id); return Object.freeze({ fileId: entry.id, name: entry.name, appProperties: Object.freeze({ ...entry.appProperties }) });
}
function multipart(candidateId: string, payload: Uint8Array, properties: Readonly<Record<string, string>>): Uint8Array {
  const boundary = "gym-tracker-drive-backup-v1";
  const metadata = JSON.stringify({ id: candidateId, name: `snapshot-${candidateId}.json`, appProperties: properties, mimeType: "application/json" });
  const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`);
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const result = new Uint8Array(prefix.byteLength + payload.byteLength + suffix.byteLength); result.set(prefix); result.set(payload, prefix.byteLength); result.set(suffix, prefix.byteLength + payload.byteLength); return result;
}

export function createDriveBackupStoreAdapter(input: Readonly<{ environment: AutomaticBackupEnvironment; token: DriveToken; fetch?: DriveFetch; requestTimeoutMs?: number; reportFailure?(stage: DriveFailureStage, status?: number): void }>): DriveBackupStorePort {
  const fetcher = input.fetch ?? fetch;
  const requestTimeoutMs = input.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const readBody = (response: Response, limit: number) => body(response, limit, requestTimeoutMs);
  const properties = namespace(input.environment);
  const snapshotProperties = Object.freeze({ ...properties, object_kind: "snapshot" });
  const manifestProperties = Object.freeze({ ...properties, object_kind: "manifest" });
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    origin(url);
    const controller = new AbortController();
    let timeout!: ReturnType<typeof setTimeout>;
    let timedOut = false;
    let response: Response;
    try {
      response = await Promise.race([
        (async () => {
          const token = await input.token();
          if (token.length === 0 || token.length > 16 * 1024) throw new Error("drive_token_invalid");
          if (controller.signal.aborted) throw new Error("drive_request_timeout");
          return fetcher(url, { ...init, signal: controller.signal, redirect: "manual", headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
        })(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("drive_request_timeout"));
          }, requestTimeoutMs);
        }),
      ]);
    } catch (error) {
      input.reportFailure?.(timedOut ? "request_timeout" : "request_failed");
      if (timedOut) throw new Error("drive_request_timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if ((response.status >= 300 && response.status < 400 && response.status !== 308) || response.redirected) throw new Error("drive_redirect_rejected");
    if (response.status === 401) throw new Error("drive_unauthorized");
    return response;
  }
  async function discover(): Promise<readonly DriveBackupObject[]> {
    const query = encodeURIComponent(appPropertiesQuery(properties));
    const response = await request(`${DRIVE_API}/files?q=${query}&spaces=drive&pageSize=${MAX_LIST_RESULTS + 1}&fields=files(id,name,appProperties)`);
    if (!response.ok) {
      input.reportFailure?.("list_rejected", response.status);
      throw new Error("drive_list_failed");
    }
    try {
      const value = json(await readBody(response, 64 * 1024));
      if (typeof value !== "object" || value === null) throw new Error("drive_response_invalid");
      const files = (value as { files?: unknown }).files;
      if (files !== undefined && !Array.isArray(files)) throw new Error("drive_response_invalid");
      const entries = files ?? []; if (entries.length > MAX_LIST_RESULTS) throw new Error("drive_list_excess");
      return Object.freeze(entries.map((entry) => parseFile(entry, properties)));
    } catch (error) {
      input.reportFailure?.("list_invalid");
      throw error;
    }
  }
  async function allocateFileId(): Promise<string> {
    const response = await request(
      `${DRIVE_API}/files/generateIds?count=1&space=drive&type=files`,
    );
    if (!response.ok) throw new Error("drive_id_allocation_failed");
    const value = json(await readBody(response, 64 * 1024));
    const ids = typeof value === "object" && value !== null
      ? (value as { ids?: unknown }).ids
      : undefined;
    if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string") {
      throw new Error("drive_id_allocation_invalid");
    }
    assertId(ids[0]);
    return ids[0];
  }
  async function discoverSnapshotsForDeletion(): Promise<readonly DriveBackupObject[]> {
    const query = encodeURIComponent(appPropertiesQuery(snapshotProperties));
    const response = await request(`${DRIVE_API}/files?q=${query}&spaces=drive&pageSize=${MAX_LIST_RESULTS}&fields=files(id,name,appProperties)`);
    if (!response.ok) {
      input.reportFailure?.("list_rejected", response.status);
      throw new Error("drive_list_failed");
    }
    try {
      const value = json(await readBody(response, 64 * 1024));
      if (typeof value !== "object" || value === null) throw new Error("drive_response_invalid");
      const files = (value as { files?: unknown }).files;
      if (files !== undefined && !Array.isArray(files)) throw new Error("drive_response_invalid");
      const entries = files ?? [];
      if (entries.length > MAX_LIST_RESULTS) throw new Error("drive_list_excess");
      return Object.freeze(entries.map((entry) => parseFile(entry, snapshotProperties)));
    } catch (error) {
      input.reportFailure?.("list_invalid");
      throw error;
    }
  }
  async function discoverSnapshotsForRetention() {
    const snapshots = await discoverSnapshotsForDeletion();
    const candidates = [];
    for (const snapshot of snapshots) {
      const createdAtMs = Number(snapshot.appProperties.created_at_ms);
      if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) continue;
      const etag = await readFileEtag(snapshot.fileId);
      if (etag !== null) candidates.push(Object.freeze({ fileId: snapshot.fileId, createdAtMs, etag }));
    }
    return Object.freeze(candidates);
  }
  function snapshotPropertiesFor(payload: Uint8Array): Readonly<Record<string, string>> {
    try {
      const decoded = JSON.parse(new TextDecoder().decode(payload)) as { header?: { createdAtMs?: unknown } };
      const createdAtMs = decoded.header?.createdAtMs;
      return Number.isSafeInteger(createdAtMs) && (createdAtMs as number) >= 0
        ? Object.freeze({ ...snapshotProperties, created_at_ms: String(createdAtMs) })
        : snapshotProperties;
    } catch { return snapshotProperties; }
  }
  async function download(fileId: string, maxBytes: number): Promise<Uint8Array> {
    assertId(fileId); if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES) throw new Error("drive_download_limit_invalid");
    const response = await request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
    if (response.status === 404) throw new Error("drive_file_missing"); if (!response.ok) throw new Error("drive_download_failed"); return readBody(response, maxBytes);
  }
  async function readFileEtag(fileId: string): Promise<string | null> {
    assertId(fileId);
    const response = await request(`${DRIVE_API_V2}/files/${encodeURIComponent(fileId)}?fields=id,etag`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("drive_manifest_read_failed");
    const value = json(await readBody(response, 64 * 1024));
    if (typeof value !== "object" || value === null
      || (value as { id?: unknown }).id !== fileId
      || typeof (value as { etag?: unknown }).etag !== "string") {
      throw new Error("drive_etag_missing");
    }
    const etag = (value as { etag: string }).etag;
    assertEtag(etag);
    return etag;
  }
  async function readManifest(): Promise<DriveManifestRead | null> {
    const manifests = (await discover()).filter((entry) => entry.name === "manifest.json");
    if (manifests.length > 1) throw new Error("drive_manifest_ambiguous"); if (manifests.length === 0) return null;
    const fileId = manifests[0]!.fileId;
    const etag = await readFileEtag(fileId);
    if (etag === null) return null;
    const response = await request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { "If-Match": etag } });
    if (response.status === 404) return null; if (!response.ok) throw new Error("drive_manifest_read_failed"); return Object.freeze({ fileId, bytes: await readBody(response, 16 * 1024), etag });
  }
  async function createSnapshot(candidateId: string, payload: Uint8Array): Promise<string> {
    assertId(candidateId); bytes(payload, MULTIPART_LIMIT); const boundary = "gym-tracker-drive-backup-v1";
    const candidateProperties = snapshotPropertiesFor(payload);
    const response = await request(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart(candidateId, payload, candidateProperties) as unknown as BodyInit });
    if (!response.ok) throw new Error("drive_snapshot_create_failed"); const result = parseFile({ ...(json(await readBody(response, 64 * 1024)) as Record<string, unknown>), name: `snapshot-${candidateId}.json`, appProperties: candidateProperties }, properties); if (result.fileId !== candidateId) throw new Error("drive_candidate_id_changed"); return result.fileId;
  }
  async function createResumableSnapshot(candidateId: string, payload: Uint8Array): Promise<DriveResumableSession> {
    assertId(candidateId); if (payload.byteLength <= MULTIPART_LIMIT || payload.byteLength > 24 * 1024 * 1024) throw new Error("drive_resumable_size_invalid");
    const metadata = JSON.stringify({ id: candidateId, name: `snapshot-${candidateId}.json`, appProperties: snapshotPropertiesFor(payload), mimeType: "application/json" });
    const response = await request(`${DRIVE_UPLOAD}/files?uploadType=resumable&fields=id`, { method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": "application/json", "X-Upload-Content-Length": String(payload.byteLength) }, body: metadata });
    if (!response.ok) throw new Error("drive_resumable_create_failed"); const location = response.headers.get("location"); if (location === null) throw new Error("drive_resumable_location_missing"); origin(location); return Object.freeze({ location, uploadedBytes: 0 });
  }
  async function resumeSnapshot(session: DriveResumableSession, payload: Uint8Array): Promise<DriveResumableSession | string> {
    origin(session.location); if (!Number.isSafeInteger(session.uploadedBytes) || session.uploadedBytes < 0 || session.uploadedBytes > payload.byteLength) throw new Error("drive_resumable_offset_invalid");
    const remaining = payload.slice(session.uploadedBytes); const end = payload.byteLength - 1;
    const response = await request(session.location, { method: "PUT", headers: { "Content-Type": "application/json", "Content-Length": String(remaining.byteLength), "Content-Range": `bytes ${session.uploadedBytes}-${end}/${payload.byteLength}` }, body: remaining as unknown as BodyInit });
    if (response.status === 308) { const range = response.headers.get("range"); const matched = range?.match(/^bytes=0-(\d+)$/u); if (matched === null || matched === undefined) throw new Error("drive_resumable_range_invalid"); const uploadedBytes = Number(matched[1]) + 1; if (uploadedBytes <= session.uploadedBytes || uploadedBytes > payload.byteLength) throw new Error("drive_resumable_range_invalid"); return Object.freeze({ location: session.location, uploadedBytes }); }
    if (!response.ok) throw new Error("drive_resumable_upload_failed"); const result = json(await readBody(response, 64 * 1024)); if (typeof result !== "object" || result === null || typeof (result as { id?: unknown }).id !== "string") throw new Error("drive_metadata_invalid"); assertId((result as { id: string }).id); return (result as { id: string }).id;
  }
  async function updateManifest(manifestId: string, manifest: Uint8Array, etag: string): Promise<string> {
    assertId(manifestId); bytes(manifest, 16 * 1024); assertEtag(etag); const response = await request(`${DRIVE_UPLOAD}/files/${encodeURIComponent(manifestId)}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": etag }, body: manifest as unknown as BodyInit });
    if (response.status === 409 || response.status === 412) throw new Error("drive_manifest_conflict");
    if (!response.ok) throw new Error("drive_manifest_update_failed");
    const updatedEtag = response.headers.get("etag");
    if (updatedEtag !== null && updatedEtag !== "*") {
      assertEtag(updatedEtag);
      return updatedEtag;
    }
    const rereadEtag = await readFileEtag(manifestId);
    if (rereadEtag === null) throw new Error("drive_manifest_read_failed");
    return rereadEtag;
  }
  async function createManifest(candidateId: string, manifest: Uint8Array): Promise<Readonly<{ fileId: string; etag: string }>> {
    assertId(candidateId); bytes(manifest, 16 * 1024);
    const boundary = "gym-tracker-drive-backup-v1";
    const metadata = JSON.stringify({ id: candidateId, name: "manifest.json", appProperties: manifestProperties, mimeType: "application/json" });
    const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`);
    const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const payload = new Uint8Array(prefix.byteLength + manifest.byteLength + suffix.byteLength); payload.set(prefix); payload.set(manifest, prefix.byteLength); payload.set(suffix, prefix.byteLength + manifest.byteLength);
    const response = await request(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: payload as unknown as BodyInit });
    if (response.status === 409 || response.status === 412) throw new Error("drive_manifest_conflict");
    if (!response.ok) throw new Error("drive_manifest_create_failed");
    const result = json(await readBody(response, 64 * 1024));
    if (typeof result !== "object" || result === null || typeof (result as { id?: unknown }).id !== "string" || (result as { id: string }).id !== candidateId) throw new Error("drive_manifest_create_invalid");
    const createdEtag = response.headers.get("etag");
    if (createdEtag !== null && createdEtag !== "*") return Object.freeze({ fileId: candidateId, etag: createdEtag });
    const rereadEtag = await readFileEtag(candidateId);
    if (rereadEtag === null) throw new Error("drive_manifest_read_failed");
    return Object.freeze({ fileId: candidateId, etag: rereadEtag });
  }
  async function trash(fileId: string, expectedWriterEpoch: number, etag: string): Promise<void> {
    assertId(fileId); if (!Number.isSafeInteger(expectedWriterEpoch) || expectedWriterEpoch < 0) throw new Error("drive_writer_epoch_invalid"); assertEtag(etag); const response = await request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": etag, "X-Gym-Tracker-Writer-Epoch": String(expectedWriterEpoch) }, body: JSON.stringify({ trashed: true }) }); if (response.status === 409 || response.status === 412) throw new Error("drive_trash_fenced"); if (!response.ok) throw new Error("drive_trash_failed");
  }
  async function deleteTombstoned(fileId: string): Promise<void> { assertId(fileId); const response = await request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }); if (response.status !== 404 && !response.ok) throw new Error("drive_delete_failed"); }
  return Object.freeze({ environment: input.environment, allocateFileId, discover, discoverSnapshotsForDeletion, discoverSnapshotsForRetention, readManifest, createManifest, claimManifest: updateManifest, download, createSnapshot, createResumableSnapshot, resumeSnapshot, updateManifest, trash, deleteTombstoned });
}
