import assert from "node:assert/strict";
import test from "node:test";

import {
  executeV12CalendarShard,
  executeV12CalendarShardCli,
  parseV12CalendarShardCliArgs,
  validateV12CalendarShard,
  V12_CALENDAR_SHARD_STAGE_IDS,
} from "./v12-calendar-shard.mjs";
import { createV12CalendarObservationResult } from "./testing/v12-calendar-observation-fixture.mjs";

const observation = Object.freeze({
  sourceDigest: "a".repeat(64),
  nativeExecution: "NOT_RUN",
  samples: [
    { timestampMs: 1, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
    { timestampMs: 2, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
  ],
});

test("Calendar shard rejects the retired generic observation envelope", () => {
  assert.throws(() => validateV12CalendarShard(observation), /calendar_native_stages_invalid/u);
  assert.throws(() => executeV12CalendarShard(observation), /calendar_native_stages_invalid/u);
});

test("Calendar shard rejects producer verdicts and sample-only evidence", () => {
  assert.throws(() => validateV12CalendarShard({ ...observation, finalVerdict: "PASS" }), /calendar_native_stages_invalid/u);
  assert.throws(() => validateV12CalendarShard({ samples: observation.samples }), /calendar_native_stages_invalid/u);
});

test("Calendar shard writes the exact stage-specific host-derived observation set", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const flowSha256 = "9".repeat(64);
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const writes = new Map();
  const result = await executeV12CalendarShardCli(["--run", runId, "--execute"], {
    root: "/fixture-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
    isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
    snapshotSettings: () => ({}), restoreSettings: () => true, executeNative: () => createV12CalendarObservationResult(flowSha256),
    writeImmutable: (file, value) => writes.set(file, value), outputExists: () => false,
  });
  assert.deepEqual(result, { ok: true, mode: "execute", run_id: runId });
  assert.equal(writes.size, 2);
  assert.match(JSON.stringify(writes.get(`artifacts/native/v1.2/${runId}/calendar-transitions.json`)), /v12-calendar-shard\/v4/u);
  assert.doesNotMatch(JSON.stringify([...writes.values()]), /expected_outcome|synthetic/u);
});

test("Calendar shard exposes exhaustive stage order and strict immutable CLI arguments", () => {
  assert.deepEqual(V12_CALENDAR_SHARD_STAGE_IDS, [
    "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
    "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
    "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
    "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
    "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
    "second-input-interrupt", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row",
    "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month",
    "rapid-reverse-input", "rotation-during-transition", "background-during-transition", "reduced-motion", "dev-01-padding", "dev-02-light-title",
  ]);
  assert.deepEqual(
    parseV12CalendarShardCliArgs(["--run", "phase20-20261014T031137Z-5917481c1fd1", "--execute"]),
    { runId: "phase20-20261014T031137Z-5917481c1fd1", mode: "execute" },
  );
  assert.throws(() => parseV12CalendarShardCliArgs(["--run", "bad", "--execute"]), /calendar_cli_invalid/);
});

test("Calendar shard rejects the legacy homogeneous pointer receipt for all stage groups", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const flowSha256 = "9".repeat(64);
  const receipt = (id, status = "PASS") => ({
    content_width_dp: 400, start_dp: [300, 180], end_dp: [200, 180], dx_dp: -100, dy_dp: 0,
    event_sequence: ["pointer-down", "pointer-move", "pointer-up"], cancelled: false, settled: status !== "NOT_RUN",
    callback_count: 1, semantic_transition: { pre: "month", during: "dragging", post: "month" },
    screenshot_sha256: "1".repeat(64), trace_sha256: "2".repeat(64), expected_outcome: id,
  });
  const native = {
    flow_sha256: flowSha256,
    flow_revision: "calendar-flow-r35",
    stages: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({
      id, order, status: "NOT_RUN", samples: [
        { timestampMs: order * 2 + 1, widthDp: 400, dxDp: id.includes("25") ? -100 : -40, dyDp: 0, intentOwner: "horizontal", translationDp: id.includes("25") ? -100 : -40, title: "synthetic", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "synthetic-week", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "synthetic-focus", motion: id === "reduced-motion" ? "reduced" : "normal" },
        { timestampMs: order * 2 + 2, widthDp: 400, dxDp: id.includes("25") ? -100 : -40, dyDp: 0, intentOwner: "horizontal", translationDp: id.includes("25") ? -100 : -40, title: "synthetic", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "synthetic-week", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "synthetic-focus", motion: id === "reduced-motion" ? "reduced" : "normal" },
      ],
      receipt: receipt(id),
    })),
    junit_cases: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({ id, order, status: "NOT_RUN" })),
  };
  const writes = new Map();
  await assert.rejects(executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256: "9".repeat(64), readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
    isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
    snapshotSettings: () => ({}), restoreSettings: () => true, executeNative: () => native,
    writeImmutable: (file, value) => writes.set(file, value), outputExists: () => false,
  }), /calendar_native_stages_invalid/u);
  assert.equal(writes.size, 1);
  const malformed = structuredClone(native);
  malformed.stages[1].id = malformed.stages[0].id;
  await assert.rejects(
    executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => malformed, writeImmutable: () => {}, outputExists: () => false,
    }),
    /calendar_native_stages_invalid/,
  );
  const injected = structuredClone(native);
  injected.stages[0].samples[0].injected = true;
  await assert.rejects(
    executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => injected, writeImmutable: () => {}, outputExists: () => false,
    }),
    /calendar_native_stages_invalid/,
  );
});

test("Calendar shard rejects visibility-only stages that do not carry an executed flow-bound receipt", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const flowSha256 = "9".repeat(64);
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const visibilityOnly = {
    stages: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({
      id,
      order,
      status: "PASS",
      samples: [
        { timestampMs: order * 2 + 1, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "visible", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "week", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar", motion: "normal" },
        { timestampMs: order * 2 + 2, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "visible", selectedCivilDate: "2026-11-01", generation: 2, focusedWeek: "week", rowBounds: [0, 64], callbackCount: 2, focusIdentity: "calendar", motion: "normal" },
      ],
    })),
  };
  await assert.rejects(
    executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => visibilityOnly, writeImmutable: () => {}, outputExists: () => false,
    }),
    /calendar_native_stages_invalid/u,
  );
});
