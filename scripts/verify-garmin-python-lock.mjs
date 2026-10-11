import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const CLIENT_COMMIT = "218e72ca5459e014435fc2d94fd18bd601fa0c14";
const CURL_CFFI_FILENAME = "curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl";
const CURL_CFFI_HASH = "4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92";
const REVIEWED_PACKAGES = new Set([
  "python-garminconnect", "curl-cffi", "requests", "ua-generator", "certifi", "cffi", "pycparser",
  "rich", "markdown-it-py", "mdurl", "pygments", "charset-normalizer", "idna", "urllib3",
]);

function fail(code) {
  throw new Error(`garmin_python_lock_${code}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateGarminPythonLock(lock) {
  if (!isRecord(lock) || lock.schemaVersion !== 1 || !isRecord(lock.runtime)) fail("schema");
  const { runtime } = lock;
  if (runtime.chaquopyVersion !== "17.0.0" || runtime.pythonVersion !== "3.13" || runtime.minSdk !== 24 || runtime.abi !== "arm64-v8a") fail("runtime");
  if (!Array.isArray(lock.packages)) fail("packages");

  const names = lock.packages.map((entry) => isRecord(entry) ? entry.name : null);
  if (names.length !== REVIEWED_PACKAGES.size || new Set(names).size !== names.length || names.some((name) => !REVIEWED_PACKAGES.has(name))) fail("package_set");

  for (const entry of lock.packages) {
    if (!isRecord(entry) || typeof entry.version !== "string" || !isRecord(entry.source) || !isRecord(entry.artifact) || typeof entry.source.url !== "string" || typeof entry.artifact.filename !== "string" || !/^[a-f0-9]{64}$/u.test(entry.artifact.sha256) || typeof entry.license !== "string") fail("package_metadata");
  }

  const client = lock.packages.find((entry) => entry.name === "python-garminconnect");
  if (client?.version !== "0.3.17" || client.source.commit !== CLIENT_COMMIT) fail("client_commit");
  const curlCffi = lock.packages.find((entry) => entry.name === "curl-cffi");
  if (curlCffi?.version !== "0.15.0" || curlCffi.artifact.filename !== CURL_CFFI_FILENAME) fail("curl_cffi_artifact");
  if (curlCffi.artifact.sha256 !== CURL_CFFI_HASH) fail("curl_cffi_hash");

  return { valid: true, packageCount: REVIEWED_PACKAGES.size };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const lockPath = process.argv[2] ?? path.join(process.cwd(), "modules/garmin-connect/python/garmin-python-lock.json");
  const result = validateGarminPythonLock(JSON.parse(readFileSync(lockPath, "utf8")));
  console.log(`Garmin Python lock valid (${result.packageCount} packages).`);
}
