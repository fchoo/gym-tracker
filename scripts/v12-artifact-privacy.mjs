import path from "node:path";

const TEXT_EXTENSIONS = new Set([".csv", ".json", ".log", ".md", ".txt", ".xml", ".yaml", ".yml"]);
const FORBIDDEN_KEY = /(?:^|_)(?:access_token|account_namespace|auth|authorization|bodyweight(?:_kg)?|cookie|credentials?|device_serial|email|gps(?:_samples?)?|heart_rate|hr_samples?|latitude|longitude|mfa_code|password|personal_filename|polyline|raw_(?:body|json|payload|request|response)|refresh_token|route(?:_coordinates|_data|_points|_samples)?|secret|serial(?:_number)?|source_rows?|sql_(?:args|bindings|params)|token)(?:$|_)/u;
const FORBIDDEN_TEXT = /(?:authorization\s*:\s*(?:bearer|basic)|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\b(?:access_token|bodyweight(?:_kg)?|credentials?|gps(?:_samples?)?|heart_rate|hr_samples?|mfa_code|password|raw_(?:body|json|payload|request|response)|refresh_token|source_rows?|sql_(?:args|bindings|params))\s*[:=]|<(?:coordinates?|gps|heart[_-]?rate|route|source[_-]?rows?)(?:\s|>)|\b(?:latitude|longitude)\s*[:=])/iu;
const PRIVATE_LOCATION = /(?:file:\/\/|content:\/\/|(?:^|[\s"'(=])(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)|(?:^|[\s"'(=])[^\s"')]+\.(?:fit|gpx|tcx)(?:$|[\s"')?#]))/iu;
const JWT = /(?:^|\s|["'=])eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}(?:$|\s|["'])/u;
const SAFE_AGGREGATE_KEY = /^(?:route_callback_receipt_sha256|route_point_count)$/u;

function fail() {
  throw new Error("v12_artifact_privacy_invalid");
}

function canonicalKey(value) {
  return value
    .normalize("NFKC")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

function assertSafeText(value) {
  if (FORBIDDEN_TEXT.test(value) || PRIVATE_LOCATION.test(value) || JWT.test(value)) fail();
}

export function assertV12PrivacySafeValue(value) {
  if (typeof value === "string") {
    assertSafeText(value);
    return true;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertV12PrivacySafeValue(item);
    return true;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const canonical = canonicalKey(key);
      if (!SAFE_AGGREGATE_KEY.test(canonical) && FORBIDDEN_KEY.test(canonical)) fail();
      assertV12PrivacySafeValue(child);
    }
  }
  return true;
}

export function assertV12ArtifactPrivacySafe(artifact, bytes) {
  if (typeof artifact !== "string" || artifact.length === 0 || path.isAbsolute(artifact)
    || artifact.includes("\\") || path.posix.normalize(artifact) !== artifact
    || artifact.split("/").some(part => !part || part === "." || part === "..")
    || !Buffer.isBuffer(bytes)) fail();
  if (!TEXT_EXTENSIONS.has(path.extname(artifact).toLowerCase())) return true;
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").length !== bytes.length || text.includes("\uFFFD")) fail();
  if (path.extname(artifact).toLowerCase() === ".json") {
    let value;
    try { value = JSON.parse(text); } catch { fail(); }
    return assertV12PrivacySafeValue(value);
  }
  assertSafeText(text);
  return true;
}
