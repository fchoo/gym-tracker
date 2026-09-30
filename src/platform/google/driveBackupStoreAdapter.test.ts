import { describe, expect, it, jest } from "@jest/globals";

import { createDriveBackupStoreAdapter } from "./driveBackupStoreAdapter";

const properties = { gym_tracker_backup: "v1", environment: "development-test", package: "com.fchoo.gymtracker.devtest" };
const response = (body: unknown, init: ResponseInit = {}) => new Response(body === null ? null : typeof body === "string" ? body : JSON.stringify(body), init);

describe("Drive backup store adapter", () => {
  it("allocates one server-issued id and rejects malformed allocation responses", async () => {
    const allocated = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async () => response({ ids: ["server-issued-id"] }),
    });
    await expect(allocated.allocateFileId()).resolves.toBe("server-issued-id");

    const rejected = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async () => response(null, { status: 500 }),
    });
    await expect(rejected.allocateFileId()).rejects.toThrow("drive_id_allocation_failed");

    const malformed = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async () => response({ ids: [] }),
    });
    await expect(malformed.allocateFileId()).rejects.toThrow("drive_id_allocation_invalid");

    const nonObject = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async () => response("null"),
    });
    await expect(nonObject.allocateFileId()).rejects.toThrow("drive_id_allocation_invalid");

    const invalidId = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async () => response({ ids: ["bad/id"] }),
    });
    await expect(invalidId.allocateFileId()).rejects.toThrow("drive_file_id_invalid");
  });

  it("uses isolated metadata and preserves a raw manifest ETag in If-Match", async () => {
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      if (url.includes("files?q=")) return response({ files: [{ id: "manifest-1", name: "manifest.json", appProperties: properties }] });
      if (url.includes("drive/v2") && url.includes("fields=id,etag")) return response({ id: "manifest-1", etag: '"raw-etag"' });
      if (url.includes("alt=media")) return response("{}");
      return response("{}", { headers: { etag: '"next-etag"' } });
    });
    const adapter = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: fetcher });
    await expect(adapter.readManifest()).resolves.toEqual({ fileId: "manifest-1", bytes: new TextEncoder().encode("{}"), etag: '"raw-etag"' });
    await adapter.updateManifest("manifest-1", new TextEncoder().encode("{}"), '"raw-etag"');
    expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toEqual(expect.objectContaining({ "If-Match": '"raw-etag"' }));
    expect(fetcher.mock.calls.find(([url]) => String(url).includes("alt=media"))?.[1]?.headers)
      .toEqual(expect.objectContaining({ "If-Match": '"raw-etag"' }));
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
    const redirect = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 302, headers: { location: "https://example.invalid" } }) });
    await expect(redirect.discover()).rejects.toThrow("drive_redirect_rejected");
    const followedResponse = response({ files: [] });
    Object.defineProperty(followedResponse, "redirected", { value: true });
    const followed = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => followedResponse });
    await expect(followed.discover()).rejects.toThrow("drive_redirect_rejected");
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

    const failures: string[] = [];
    const malformedList = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", reportFailure: (stage) => { failures.push(stage); }, fetch: async () => response("not-json") });
    await expect(malformedList.discover()).rejects.toThrow("drive_response_invalid");
    expect(failures).toEqual(["list_invalid"]);

    const tooMany = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: Array.from({ length: 9 }, (_, index) => ({ id: `file-${index}`, name: "snapshot", appProperties: properties })) }) });
    await expect(tooMany.discover()).rejects.toThrow("drive_list_excess");

    const oversized = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response("{}", { headers: { "content-length": "999999" } }) });
    await expect(oversized.discover()).rejects.toThrow("drive_response_too_large");

    const missingFile = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => url.includes("files?q=") ? response({ files: [{ id: "manifest", name: "manifest.json", appProperties: properties }] }) : response(null, { status: 404 }) });
    await expect(missingFile.download("manifest", 1)).rejects.toThrow("drive_file_missing");
    await expect(missingFile.readManifest()).resolves.toBeNull();
    await expect(missingFile.download("bad/id", 1)).rejects.toThrow("drive_file_id_invalid");
    await expect(missingFile.download("manifest", 0)).rejects.toThrow("drive_download_limit_invalid");

    const missingManifestMedia = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => url.includes("files?q=") ? response({ files: [{ id: "manifest", name: "manifest.json", appProperties: properties }] }) : url.includes("drive/v2") ? response({ id: "manifest", etag: '"etag"' }) : response(null, { status: 404 }) });
    await expect(missingManifestMedia.readManifest()).resolves.toBeNull();
  });

  it("aborts a Drive request at the bounded transport deadline", async () => {
    let aborted = false;
    const failures: string[] = [];
    const adapter = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      requestTimeoutMs: 1,
      reportFailure: (stage, status) => { failures.push(`${stage}:${status ?? "none"}`); },
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
    });

    await expect(adapter.discover()).rejects.toThrow("drive_request_timeout");
    expect(aborted).toBe(true);

    const immediateFailure = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      reportFailure: (stage, status) => { failures.push(`${stage}:${status ?? "none"}`); },
      fetch: () => { throw new Error("offline"); },
    });
    await expect(immediateFailure.discover()).rejects.toThrow("offline");

    let fetchCalled = false;
    let resolveToken: ((token: string) => void) | undefined;
    const tokenTimeout = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => new Promise<string>((resolve) => { resolveToken = resolve; }),
      requestTimeoutMs: 1,
      fetch: async () => { fetchCalled = true; return response({ files: [] }); },
    });
    await expect(tokenTimeout.discover()).rejects.toThrow("drive_request_timeout");
    resolveToken?.("token");
    await Promise.resolve();
    expect(fetchCalled).toBe(false);
    expect(failures).toEqual(["request_timeout:none", "request_failed:none"]);

    const bodyFailures: string[] = [];
    const bodyTimeout = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      requestTimeoutMs: 1,
      reportFailure: (stage) => { bodyFailures.push(stage); },
      fetch: async () => ({
        ok: true,
        status: 200,
        redirected: false,
        headers: new Headers(),
        arrayBuffer: async () => new Promise<ArrayBuffer>(() => undefined),
        body: { cancel: async () => { throw new Error("locked"); } },
      }) as unknown as Response,
    });
    await expect(bodyTimeout.discover()).rejects.toThrow("drive_response_timeout");
    expect(bodyFailures).toEqual(["list_invalid"]);

    const bodyFailure = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async () => ({
        ok: true,
        status: 200,
        redirected: false,
        headers: new Headers(),
        arrayBuffer: async () => { throw new Error("body_failed"); },
      }) as unknown as Response,
    });
    await expect(bodyFailure.discover()).rejects.toThrow("body_failed");
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

    const fallbackEtag = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async (url) => url.includes("uploadType=multipart")
        ? response({ id: "manifest" })
        : response({ id: "manifest", etag: '"read-etag"' }),
    });
    await expect(fallbackEtag.createManifest("manifest", new Uint8Array([1])))
      .resolves.toEqual({ fileId: "manifest", etag: '"read-etag"' });
    const updateFallbackEtag = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async (url, init) => url.includes("upload/drive/v3") && init.method === "PATCH"
        ? response({})
        : response({ id: "manifest", etag: '"updated-etag"' }),
    });
    await expect(updateFallbackEtag.updateManifest("manifest", new Uint8Array([1]), '"etag"'))
      .resolves.toBe('"updated-etag"');
    const rejectedFallback = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async (url) => url.includes("uploadType=multipart")
        ? response({ id: "manifest" })
        : response(null, { status: 500 }),
    });
    await expect(rejectedFallback.createManifest("manifest", new Uint8Array([1])))
      .rejects.toThrow("drive_manifest_read_failed");

    const missingEtag = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async (url) => url.includes("uploadType=multipart")
        ? response({ id: "manifest" })
        : response({ id: "manifest" }),
    });
    await expect(missingEtag.createManifest("manifest", new Uint8Array([1])))
      .rejects.toThrow("drive_etag_missing");
  });

  it("rejects invalid conditional mutation and resumable acknowledgements", async () => {
    const conflict = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 412 }) });
    await expect(conflict.updateManifest("manifest", new Uint8Array(), '"etag"')).rejects.toThrow("drive_manifest_conflict");
    await expect(conflict.createManifest("manifest", new Uint8Array())).rejects.toThrow("drive_manifest_conflict");
    await expect(conflict.trash("candidate", 0, '"etag"')).rejects.toThrow("drive_trash_fenced");
    const starResponse = createDriveBackupStoreAdapter({
      environment: "development-test",
      token: async () => "token",
      fetch: async (url) => url.includes("drive/v2")
        ? response({ id: "manifest", etag: "*" })
        : response(null, { headers: { etag: "*" } }),
    });
    await expect(starResponse.updateManifest("manifest", new Uint8Array(), '"etag"')).rejects.toThrow("drive_etag_invalid");

    const badRange = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => url.includes("uploadType=resumable") ? response(null, { headers: { location: "https://www.googleapis.com/upload/session" } }) : response(null, { status: 308, headers: { range: "bytes=0-5242881" } }) });
    const payload = new Uint8Array(5 * 1024 * 1024 + 1);
    const session = await badRange.createResumableSnapshot("candidate", payload);
    await expect(badRange.resumeSnapshot(session, payload)).rejects.toThrow("drive_resumable_range_invalid");
  });

  it("fails closed for every malformed Drive transport and mutation acknowledgement", async () => {
    const tokenTooLarge = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "x".repeat(16 * 1024 + 1), fetch: async () => response({ files: [] }) });
    await expect(tokenTooLarge.discover()).rejects.toThrow("drive_token_invalid");
    const failures: string[] = [];
    const listFailed = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", reportFailure: (stage, status) => { failures.push(`${stage}:${status ?? "none"}`); }, fetch: async () => response(null, { status: 500 }) });
    await expect(listFailed.discover()).rejects.toThrow("drive_list_failed");
    expect(failures).toEqual(["list_rejected:500"]);
    const listShape = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: [{}] }) });
    await expect(listShape.discover()).rejects.toThrow("drive_metadata_invalid");
    const badLength = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response("{}", { headers: { "content-length": "bad" } }) });
    await expect(badLength.discover()).rejects.toThrow("drive_response_too_large");
    const noEtag = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => url.includes("alt=media") ? response("{}") : response({ files: [{ id: "manifest", name: "manifest.json", appProperties: properties }] }) });
    await expect(noEtag.readManifest()).rejects.toThrow("drive_etag_missing");

    const mutation = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => {
      if (url.includes("uploadType=multipart")) return response({}, { headers: { etag: '"etag"' } });
      if (url.includes("uploadType=resumable")) return response(null, { headers: { location: "https://www.googleapis.com/upload/session" } });
      if (url.includes("/session")) return response({});
      return response(null, { status: 500 });
    } });
    await expect(mutation.createSnapshot("candidate", new Uint8Array([1]))).rejects.toThrow("drive_metadata_invalid");
    await expect(mutation.createManifest("manifest", new Uint8Array([1]))).rejects.toThrow("drive_manifest_create_invalid");
    const session = await mutation.createResumableSnapshot("candidate", new Uint8Array(5 * 1024 * 1024 + 1));
    await expect(mutation.resumeSnapshot(session, new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow("drive_metadata_invalid");
    await expect(mutation.updateManifest("manifest", new Uint8Array([1]), '"etag"')).rejects.toThrow("drive_manifest_update_failed");
    await expect(mutation.trash("candidate", 1, '"etag"')).rejects.toThrow("drive_trash_failed");
    await expect(mutation.deleteTombstoned("candidate")).rejects.toThrow("drive_delete_failed");
    await expect(mutation.trash("candidate", -1, '"etag"')).rejects.toThrow("drive_writer_epoch_invalid");
  });

  it("preserves production namespace and bounded discovery/deletion behavior", async () => {
    const productionProperties = { gym_tracker_backup: "v1", environment: "production", package: "com.fchoo.gymtracker" };
    const adapter = createDriveBackupStoreAdapter({
      environment: "production", token: async () => "token", fetch: async (url) => {
        if (url.includes("files?q=")) return response({ files: [
          { id: "snapshot", name: "snapshot-snapshot.json", appProperties: { ...productionProperties, object_kind: "snapshot" } },
          { id: "other", name: "other", appProperties: { ...productionProperties, object_kind: "other" } },
        ] });
        if (url.includes("alt=media")) return response("x".repeat(17 * 1024));
        return response({ id: "candidate" }, { headers: { etag: '"etag"' } });
      },
    });
    await expect(adapter.discoverSnapshotsForDeletion()).resolves.toEqual([expect.objectContaining({ fileId: "snapshot" })]);
    await expect(adapter.download("snapshot", 16 * 1024)).rejects.toThrow("drive_response_too_large");
    await expect(adapter.createSnapshot("candidate", new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow("drive_response_too_large");
    await expect(adapter.createManifest("manifest", new Uint8Array(16 * 1024 + 1))).rejects.toThrow("drive_response_too_large");
    await expect(adapter.createResumableSnapshot("candidate", new Uint8Array(24 * 1024 * 1024 + 1))).rejects.toThrow("drive_resumable_size_invalid");
  });

  it("discovers only dated retention candidates with readable etags", async () => {
    const retentionProperties = { gym_tracker_backup: "v1", environment: "development-test", package: "com.fchoo.gymtracker.devtest", object_kind: "snapshot" };
    const adapter = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => {
      if (url.includes("files?q=")) return response({ files: [
        { id: "old", name: "snapshot-old.json", appProperties: { ...retentionProperties, created_at_ms: "1" } },
        { id: "invalid", name: "snapshot-invalid.json", appProperties: { ...retentionProperties, created_at_ms: "bad" } },
        { id: "missing", name: "snapshot-missing.json", appProperties: { ...retentionProperties, created_at_ms: "2" } },
      ] });
      if (url.includes("drive/v2/files/old")) return response({ id: "old", etag: '"old-etag"' });
      if (url.includes("drive/v2/files/missing")) return response(null, { status: 404 });
      return response(null, { status: 500 });
    } });
    await expect(adapter.discoverSnapshotsForRetention()).resolves.toEqual([
      { fileId: "old", createdAtMs: 1, etag: '"old-etag"' },
    ]);
  });

  it("adds bounded creation time metadata only for a valid snapshot header", async () => {
    const bodies: BodyInit[] = [];
    const adapter = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (_url, init) => {
      bodies.push(init?.body ?? ""); return response({ id: "candidate" });
    } });
    const valid = new TextEncoder().encode(JSON.stringify({ header: { createdAtMs: 123 } }));
    await adapter.createSnapshot("candidate", valid);
    expect(new TextDecoder().decode(bodies[0] as Uint8Array)).toContain('"created_at_ms":"123"');
    await adapter.createSnapshot("candidate", new TextEncoder().encode("{}"));
    expect(new TextDecoder().decode(bodies[1] as Uint8Array)).not.toContain("created_at_ms");
  });

  it("fails closed for every remaining response branch while preserving valid empty and final responses", async () => {
    const nativeFetch = global.fetch;
    const defaultFetch = jest.fn(async () => response({ files: [] }));
    global.fetch = defaultFetch as typeof fetch;
    try {
      await expect(createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token" }).discover()).resolves.toEqual([]);
      expect(defaultFetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = nativeFetch;
    }

    const empty = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: [] }) });
    await expect(empty.discover()).resolves.toEqual([]);
    await expect(empty.readManifest()).resolves.toBeNull();
    const omittedEmpty = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({}) });
    await expect(omittedEmpty.discover()).resolves.toEqual([]);

    const badListShape = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null) });
    await expect(badListShape.discover()).rejects.toThrow("drive_response_invalid");
    const nonObjectList = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response('"not-an-object"') });
    await expect(nonObjectList.discover()).rejects.toThrow("drive_response_invalid");
    const nullFiles = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: null }) });
    await expect(nullFiles.discover()).rejects.toThrow("drive_response_invalid");
    const nonObjectEntry = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ files: [null] }) });
    await expect(nonObjectEntry.discover()).rejects.toThrow("drive_metadata_invalid");

    const downloadFailure = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 500 }) });
    await expect(downloadFailure.download("snapshot", 1)).rejects.toThrow("drive_download_failed");

    const readFailure = createDriveBackupStoreAdapter({
      environment: "development-test", token: async () => "token",
      fetch: async (url) => url.includes("files?q=")
        ? response({ files: [{ id: "manifest", name: "manifest.json", appProperties: properties }] })
        : response(null, { status: 500 }),
    });
    await expect(readFailure.readManifest()).rejects.toThrow("drive_manifest_read_failed");

    const mediaReadFailure = createDriveBackupStoreAdapter({
      environment: "development-test", token: async () => "token",
      fetch: async (url) => url.includes("files?q=")
        ? response({ files: [{ id: "manifest", name: "manifest.json", appProperties: properties }] })
        : url.includes("drive/v2")
          ? response({ id: "manifest", etag: '"etag"' })
          : response(null, { status: 500 }),
    });
    await expect(mediaReadFailure.readManifest()).rejects.toThrow("drive_manifest_read_failed");

    const candidateChanged = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response({ id: "other" }) });
    await expect(candidateChanged.createSnapshot("candidate", new Uint8Array([1]))).rejects.toThrow("drive_candidate_id_changed");
    const rejectedCandidate = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 500 }) });
    await expect(rejectedCandidate.createSnapshot("candidate", new Uint8Array([1]))).rejects.toThrow("drive_snapshot_create_failed");

    const resumableFailures = createDriveBackupStoreAdapter({
      environment: "development-test", token: async () => "token",
      fetch: async (url) => url.includes("uploadType=resumable")
        ? response(null, { status: 500 }) : response(null, { status: 500 }),
    });
    await expect(resumableFailures.createResumableSnapshot("candidate", new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow("drive_resumable_create_failed");

    const missingLocation = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null) });
    await expect(missingLocation.createResumableSnapshot("candidate", new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow("drive_resumable_location_missing");

    const rejectedUpload = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 500 }) });
    await expect(rejectedUpload.resumeSnapshot({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 0 }, new Uint8Array([1]))).rejects.toThrow("drive_resumable_upload_failed");
    const missingRange = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 308 }) });
    await expect(missingRange.resumeSnapshot({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 0 }, new Uint8Array([1]))).rejects.toThrow("drive_resumable_range_invalid");
    const staleRange = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 308, headers: { range: "bytes=0-0" } }) });
    await expect(staleRange.resumeSnapshot({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 1 }, new Uint8Array([2, 3]))).rejects.toThrow("drive_resumable_range_invalid");

    const badCreate = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 500 }) });
    await expect(badCreate.createManifest("manifest", new Uint8Array([1]))).rejects.toThrow("drive_manifest_create_failed");
    const deleted = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => response(null, { status: 204 }) });
    await expect(deleted.deleteTombstoned("snapshot")).resolves.toBeUndefined();

    const missingAfterCreate = createDriveBackupStoreAdapter({
      environment: "development-test", token: async () => "token",
      fetch: async (url) => url.includes("uploadType=multipart")
        ? response({ id: "manifest" })
        : response(null, { status: 404 }),
    });
    await expect(missingAfterCreate.createManifest("manifest", new Uint8Array([1])))
      .rejects.toThrow("drive_manifest_read_failed");

    const missingAfterUpdate = createDriveBackupStoreAdapter({
      environment: "development-test", token: async () => "token",
      fetch: async (url) => url.includes("drive/v2")
        ? response(null, { status: 404 })
        : response({}),
    });
    await expect(missingAfterUpdate.updateManifest("manifest", new Uint8Array([1]), '"etag"'))
      .rejects.toThrow("drive_manifest_read_failed");
  });
});
