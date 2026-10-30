import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const CLIENT_COMMIT = "218e72ca5459e014435fc2d94fd18bd601fa0c14";
const CURL_CFFI_FILENAME = "curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl";
const CURL_CFFI_HASH = "4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92";
const CFFI_FILENAME = 'cffi-2.1.1-cp313-cp313-android_24_arm64_v8a.whl';
const CFFI_HASH = '850ee4664381151d0e10407de861b47e0c9954a06e4b0e8307431472990bd767';
const BUILD_MANIFEST_HASH = '40c706297872d458021a090d3c84bbcbd401e6e2570d8af86080156ba682d9e0';
const LIBFFI_FILENAME = 'chaquopy_libffi-3.3-3-py3-none-android_24_arm64_v8a.whl';
const LIBFFI_HASH = '86873c2f8e5e43b07b72233bf35e06ad8dae41ba98e0556202d61d00d7ad952f';
const LIBFFI_URL = `https://chaquo.com/pypi-13.1/chaquopy-libffi/${LIBFFI_FILENAME}`;
const LOCAL_BUILD_ROOT = new URL('../modules/garmin-connect/python/android-cffi/', import.meta.url);
const REVIEWED_PACKAGES = new Set([
  "python-garminconnect", "curl-cffi", "requests", "ua-generator", "certifi", "cffi", "pycparser",
  "rich", "markdown-it-py", "mdurl", "pygments", "charset-normalizer", "idna", "urllib3", "chaquopy-libffi",
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
  if (client?.version !== "0.3.17" || client.source.commit !== CLIENT_COMMIT
      || client.source.kind !== 'git' || client.source.url !== 'https://github.com/cyberjunky/python-garminconnect'
      || client.artifact.filename !== `python-garminconnect-${CLIENT_COMMIT}.tar.gz`
      || client.artifact.sha256 !== 'afb02ea1151d8d4c65349255d6556d5fe50b45e34fd92f62dafc57a6206c8dbe') fail("client_commit");
  const curlCffi = lock.packages.find((entry) => entry.name === "curl-cffi");
  if (curlCffi?.version !== "0.15.0" || curlCffi.artifact.filename !== CURL_CFFI_FILENAME) fail("curl_cffi_artifact");
  if (curlCffi.artifact.sha256 !== CURL_CFFI_HASH) fail("curl_cffi_hash");
  const cffi = lock.packages.find((entry) => entry.name === 'cffi');
  if (cffi.version !== '2.1.1' || cffi.artifact.filename !== CFFI_FILENAME) fail('cffi_artifact');
  if (cffi.artifact.sha256 !== CFFI_HASH || cffi.source.kind !== 'cross-build'
      || cffi.source.url !== `local:android-cffi/${CFFI_FILENAME}` || cffi.source.manifest !== 'android-cffi/build-inputs.json'
      || cffi.source.manifestSha256 !== BUILD_MANIFEST_HASH) fail('cffi_provenance');
  const libffi = lock.packages.find((entry) => entry.name === 'chaquopy-libffi');
  if (libffi.version !== '3.3' || libffi.artifact.filename !== LIBFFI_FILENAME || libffi.artifact.sha256 !== LIBFFI_HASH
      || libffi.source.kind !== 'chaquopy' || libffi.source.url !== LIBFFI_URL) fail('libffi_artifact');
  for (const entry of lock.packages) {
    if (path.basename(entry.artifact.filename) !== entry.artifact.filename) fail('artifact_path');
    if (entry.name !== 'python-garminconnect' && !entry.artifact.filename.endsWith('.whl')) fail('native_source');
  }

  return { valid: true, packageCount: REVIEWED_PACKAGES.size };
}

export function artifactUrl(entry, pypiMetadata) {
  if (entry.source.kind === "git") {
    if (typeof entry.source.commit !== "string" || !/^[a-f0-9]{40}$/u.test(entry.source.commit)) fail("client_commit");
    return `${entry.source.url.replace(/\/$/u, "")}/archive/${entry.source.commit}.tar.gz`;
  }
  if (entry.source.kind === 'chaquopy') return entry.source.url;
  const release = pypiMetadata?.urls?.find((candidate) =>
    candidate.filename === entry.artifact.filename
      && candidate.digests?.sha256 === entry.artifact.sha256);
  if (typeof release?.url !== "string" || !release.url.startsWith("https://files.pythonhosted.org/")) {
    fail("artifact_resolution");
  }
  return release.url;
}

export function verifyGarminCrossBuildProvenance(readManifest = () => readFileSync(new URL('build-inputs.json', LOCAL_BUILD_ROOT))) {
  if (createHash('sha256').update(readManifest()).digest('hex') !== BUILD_MANIFEST_HASH) fail('cffi_provenance');
}

export function verifyGarminPythonArtifacts(
  lock,
  artifactsDirectory,
  digestArtifact = (artifactPath) => createHash("sha256").update(readFileSync(artifactPath)).digest("hex"),
) {
  validateGarminPythonLock(lock);
  verifyGarminCrossBuildProvenance();
  const expected = lock.packages.map((entry) => entry.artifact.filename).sort();
  let actual;
  try {
    actual = readdirSync(artifactsDirectory).filter((name) => !name.startsWith(".")).sort();
  } catch {
    fail("artifacts_missing");
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("artifact_set");
  for (const entry of lock.packages) {
    const digest = digestArtifact(path.join(artifactsDirectory, entry.artifact.filename));
    if (digest !== entry.artifact.sha256) fail("artifact_hash");
  }
  return { valid: true, packageCount: expected.length };
}

export async function materializeGarminPythonArtifacts(lock, artifactsDirectory, fetchImpl = fetch,
  digestBytes = (bytes) => createHash('sha256').update(bytes).digest('hex')) {
  validateGarminPythonLock(lock);
  verifyGarminCrossBuildProvenance();
  mkdirSync(artifactsDirectory, { recursive: true });
  for (const entry of lock.packages) {
    const destination = path.join(artifactsDirectory, entry.artifact.filename);
    let currentValid = false;
    try {
      currentValid = digestBytes(readFileSync(destination)) === entry.artifact.sha256;
    } catch {
      currentValid = false;
    }
    if (currentValid) continue;
    const metadata = entry.source.kind === "pypi"
      ? await fetchImpl(`https://pypi.org/pypi/${encodeURIComponent(entry.name)}/${encodeURIComponent(entry.version)}/json`).then((response) => {
        if (!response.ok) fail("artifact_resolution");
        return response.json();
      })
      : undefined;
    let bytes;
    if (entry.source.kind === 'cross-build') {
      bytes = readFileSync(new URL(entry.artifact.filename, LOCAL_BUILD_ROOT));
    } else {
      const response = await fetchImpl(artifactUrl(entry, metadata));
      if (!response.ok) fail("artifact_download");
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (digestBytes(bytes) !== entry.artifact.sha256) fail("artifact_hash");
    const temporary = `${destination}.tmp`;
    try {
      writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
      renameSync(temporary, destination);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  return verifyGarminPythonArtifacts(lock, artifactsDirectory, (file) => digestBytes(readFileSync(file)));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const materialize = args.includes("--materialize");
  const artifactsIndex = args.indexOf("--artifacts-dir");
  const artifactsDirectory = artifactsIndex < 0 ? null : args[artifactsIndex + 1];
  const positionalLock = args.find((value, index) => !value.startsWith("--") && args[index - 1] !== "--artifacts-dir");
  const resolvedLockPath = positionalLock ?? path.join(process.cwd(), "modules/garmin-connect/python/garmin-python-lock.json");
  const lock = JSON.parse(readFileSync(resolvedLockPath, "utf8"));
  const result = materialize
    ? await materializeGarminPythonArtifacts(lock, artifactsDirectory ?? fail("artifacts_missing"))
    : artifactsDirectory === null
      ? validateGarminPythonLock(lock)
      : verifyGarminPythonArtifacts(lock, artifactsDirectory);
  console.log(`Garmin Python lock valid (${result.packageCount} packages).`);
}
