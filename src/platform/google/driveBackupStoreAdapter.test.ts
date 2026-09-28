import { describe, expect, it, jest } from "@jest/globals";

import { createDriveBackupStoreAdapter } from "./driveBackupStoreAdapter";

const properties = { gym_tracker_backup: "v1", environment: "development-test", package: "com.fchoo.gymtracker.devtest" };
const response = (body: unknown, init: ResponseInit = {}) => new Response(body === null ? null : typeof body === "string" ? body : JSON.stringify(body), init);

describe("Drive backup store adapter", () => {
  it("uses isolated metadata and preserves a raw manifest ETag in If-Match", async () => {
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      if (url.includes("files?q=")) return response({ files: [{ id: "manifest-1", name: "manifest.json", appProperties: properties }] });
      if (url.includes("alt=media")) return response("{}", { headers: { etag: '"raw-etag"' } });
      return response("{}", { headers: { etag: '"next-etag"' } });
    });
    const adapter = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: fetcher });
    await expect(adapter.readManifest()).resolves.toEqual({ bytes: new TextEncoder().encode("{}"), etag: '"raw-etag"' });
    await adapter.updateManifest("manifest-1", new TextEncoder().encode("{}"), '"raw-etag"');
    expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toEqual(expect.objectContaining({ "If-Match": '"raw-etag"' }));
    const discoveryUrl = String(fetcher.mock.calls[0]?.[0]);
    expect(discoveryUrl).toContain("pageSize=9");
    expect(decodeURIComponent(discoveryUrl)).toContain("appProperties has { key='environment' and value='development-test' }");
  });

  it("rejects cross-environment metadata, ambiguous manifests, stars, redirects, and over-limit data", async () => {
    const wrong = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: [{ id: "wrong", name: "manifest.json", appProperties: { ...properties, environment: "production" } }] }) });
    await expect(wrong.discover()).rejects.toThrow("drive_metadata_invalid");
    const ambiguous = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: [{ id: "one", name: "manifest.json", appProperties: properties }, { id: "two", name: "manifest.json", appProperties: properties }] }) });
    await expect(ambiguous.readManifest()).rejects.toThrow("drive_manifest_ambiguous");
    await expect(ambiguous.updateManifest("one", new Uint8Array(), "*")).rejects.toThrow("drive_etag_invalid");
  });

  it("uses multipart at 5 MiB and resumable only above it with acknowledged offsets", async () => {
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      if (url.includes("uploadType=resumable")) return response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/session" } });
      if (url.includes("/session")) return response(null, { status: 308, headers: { range: "bytes=0-5242880" } });
      return response({ id: "candidate" });
    });
    const adapter = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: fetcher });
    await expect(adapter.createSnapshot("candidate", new Uint8Array(5 * 1024 * 1024))).resolves.toBe("candidate");
    const data = new Uint8Array(5 * 1024 * 1024 + 1);
    const session = await adapter.createResumableSnapshot("candidate", data);
    await expect(adapter.resumeSnapshot(session, data)).resolves.toEqual({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 5 * 1024 * 1024 + 1 });
  });

  it("rejects unauthenticated, malformed, over-bounded, and cross-namespace Drive responses before they can affect recovery", async () => {
    const unauthorized = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 401 }) });
    await expect(unauthorized.discover()).rejects.toThrow("drive_unauthorized");

    const emptyToken = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "", fetch: async () => response({ files: [] }) });
    await expect(emptyToken.discover()).rejects.toThrow("drive_token_invalid");

    const malformedList = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response("not-json") });
    await expect(malformedList.discover()).rejects.toThrow("drive_response_invalid");

    const tooMany = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: Array.from({ length: 9 }, (_, index) => ({ id: `file-${index}`, name: "snapshot", appProperties: properties })) }) });
    await expect(tooMany.discover()).rejects.toThrow("drive_list_excess");

    const oversized = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response("{}", { headers: { "content-length": "999999" } }) });
    await expect(oversized.discover()).rejects.toThrow("drive_response_too_large");

    const missingFile = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => url.includes("alt=media") ? response(null, { status: 404 }) : response({ files: [{ id: "manifest", name: "manifest.json", appProperties: properties }] }) });
    await expect(missingFile.download("manifest", 1)).rejects.toThrow("drive_file_missing");
    await expect(missingFile.readManifest()).resolves.toBeNull();
    await expect(missingFile.download("bad/id", 1)).rejects.toThrow("drive_file_id_invalid");
    await expect(missingFile.download("manifest", 0)).rejects.toThrow("drive_download_limit_invalid");
  });

  it("keeps manifest, resumable, and deletion operations conditionally fenced", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let resumableCall = 0;
    const adapter = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (url.includes("uploadType=resumable")) return response(null, { headers: { location: "https://www.googleapis.com/upload/session" } });
        if (url.includes("/session")) {
          resumableCall += 1;
          return resumableCall === 1 ? response(null, { status: 308, headers: { range: "bytes=0-0" } }) : response({ id: "candidate" });
        }
        if (init.method === "DELETE") return response(null, { status: 404 });
        return response({ id: "manifest" }, { headers: { etag: '"etag"' } });
      },
    });
    const data = new Uint8Array(5 * 1024 * 1024 + 2);
    const session = await adapter.createResumableSnapshot("candidate", data);
    const partial = await adapter.resumeSnapshot(session, data);
    expect(partial).toEqual({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 1 });
    await expect(adapter.resumeSnapshot(partial as { location: string; uploadedBytes: number }, data)).resolves.toBe("candidate");
    await expect(adapter.createResumableSnapshot("candidate", new Uint8Array(5 * 1024 * 1024))).rejects.toThrow("drive_resumable_size_invalid");
    await expect(adapter.resumeSnapshot({ location: "https://example.invalid/session", uploadedBytes: 0 }, data)).rejects.toThrow("drive_origin_invalid");
    await expect(adapter.resumeSnapshot({ location: "https://www.googleapis.com/upload/session", uploadedBytes: -1 }, data)).rejects.toThrow("drive_resumable_offset_invalid");

    await expect(adapter.createManifest("manifest", new Uint8Array([1]))).resolves.toEqual({ fileId: "manifest", etag: '"etag"' });
    await expect(adapter.trash("candidate", 2, '"etag"')).resolves.toBeUndefined();
    await expect(adapter.deleteTombstoned("candidate")).resolves.toBeUndefined();
    expect(requests.some(({ init }) => (init.headers as Record<string, string>)["X-Gym-Tracker-Writer-Epoch"] === "2")).toBe(true);
  });

  it("rejects invalid conditional mutation and resumable acknowledgements", async () => {
    const conflict = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 412 }) });
    await expect(conflict.updateManifest("manifest", new Uint8Array(), '"etag"')).rejects.toThrow("drive_manifest_conflict");
    await expect(conflict.createManifest("manifest", new Uint8Array())).rejects.toThrow("drive_manifest_conflict");
    await expect(conflict.trash("candidate", 0, '"etag"')).rejects.toThrow("drive_trash_fenced");

    const badRange = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => url.includes("uploadType=resumable") ? response(null, { headers: { location: "https://www.googleapis.com/upload/session" } }) : response(null, { status: 308, headers: { range: "bytes=0-5242881" } }) });
    const payload = new Uint8Array(5 * 1024 * 1024 + 1);
    const session = await badRange.createResumableSnapshot("candidate", payload);
    await expect(badRange.resumeSnapshot(session, payload)).rejects.toThrow("drive_resumable_range_invalid");
  });
});
