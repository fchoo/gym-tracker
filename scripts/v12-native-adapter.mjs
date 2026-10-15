import { spawnSync } from "node:child_process";

/**
 * The only production boundary between Phase 20 producers and a device runner.
 * The configured executable receives one JSON request on stdin and must return
 * one JSON response on stdout.  Tests point V12_NATIVE_ADAPTER_COMMAND at a
 * disposable fake executable; production launchers point it at the checked-in
 * device-runner wrapper.  Keeping this boundary process-based prevents host
 * fixtures from silently becoming native evidence.
 */
function fail(code) { throw new Error(`v12_native_adapter_${code}`); }

export function invokeV12NativeAdapter(action, payload, {
  command = process.env.V12_NATIVE_ADAPTER_COMMAND,
  root = process.cwd(),
} = {}) {
  if (typeof action !== "string" || action.length === 0 || !payload || typeof payload !== "object") fail("request_invalid");
  if (typeof command !== "string" || command.length === 0) fail("command_missing");
  const result = spawnSync(command, ["--action", action], {
    cwd: root,
    input: `${JSON.stringify({ schema_version: 1, action, payload })}\n`,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail("command_failed");
  let response;
  try { response = JSON.parse(result.stdout); } catch { fail("response_invalid"); }
  if (!response || response.schema_version !== 1 || response.action !== action || response.ok !== true || !("result" in response)) fail("response_invalid");
  return response.result;
}

export function createV12NativeAdapter(options = {}) {
  const call = (action, payload) => invokeV12NativeAdapter(action, payload, options);
  return Object.freeze({
    acquireLease: () => call("acquire-lease", {}),
    releaseLease: (lease) => call("release-lease", { lease }),
    snapshotSettings: (lease) => call("snapshot-settings", { lease }),
    restoreSettings: (settings, lease) => call("restore-settings", { settings, lease }) === true,
    capture: (payload) => {
      const result = call("visual-capture", payload);
      return { ...result, png: Buffer.from(result.png_base64 ?? "", "base64") };
    },
    captureBatch: (payload) => call("visual-capture-batch", payload).map((result) => ({ ...result, png: Buffer.from(result.png_base64 ?? "", "base64") })),
    compare: (payload) => call("visual-compare", payload),
    observeAccessibility: (payload) => call("accessibility", payload),
    collectPerformance: (payload) => call("performance", payload),
    executeSqlite: (payload) => call("sqlite", payload),
    executeRecovery: (payload) => call("recovery", payload),
    executeGarmin: (lease, settings, payload) => call("garmin", { lease, settings, ...payload }),
    executeCalendar: (lease, settings, payload) => call("calendar", { lease, settings, ...payload }),
  });
}
