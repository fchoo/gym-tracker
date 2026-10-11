import { describe, expect, it } from "@jest/globals";

import {
  LOGICAL_BACKUP_FORMAT_VERSION,
  logicalBackupTablesForVersion,
} from "../../src/domains/portability/backupContracts";

describe("multi-plan portability successor boundary", () => {
  it("keeps every pre-schema-40 archive graph frozen while v7 owns complete source replay", () => {
    const v5 = logicalBackupTablesForVersion(5);
    const current = logicalBackupTablesForVersion(LOGICAL_BACKUP_FORMAT_VERSION);

    expect(LOGICAL_BACKUP_FORMAT_VERSION).toBe(9);
    expect(v5).not.toEqual(expect.arrayContaining([
      "imported_activity_identities",
      "workout_session_schedule_links",
      "running_activity_match_events",
    ]));
    expect(current).toEqual(expect.arrayContaining([
      "imported_activity_identities",
      "imported_activity_events",
      "imported_activity_match_invalidations",
      "workout_session_schedule_links",
      "workout_schedule_reconciliation_receipts",
      "workout_completed_set_correction_receipts",
      "running_activity_match_events",
      "running_activity_match_receipts",
      "bodyweight_entry_events",
      "running_session_roots",
      "running_session_slot_roots",
      "running_session_slot_revisions",
      "running_session_slots",
      "running_plan_receipts",
      "running_plan_events",
      "imported_activity_revision_proposals",
      "imported_activity_revision_decisions",
    ]));
    expect(current).not.toEqual(expect.arrayContaining([
      "running_current_matches",
      "running_activity_current_matches",
      "imported_activity_current_lifecycle",
    ]));
    expect(logicalBackupTablesForVersion(7)).toEqual(expect.arrayContaining([
      "schedule_collision_outcomes",
      "schedule_collision_receipts",
      "schedule_collision_projections",
    ]));
  });
});
