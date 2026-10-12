import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPhase18PrivacySafe,
  assertPhase18PrivateTextSafe,
} from "./phase18-privacy-scan.mjs";

const STRUCTURED_KEY_FAMILIES = Object.freeze({
  snake_case: [
    "account_namespace",
    "external_activity_id",
    "heart_rate",
    "device_serial",
    "raw_json",
    "raw_payload",
    "route_coordinates",
    "gps_location",
    "sql_params",
    "file_name",
    "access_token",
  ],
  camelCase: [
    "accountNamespace",
    "externalActivityId",
    "heartRate",
    "deviceSerial",
    "rawJson",
    "rawPayload",
    "routeCoordinates",
    "gpsLocation",
    "sqlParams",
    "fileName",
    "accessToken",
  ],
  PascalCase: [
    "AccountNamespace",
    "ExternalActivityId",
    "HeartRate",
    "DeviceSerial",
    "RawJSON",
    "RawPayload",
    "RouteCoordinates",
    "GPSLocation",
    "SQLParams",
    "FileName",
    "AccessToken",
  ],
  "kebab-case": [
    "account-namespace",
    "external-activity-id",
    "heart-rate",
    "device-serial",
    "raw-json",
    "raw-payload",
    "route-coordinates",
    "gps-location",
    "sql-params",
    "file-name",
    "access-token",
  ],
  "spaced words": [
    "account namespace",
    "external activity id",
    "heart rate",
    "device serial",
    "raw json",
    "raw payload",
    "route coordinates",
    "gps location",
    "sql params",
    "file name",
    "access token",
  ],
});

const LOG_TEXT_FAMILIES = Object.freeze({
  snake_case: [
    "account_namespace=owner",
    "external_activity_id=42",
    "heart_rate=151",
    "device_serial=private-device",
    "raw_json={private}",
    "raw_payload={private}",
    "route_coordinates=private",
    "gps_location=private",
    "sql_params=private",
    "file_name=private.fit",
    "access_token=private",
  ],
  camelCase: [
    "accountNamespace=owner",
    "externalActivityId=42",
    "heartRate=151",
    "deviceSerial=private-device",
    "rawJson={private}",
    "rawPayload={private}",
    "routeCoordinates=private",
    "gpsLocation=private",
    "sqlParams=private",
    "fileName=private.fit",
    "accessToken=private",
  ],
  PascalCase: [
    "AccountNamespace=owner",
    "ExternalActivityId=42",
    "HeartRate=151",
    "DeviceSerial=private-device",
    "RawJSON={private}",
    "RawPayload={private}",
    "RouteCoordinates=private",
    "GPSLocation=private",
    "SQLParams=private",
    "FileName=private.fit",
    "AccessToken=private",
  ],
  "kebab-case": [
    "account-namespace=owner",
    "external-activity-id=42",
    "heart-rate=151",
    "device-serial=private-device",
    "raw-json={private}",
    "raw-payload={private}",
    "route-coordinates=private",
    "gps-location=private",
    "sql-params=private",
    "file-name=private.fit",
    "access-token=private",
  ],
  "spaced words": [
    "account namespace owner",
    "external activity id 42",
    "heart rate 151",
    "device serial private-device",
    "raw JSON private",
    "raw payload private",
    "route coordinates private",
    "GPS location private",
    "SQL params private",
    "file name private.fit",
    "access token private",
  ],
});

test("privacy scanner rejects sensitive structured keys across spelling families", () => {
  for (const [family, keys] of Object.entries(STRUCTURED_KEY_FAMILIES)) {
    for (const key of keys) {
      assert.throws(
        () => assertPhase18PrivacySafe({ [key]: "private" }, { prefix: "phase18_privacy" }),
        /phase18_privacy_invalid/u,
        `${family}:${key}`,
      );
    }
  }
  for (const key of [
    "route",
    "latitude",
    "longitude",
    "gps",
    "location",
    "coordinate",
    "credentials",
    "token",
    "sql",
    "filename",
    "url",
  ]) {
    assert.throws(
      () => assertPhase18PrivacySafe({ [key]: "private" }, { prefix: "phase18_privacy" }),
      /phase18_privacy_invalid/u,
      key,
    );
  }
});

test("private text scanner rejects sensitive log terms across spelling families", () => {
  for (const [family, vectors] of Object.entries(LOG_TEXT_FAMILIES)) {
    for (const vector of vectors) {
      assert.throws(
        () => assertPhase18PrivateTextSafe(vector),
        /phase18_privacy_text_invalid/u,
        `${family}:${vector}`,
      );
    }
  }
  for (const vector of [
    "route=[private]",
    "latitude=1",
    "longitude=2",
    "GPS=private",
    "location=private",
    "coordinate=private",
    "credentials=private",
    "token=private",
    "token_invalid=private",
    "credentials_unavailable: private",
    "SQL=private",
    "filename=private.fit",
    "URL=https://private.example/export",
    "private-activity.fit",
  ]) {
    assert.throws(
      () => assertPhase18PrivateTextSafe(vector),
      /phase18_privacy_text_invalid/u,
      vector,
    );
  }
});

test("privacy scanners allow explicit string exceptions and benign fixed codes", () => {
  assert.equal(
    assertPhase18PrivacySafe(
      { safe: "/allowed/report.json" },
      { context: "root", allowString: (value, context) => context === "root.safe" && value === "/allowed/report.json" },
    ),
    true,
  );
  assert.equal(
    assertPhase18PrivacySafe({
      error_code: "phase18_garmin_token_invalid",
      result_code: "phase18_credentials_unavailable",
      status_code: "PH18-PRIVACY-PASSED",
    }),
    true,
  );
  assert.equal(assertPhase18PrivateTextSafe("status=phase18_garmin_token_invalid"), true);
  assert.equal(assertPhase18PrivateTextSafe("phase18_credentials_unavailable"), true);
  assert.equal(assertPhase18PrivateTextSafe("phase18_sql_invalid"), true);
  assert.equal(assertPhase18PrivateTextSafe("PH18-PRIVACY-PASSED"), true);
  assert.equal(assertPhase18PrivateTextSafe("code=token_invalid"), true);
  assert.equal(assertPhase18PrivateTextSafe("credentials_unavailable"), true);
  assert.equal(assertPhase18PrivateTextSafe("sql_invalid"), true);
});

test("privacy scanner recursively validates arrays, objects, and primitive facts", () => {
  assert.equal(
    assertPhase18PrivacySafe([
      null,
      true,
      42,
      { summary: "aggregate facts only" },
    ]),
    true,
  );
  assert.throws(
    () => assertPhase18PrivacySafe({ note: "heartRate=151" }),
    /phase18_privacy_invalid/u,
  );
});

test("private text scanner rejects forbidden content and non-string input", () => {
  assert.equal(assertPhase18PrivateTextSafe("aggregate summary only"), true);
  assert.throws(
    () => assertPhase18PrivateTextSafe("see https://private.example/export.json"),
    /phase18_privacy_text_invalid/u,
  );
  assert.throws(
    () => assertPhase18PrivateTextSafe(123),
    /phase18_privacy_text_invalid/u,
  );
});
