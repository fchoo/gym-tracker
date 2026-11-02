import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  RECOMMENDATION_DECISION_RECEIPT_TABLES,
  recommendationDecisionReceiptsMigration,
} from "../../platform/sqlite/migrations/0045_recommendation_decision_receipts";

describe("Phase 19 integrity coverage", () => {
  it("fails migration verification when either immutable receipt table is absent", async () => {
    const queryAll = jest.fn(async () => [{
      name: RECOMMENDATION_DECISION_RECEIPT_TABLES[0],
    }]);

    await expect(recommendationDecisionReceiptsMigration.verify({ queryAll } as never))
      .rejects.toThrow("recommendation_decision_receipts_schema_incomplete");
  });
});
