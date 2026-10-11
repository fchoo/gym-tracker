import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPhase18PrivacySafe,
  assertPhase18PrivateTextSafe,
} from "./phase18-privacy-scan.mjs";

test("privacy scanner allows explicit string exceptions and rejects forbidden keys", () => {
  assert.equal(
    assertPhase18PrivacySafe(
      { safe: "/allowed/report.json" },
      { context: "root", allowString: (value, context) => context === "root.safe" && value === "/allowed/report.json" },
    ),
    true,
  );
  assert.throws(
    () => assertPhase18PrivacySafe({ access_token: "ok" }, { prefix: "phase18_privacy" }),
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
