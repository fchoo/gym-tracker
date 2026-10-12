const FORBIDDEN_KEY = /(?:^|_)(?:account(?:_namespace)?|activity_id|authorization|bodyweight|ciphertext|cookie|coordinates?|credentials?|device_serial|di_(?:client_id|refresh_token|token)|email|external_activity_id|file(?:_?name)?|gps|heart_rate|latitude|location|longitude|mfa_code|password|raw_(?:json|payload)|route|secret|serial|sql(?:_params?)?|tokens?|urls?)(?:$|_)/u;
const FORBIDDEN_TEXT = /(?:^|_)(?:account_namespace|authorization|bearer|ciphertext|coordinates?|credentials?|device(?:_serial)?|di_(?:client_id|refresh_token|token)|external_activity_id|file_?names?|filenames?|gps|heart_rate|latitude|location|longitude|mfa_code|password|raw_(?:json|payload)|route|serial|sql(?:_params?)?|tokens?|urls?)(?:$|_)/u;
const FORBIDDEN_LITERAL_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|garmin:[a-f0-9]{32})/iu;
const PRIVATE_FILENAME = /(?:^|[\\/])[^\\/]+\.(?:csv|fit|gpx|json|tcx)(?:$|[?#])/iu;
const BENIGN_FIXED_CODE = /(?<![a-z0-9])(?:PH\d+(?:-[A-Z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)*_(?:cancelled|denied|exceeded|failed|invalid|mismatch|missing|not_run|passed|required|stale|unavailable|unreadable|unsupported))(?![a-z0-9]|\s*[:=])/gu;

function canonicalSnakeCase(value) {
  return value
    .normalize("NFKC")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

function containsForbiddenString(value) {
  if (FORBIDDEN_LITERAL_VALUE.test(value) || PRIVATE_FILENAME.test(value)) return true;
  const withoutFixedCodes = value.replace(BENIGN_FIXED_CODE, " ");
  return FORBIDDEN_TEXT.test(canonicalSnakeCase(withoutFixedCodes));
}

function fail(code, prefix) {
  throw new Error(`${prefix}_${code}`);
}

export function assertPhase18PrivacySafe(
  value,
  {
    prefix = "phase18_privacy",
    context = "",
    allowString = () => false,
  } = {},
) {
  if (typeof value === "string") {
    if (!allowString(value, context) && containsForbiddenString(value)) {
      fail("invalid", prefix);
    }
    return true;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertPhase18PrivacySafe(entry, {
        prefix,
        context: `${context}[${index}]`,
        allowString,
      });
    });
    return true;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(canonicalSnakeCase(key))) fail("invalid", prefix);
      assertPhase18PrivacySafe(entry, {
        prefix,
        context: context.length === 0 ? key : `${context}.${key}`,
        allowString,
      });
    }
  }
  return true;
}

export function assertPhase18PrivateTextSafe(
  text,
  prefix = "phase18_privacy_text",
) {
  if (typeof text !== "string") fail("invalid", prefix);
  if (containsForbiddenString(text)) {
    fail("invalid", prefix);
  }
  return true;
}
