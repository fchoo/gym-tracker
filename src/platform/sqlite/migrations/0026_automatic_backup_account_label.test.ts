import { describe, expect, it } from "@jest/globals";

import { automaticBackupAccountLabelMigration } from "./0026_automatic_backup_account_label";

describe("automatic backup account label migration", () => {
  it("adds only the bounded sanitized account label to the existing state row", async () => {
    const statements: string[] = [];
    await automaticBackupAccountLabelMigration.up({
      execute: async (sql: string) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
      queryAll: async () => [{ account_display_label: "…@example.com" }],
    } as never);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("account_display_label");
    expect(statements[0]).not.toContain("token");
  });
});
