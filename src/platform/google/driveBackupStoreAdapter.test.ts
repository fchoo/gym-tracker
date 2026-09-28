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
    expect(fetcher.mock.calls[0]?.[0]).toContain("pageSize=9");
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
});
