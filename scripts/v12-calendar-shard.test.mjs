import assert from "node:assert/strict";
import test from "node:test";

import { executeV12CalendarShard, validateV12CalendarShard } from "./v12-calendar-shard.mjs";

const observation = Object.freeze({
  sourceDigest: "a".repeat(64),
  nativeExecution: "NOT_RUN",
  samples: [
    { timestampMs: 1, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
    { timestampMs: 2, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
  ],
});

test("Calendar shard preserves source observations and defers verdicts", () => {
  assert.deepEqual(validateV12CalendarShard(observation), { status: "NOT_RUN", caseCount: 9 });
  assert.deepEqual(executeV12CalendarShard(observation), { producer: "v12-calendar-shard/v1", status: "NOT_RUN", observations: observation });
});

test("Calendar shard rejects final-only, stale callback, translation drift, and final verdict inputs", () => {
  assert.throws(() => validateV12CalendarShard({ ...observation, samples: [observation.samples[0]] }), /calendar_intermediate_samples_required/);
  assert.throws(() => validateV12CalendarShard({ ...observation, samples: observation.samples.map((sample) => ({ ...sample, callbackCount: 0 })) }), /calendar_callback_invalid/);
  assert.throws(() => validateV12CalendarShard({ ...observation, samples: observation.samples.map((sample) => ({ ...sample, translationDp: 97 })) }), /calendar_translation_invalid/);
  assert.throws(() => executeV12CalendarShard({ ...observation, finalVerdict: "PASS" }), /calendar_final_verdict_forbidden/);
});
