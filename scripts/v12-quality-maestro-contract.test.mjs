import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("packaged Maestro quality probe carries the complete request and waits for route readiness", () => {
  const flow = readFileSync("maestro/v1.2/phase20-quality-probe.yaml", "utf8");
  assert.match(flow, /PHASE20_QUALITY_OPERATION != null/u);
  assert.match(flow, /PHASE20_QUALITY_SEQUENCE != null/u);
  assert.match(flow, /operation=\$\{PHASE20_QUALITY_OPERATION\}/u);
  assert.match(flow, /sequence=\$\{PHASE20_QUALITY_SEQUENCE\}/u);
  assert.match(flow, /id: "phase20-quality-probe"/u);
  assert.doesNotMatch(flow, /What are you training for\?/u);
});
