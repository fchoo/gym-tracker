import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mandatory v1.2 Maestro deep links have source-owned registered routes", () => {
  const layout = readFileSync("app/_layout.tsx", "utf8");
  const route = readFileSync("app/native-acceptance/[shard].tsx", "utf8");
  const fixtureSource = readFileSync("src/testing/v12NativeAcceptanceFixture.tsx", "utf8");
  for (const shard of ["multi-plan", "workout", "library-running"]) {
    const flow = readFileSync(`maestro/v1.2/${shard}.yaml`, "utf8");
    assert.match(flow, new RegExp(`gymtracker-devtest:///native-acceptance/${shard}\\?case=\\$\\{V12_CASE_ID\\}&fixture=\\$\\{V12_FIXTURE_ID\\}`, "u"));
    assert.match(flow, /openLink: "\$\{V12_PRODUCT_URL\}"/u);
    assert.match(flow, /V12_PRODUCT_RESULT_(?:KIND|VALUE)/u);
    if (shard === "multi-plan") {
      assert.match(flow, /V12_PRODUCT_INTERACTION == 'domain-observation'/u);
      assert.match(flow, /V12_PRODUCT_ACTION_KIND == 'none'/u);
      assert.doesNotMatch(flow, /tapOn:.*V12_PRODUCT_ACTION/u);
    } else {
      assert.match(flow, /V12_PRODUCT_INTERACTION == 'tap'/u);
      assert.match(flow, /tapOn:.*V12_PRODUCT_ACTION_VALUE/u);
    }
    assert.match(flow, /mode=receipt/u);
    assert.doesNotMatch(flow, /native-acceptance-execute|native-acceptance-stage/u);
  }
  assert.match(layout, /native-acceptance\/\[shard\]/u);
  assert.match(route, /V12NativeAcceptanceReceipt/u);
  assert.match(fixtureSource, /native-acceptance-stage/u);
});
