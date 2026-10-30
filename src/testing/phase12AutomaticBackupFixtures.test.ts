import { describe, expect, it } from "@jest/globals";
import { PHASE12_AUTOMATIC_BACKUP_FIXTURES } from "./phase12AutomaticBackupFixtures";
describe("Phase 12 automatic backup fixtures", () => {
  it("contain only bounded synthetic presentation inputs", () => {
    const text = JSON.stringify(PHASE12_AUTOMATIC_BACKUP_FIXTURES);
    expect(Object.keys(PHASE12_AUTOMATIC_BACKUP_FIXTURES)).toHaveLength(18);
    expect(text).not.toMatch(/token|@|drive\.google|com\.fchoo\.gymtracker"/iu);
  });
});
