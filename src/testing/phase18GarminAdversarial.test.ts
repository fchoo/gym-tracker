import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

import {
  PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
  PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
  phase18GarminAdversarialEnabled,
  runPhase18GarminAdversarialHostSuite,
} from "./phase18GarminAdversarial";

const HASH = /^[a-f0-9]{64}$/u;
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

describe("Phase 18 Garmin adversarial lifecycle harness", () => {
  it("requires the exact development-test suite and confirmation", () => {
    const exact = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase18-garmin-adversarial",
      confirmation: PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
    };
    expect(phase18GarminAdversarialEnabled(exact)).toBe(true);
    for (const changed of [
      { ...exact, buildProfile: "production" },
      { ...exact, nativeContractsEnabled: false },
      { ...exact, suite: "phase18-garmin-proof" },
      { ...exact, confirmation: "wrong" },
    ]) expect(phase18GarminAdversarialEnabled(changed)).toBe(false);
  });

  it("restores, rotates, reads, logs out, restarts signed out, and fences late work", async () => {
    const report = await runPhase18GarminAdversarialHostSuite({ sha256 });
    expect(report.status).toBe("host-ready-native-deferred");
    expect(report.cases.map(({ id }) => id)).toEqual(PHASE18_GARMIN_ADVERSARIAL_CASE_IDS);

    const lifecycle = report.cases.slice(0, 6);
    expect(lifecycle.map(({ id }) => id)).toEqual([
      "PH18-ADV-RESTORE",
      "PH18-ADV-REFRESH",
      "PH18-ADV-READ",
      "PH18-ADV-LOGOUT",
      "PH18-ADV-RESTART",
      "PH18-ADV-LATE-GENERATION",
    ]);
    expect(lifecycle.every(({ status }) => status === "passed")).toBe(true);

    const restore = lifecycle[0]!;
    const refresh = lifecycle[1]!;
    const read = lifecycle[2]!;
    const logout = lifecycle[3]!;
    const restart = lifecycle[4]!;
    const late = lifecycle[5]!;
    expect(restore).toMatchObject({
      code: "completed",
      connection_state: "connected",
      sync_state: "idle",
      call_count: 1,
      automatic_retry_count: 0,
    });
    expect(refresh).toMatchObject({
      code: "completed",
      connection_state: "connected",
      sync_state: "success",
      call_count: 1,
      automatic_retry_count: 0,
    });
    expect(read).toMatchObject({
      code: "completed",
      connection_state: "connected",
      sync_state: "success",
      call_count: 4,
      automatic_retry_count: 0,
    });
    expect(refresh.session_digest).not.toBe(restore.session_digest);
    expect(read.session_digest).toBe(refresh.session_digest);

    expect(logout).toMatchObject({
      code: "completed",
      connection_state: "disconnected",
      sync_state: "idle",
      call_count: 1,
      automatic_retry_count: 0,
    });
    expect(logout.generation_after).toBeGreaterThan(logout.generation_before);
    expect(restart).toMatchObject({
      code: "sign_in_required",
      connection_state: "sign-in-required",
      sync_state: "idle",
      call_count: 1,
      automatic_retry_count: 0,
    });
    expect(restart.session_digest).not.toBe(refresh.session_digest);
    expect(late).toMatchObject({
      code: "stale_generation",
      connection_state: "disconnected",
      sync_state: "failure-stale-generation",
      call_count: 1,
      automatic_retry_count: 0,
    });

    for (const entry of lifecycle) {
      expect(entry.history_digest).toBe(restore.history_digest);
      expect(entry.source_digest).toBe(restore.source_digest);
      expect(entry.match_digest).toBe(restore.match_digest);
      expect(entry.history_digest).toMatch(HASH);
      expect(entry.session_digest).toMatch(HASH);
    }
  });

  it("keeps the guarded route deterministic and isolated from the real native adapter", () => {
    const route = readFileSync("app/__phase18-garmin-adversarial.tsx", "utf8");
    const layout = readFileSync("app/_layout.tsx", "utf8");
    expect(route).toContain("phase18GarminAdversarialEnabled");
    expect(route).toContain("runPhase18GarminAdversarialHostSuite");
    expect(route).toContain("host-ready-native-deferred");
    expect(route).not.toMatch(/getGarminConnectNativeModule|GARMIN_EMAIL|GARMIN_PASSWORD|GARMIN_MFA/iu);
    expect(layout).toContain('nativeContractSuite === "phase18-garmin-adversarial"');
    expect(layout).toContain('pathname === "/__phase18-garmin-adversarial"');
  });

  it("reduces every injected provider and session failure exactly once without losing prior facts", async () => {
    const report = await runPhase18GarminAdversarialHostSuite({ sha256 });
    const injected = report.cases.slice(6);
    expect(injected.map(({ id }) => id)).toEqual([
      "PH18-ADV-403",
      "PH18-ADV-429",
      "PH18-ADV-OFFLINE",
      "PH18-ADV-TIMEOUT",
      "PH18-ADV-5XX",
      "PH18-ADV-MALFORMED",
      "PH18-ADV-OVERSIZED",
      "PH18-ADV-MISSING-COMPONENT",
      "PH18-ADV-PARTIAL-PAGE",
      "PH18-ADV-ROTATION",
    ]);
    expect(injected.map(({ code }) => code)).toEqual([
      "data_access_denied",
      "rate_limited",
      "offline",
      "timeout",
      "temporary_failure",
      "malformed_response",
      "malformed_response",
      "malformed_response",
      "temporary_failure",
      "stale_generation",
    ]);
    expect(injected.map(({ call_count }) => call_count)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 3, 5, 3,
    ]);
    expect(injected.every(({ status }) => status === "passed")).toBe(true);
    expect(injected.every(({ provenance }) => provenance === "expected-injected")).toBe(true);
    expect(injected.every(({ automatic_retry_count }) => automatic_retry_count === 0)).toBe(true);
    expect(injected.every(({ source_write_count }) => source_write_count === 0)).toBe(true);
    expect(injected.every(({ connection_state }) => connection_state === "connected")).toBe(true);
    expect(injected[1]).toMatchObject({
      retry_after_ms: 900_000,
      sync_state: "failure-rate-limited",
    });
    expect(injected[8]).toMatchObject({
      retry_after_ms: 0,
      sync_state: "partial-temporary-failure",
    });

    const baseline = injected[0]!;
    for (const entry of injected) {
      expect(entry.session_digest).toBe(baseline.session_digest);
      expect(entry.history_digest).toBe(baseline.history_digest);
      expect(entry.source_digest).toBe(baseline.source_digest);
      expect(entry.match_digest).toBe(baseline.match_digest);
      expect(entry.generation_after).toBe(entry.generation_before);
    }
  });
});
