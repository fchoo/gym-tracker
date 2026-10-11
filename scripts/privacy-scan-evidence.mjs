const FORBIDDEN_KEY = /(?:^|_)(?:account(?:_namespace)?|activity_id|authorization|bodyweight|ciphertext|cookie|credentials?|device_serial|di_(?:client_id|refresh_token|token)|email|external_activity_id|file(?:name)?|heart_rate|latitude|longitude|mfa_code|password|raw_json|route|secret|serial|sql_params?|token|url)(?:$|_)/iu;
const FORBIDDEN_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\baccount_namespace\b|\bauthorization\b|\bbearer\b|\bciphertext\b|\bcredentials?\b|\bdevice(?:_serial)?\b|\bdi_(?:client_id|refresh_token|token)\b|\bmfa(?:[_ -]?code)\b|\bpassword\b|\bserial\b|\btoken\b|garmin:[a-f0-9]{32})/iu;
const PRIVATE_FILENAME = /(?:^|[\\/])[^\\/]+\.(?:csv|fit|gpx|json|tcx)(?:$|[?#])/iu;

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
    if (!allowString(value, context) && (FORBIDDEN_VALUE.test(value) || PRIVATE_FILENAME.test(value))) {
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
      if (FORBIDDEN_KEY.test(key)) fail("invalid", prefix);
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
  if (FORBIDDEN_VALUE.test(text) || PRIVATE_FILENAME.test(text)) {
    fail("invalid", prefix);
  }
  return true;
}
