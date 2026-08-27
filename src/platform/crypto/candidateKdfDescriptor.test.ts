import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  CandidateKdfDescriptorError,
  assertCandidateKdfDescriptorMatchesBuild,
  parseCandidateKdfDescriptor,
} from "./candidateKdfDescriptor";

const buildManifest = {
  schema_version: 1,
  suite: "phase1",
  profile: "development-test",
  build_variant: "release",
  js_bundle: {
    embedded: true,
  },
  base_head: "a".repeat(40),
  source_tree_sha256: "b".repeat(64),
  package: "com.fchoo.gymtracker.devtest",
  apk: {
    path: "artifacts/native/argon2/gym-tracker-argon2-devtest.apk",
    sha256: "c".repeat(64),
    size_bytes: 123_456,
    page_alignment_kib: 16,
    page_alignment_verified: true,
  },
  device: {
    serial: "emulator-5554",
    api: 36,
    abi: "arm64-v8a",
    model: "sdk_gphone64_arm64",
    android_release: "16",
  },
};

const candidate = {
  schemaVersion: 2,
  status: "passed",
  failureCode: null,
  baseHead: buildManifest.base_head,
  sourceTreeSha256: buildManifest.source_tree_sha256,
  apk: {
    path: buildManifest.apk.path,
    sha256: buildManifest.apk.sha256,
    sizeBytes: buildManifest.apk.size_bytes,
  },
  package: buildManifest.package,
  algorithm: "argon2id",
  provider: {
    name: "Bouncy Castle",
    version: "1.85.2",
    mavenCoordinate: "org.bouncycastle:bcprov-jdk18on:1.85.2",
  },
  parameterBounds: {
    memoryKiB: { min: 19_456, max: 19_456 },
    iterations: { min: 2, max: 2 },
    parallelism: { min: 1, max: 1 },
    saltBytes: { min: 16, max: 16 },
    outputBytes: { min: 32, max: 32 },
  },
  kat: {
    id: "owasp-floor-bc-1.85.2-v1",
    passed: true,
  },
  feasibilityTiming: {
    sampleCount: 3,
    samplesMs: [280, 300, 320],
    minMs: 280,
    medianMs: 300,
    maxMs: 320,
  },
  device: {
    kind: "emulator",
    serial: buildManifest.device.serial,
    api: buildManifest.device.api,
    abi: buildManifest.device.abi,
    model: buildManifest.device.model,
    androidRelease: buildManifest.device.android_release,
  },
  cng: {
    cleanPrebuilds: 2,
    autolinked: true,
  },
  pageSize: {
    alignmentKiB: 16,
    zipalignVerified: true,
    packagedLibrariesInspected: true,
  },
  physicalDeviceCalibration: {
    status: "deferred-to-01-10",
    requiredSamples: 10,
    targetMinMs: 250,
    targetMaxMs: 750,
    parameters: null,
    timing: null,
    device: null,
  },
  generatedAt: "2026-08-16T03:30:00.000Z",
};

const physicalCalibration = {
  status: "passed",
  requiredSamples: 10,
  targetMinMs: 250,
  targetMaxMs: 750,
  parameters: {
    memoryKiB: 19_456,
    iterations: 2,
    parallelism: 1,
  },
  timing: {
    sampleCount: 10,
    samplesMs: [280, 290, 300, 310, 320, 330, 340, 350, 360, 370],
    minMs: 280,
    medianMs: 330,
    maxMs: 370,
  },
  device: {
    serialHash: "d".repeat(64),
    api: 35,
    abi: "arm64-v8a",
    model: "Pixel 8",
    androidRelease: "15",
    freeMemoryBytes: 4_000_000_000,
  },
};

function mutateCandidate(
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const clone = structuredClone(candidate) as Record<string, unknown>;
  let parent = clone;
  for (const segment of path.slice(0, -1)) {
    parent = parent[segment] as Record<string, unknown>;
  }
  parent[path.at(-1)!] = value;
  return clone;
}

describe("CandidateKdfDescriptor", () => {
  it("accepts the versioned bounded emulator feasibility contract", () => {
    const parsed = parseCandidateKdfDescriptor(candidate);

    expect(parsed).toEqual(candidate);
    expect(() => (
      assertCandidateKdfDescriptorMatchesBuild(parsed, buildManifest)
    )).not.toThrow();
  });

  it("accepts completed physical calibration with hashed device identity", () => {
    const physical = {
      ...candidate,
      physicalDeviceCalibration: physicalCalibration,
    };

    expect(parseCandidateKdfDescriptor(physical)).toEqual(physical);
  });

  it.each([
    ["unknown fields", { ...candidate, password: "sensitive" }],
    ["unsupported version", { ...candidate, schemaVersion: 3 }],
    [
      "provider drift",
      {
        ...candidate,
        provider: {
          ...candidate.provider,
          version: "1.85.1",
        },
      },
    ],
    [
      "unbounded memory",
      {
        ...candidate,
        parameterBounds: {
          ...candidate.parameterBounds,
          memoryKiB: { min: 19_456, max: 262_144 },
        },
      },
    ],
    [
      "fabricated physical device evidence",
      {
        ...candidate,
        physicalDeviceCalibration: {
          ...candidate.physicalDeviceCalibration,
          status: "passed",
        },
      },
    ],
  ])("rejects %s", (_label, invalidCandidate) => {
    expect(() => parseCandidateKdfDescriptor(invalidCandidate)).toThrow(
      expect.objectContaining({
        code: "candidate_kdf_descriptor_invalid",
      }),
    );
  });

  it("rejects a descriptor bound to different APK bytes", () => {
    const parsed = parseCandidateKdfDescriptor(candidate);

    expect(() => (
      assertCandidateKdfDescriptorMatchesBuild(parsed, {
        ...buildManifest,
        apk: {
          ...buildManifest.apk,
          sha256: "d".repeat(64),
        },
      })
    )).toThrow(expect.objectContaining({
      code: "candidate_kdf_descriptor_invalid",
    }));
  });

  it.each([
    ["primitive", null],
    ["array", []],
    ["missing field", Object.fromEntries(
      Object.entries(candidate).filter(([key]) => key !== "algorithm"),
    )],
    ["invalid status", mutateCandidate(["status"], "pending")],
    ["short base head", mutateCandidate(["baseHead"], "a".repeat(39))],
    ["non-string base head", mutateCandidate(["baseHead"], 1)],
    ["short source digest", mutateCandidate(["sourceTreeSha256"], "b".repeat(63))],
    ["algorithm", mutateCandidate(["algorithm"], "argon2i")],
    ["short package", mutateCandidate(["package"], "x")],
    ["long package", mutateCandidate(["package"], "x".repeat(161))],
    ["non-string package", mutateCandidate(["package"], 1)],
    ["invalid timestamp", mutateCandidate(["generatedAt"], "not-a-date")],
    ["non-string timestamp", mutateCandidate(["generatedAt"], 1)],
    ["apk object", mutateCandidate(["apk"], null)],
    ["apk keys", mutateCandidate(["apk"], { ...candidate.apk, extra: true })],
    ["apk path empty", mutateCandidate(["apk", "path"], "")],
    ["apk path long", mutateCandidate(["apk", "path"], "x".repeat(513))],
    ["apk path type", mutateCandidate(["apk", "path"], 1)],
    ["apk digest", mutateCandidate(["apk", "sha256"], "c".repeat(63))],
    ["apk zero size", mutateCandidate(["apk", "sizeBytes"], 0)],
    ["apk fractional size", mutateCandidate(["apk", "sizeBytes"], 1.5)],
    ["provider object", mutateCandidate(["provider"], null)],
    ["provider keys", mutateCandidate(["provider"], { ...candidate.provider, extra: true })],
    ["provider name", mutateCandidate(["provider", "name"], "Unknown")],
    ["provider version", mutateCandidate(["provider", "version"], "1.85.1")],
    ["provider coordinate", mutateCandidate(
      ["provider", "mavenCoordinate"],
      "org.bouncycastle:bcprov-jdk18on:latest",
    )],
    ["bounds object", mutateCandidate(["parameterBounds"], null)],
    ["bounds keys", mutateCandidate(
      ["parameterBounds"],
      { ...candidate.parameterBounds, extra: true },
    )],
    ["memory range object", mutateCandidate(["parameterBounds", "memoryKiB"], null)],
    ["memory range keys", mutateCandidate(
      ["parameterBounds", "memoryKiB"],
      { min: 19_456, max: 19_456, extra: true },
    )],
    ["memory min", mutateCandidate(["parameterBounds", "memoryKiB", "min"], 19_455)],
    ["memory max", mutateCandidate(["parameterBounds", "memoryKiB", "max"], 19_457)],
    ["iterations", mutateCandidate(["parameterBounds", "iterations", "min"], 1)],
    ["parallelism", mutateCandidate(["parameterBounds", "parallelism", "max"], 2)],
    ["salt", mutateCandidate(["parameterBounds", "saltBytes", "min"], 15)],
    ["output", mutateCandidate(["parameterBounds", "outputBytes", "max"], 31)],
    ["kat object", mutateCandidate(["kat"], null)],
    ["kat keys", mutateCandidate(["kat"], { ...candidate.kat, extra: true })],
    ["kat id", mutateCandidate(["kat", "id"], "unknown")],
    ["kat passed type", mutateCandidate(["kat", "passed"], "true")],
    ["passed status with failed KAT", mutateCandidate(["kat", "passed"], false)],
    ["timing object", mutateCandidate(["feasibilityTiming"], null)],
    ["timing keys", mutateCandidate(
      ["feasibilityTiming"],
      { ...candidate.feasibilityTiming, extra: true },
    )],
    ["timing samples type", mutateCandidate(["feasibilityTiming", "samplesMs"], null)],
    ["too few timing samples", mutateCandidate(["feasibilityTiming", "samplesMs"], [300, 301])],
    ["too many timing samples", mutateCandidate(
      ["feasibilityTiming", "samplesMs"],
      Array.from({ length: 11 }, () => 300),
    )],
    ["fractional timing sample", mutateCandidate(
      ["feasibilityTiming", "samplesMs"],
      [280, 300.5, 320],
    )],
    ["negative timing sample", mutateCandidate(
      ["feasibilityTiming", "samplesMs"],
      [280, -1, 320],
    )],
    ["oversized timing sample", mutateCandidate(
      ["feasibilityTiming", "samplesMs"],
      [280, 300, 60_001],
    )],
    ["timing count", mutateCandidate(["feasibilityTiming", "sampleCount"], 2)],
    ["timing min", mutateCandidate(["feasibilityTiming", "minMs"], 279)],
    ["timing max", mutateCandidate(["feasibilityTiming", "maxMs"], 321)],
    ["timing median", mutateCandidate(["feasibilityTiming", "medianMs"], 301)],
    ["device object", mutateCandidate(["device"], null)],
    ["device keys", mutateCandidate(["device"], { ...candidate.device, extra: true })],
    ["device kind", mutateCandidate(["device", "kind"], "unknown")],
    ["device serial", mutateCandidate(["device", "serial"], 1)],
    ["device api zero", mutateCandidate(["device", "api"], 0)],
    ["device api below minimum", mutateCandidate(["device", "api"], 23)],
    ["device abi", mutateCandidate(["device", "abi"], 1)],
    ["device model", mutateCandidate(["device", "model"], 1)],
    ["device release", mutateCandidate(["device", "androidRelease"], 1)],
    ["cng object", mutateCandidate(["cng"], null)],
    ["cng keys", mutateCandidate(["cng"], { ...candidate.cng, extra: true })],
    ["clean prebuilds", mutateCandidate(["cng", "cleanPrebuilds"], 1)],
    ["autolink", mutateCandidate(["cng", "autolinked"], false)],
    ["page size object", mutateCandidate(["pageSize"], null)],
    ["page size keys", mutateCandidate(["pageSize"], { ...candidate.pageSize, extra: true })],
    ["alignment", mutateCandidate(["pageSize", "alignmentKiB"], 4)],
    ["zipalign", mutateCandidate(["pageSize", "zipalignVerified"], false)],
    ["library inspection", mutateCandidate(
      ["pageSize", "packagedLibrariesInspected"],
      false,
    )],
    ["physical object", mutateCandidate(["physicalDeviceCalibration"], null)],
    ["physical keys", mutateCandidate(
      ["physicalDeviceCalibration"],
      { ...candidate.physicalDeviceCalibration, extra: true },
    )],
    ["physical status", mutateCandidate(
      ["physicalDeviceCalibration", "status"],
      "passed",
    )],
    ["physical samples", mutateCandidate(
      ["physicalDeviceCalibration", "requiredSamples"],
      9,
    )],
    ["physical min", mutateCandidate(
      ["physicalDeviceCalibration", "targetMinMs"],
      249,
    )],
    ["physical max", mutateCandidate(
      ["physicalDeviceCalibration", "targetMaxMs"],
      751,
    )],
    ["physical deferred parameters", mutateCandidate(
      ["physicalDeviceCalibration", "parameters"],
      {
        memoryKiB: 19_456,
        iterations: 2,
        parallelism: 1,
      },
    )],
  ])("rejects malformed descriptor field: %s", (_label, invalid) => {
    expect(() => parseCandidateKdfDescriptor(invalid)).toThrow(
      CandidateKdfDescriptorError,
    );
  });

  it("accepts an explicit blocked feasibility status", () => {
    const blocked = {
      ...candidate,
      status: "blocked",
      failureCode: "argon2_invalid_password",
      kat: {
        ...candidate.kat,
        passed: false,
      },
      feasibilityTiming: {
        sampleCount: 0,
        samplesMs: [],
        minMs: null,
        medianMs: null,
        maxMs: null,
      },
    };

    expect(parseCandidateKdfDescriptor(blocked).status).toBe("blocked");
  });

  it("accepts completed blocked physical timing evidence", () => {
    const blocked = {
      ...candidate,
      status: "blocked",
      failureCode: "argon2_physical_timing_out_of_range",
      physicalDeviceCalibration: {
        ...physicalCalibration,
        status: "blocked",
        timing: {
          ...physicalCalibration.timing,
          samplesMs: [],
          sampleCount: 0,
          minMs: null,
          medianMs: null,
          maxMs: null,
        },
      },
    };

    expect(parseCandidateKdfDescriptor(blocked).status).toBe("blocked");
  });

  it("rejects a passed physical calibration on a blocked descriptor", () => {
    expect(() => parseCandidateKdfDescriptor({
      ...candidate,
      status: "blocked",
      failureCode: "argon2_physical_timing_out_of_range",
      physicalDeviceCalibration: physicalCalibration,
    })).toThrow(CandidateKdfDescriptorError);
  });

  it("rejects blocked physical calibration on a passed descriptor", () => {
    expect(() => parseCandidateKdfDescriptor({
      ...candidate,
      physicalDeviceCalibration: {
        ...physicalCalibration,
        status: "blocked",
      },
    })).toThrow(CandidateKdfDescriptorError);
  });

  it.each([
    [
      "autolink",
      {
        ...candidate,
        status: "blocked",
        failureCode: "argon2_autolink_failed",
        cng: {
          ...candidate.cng,
          autolinked: false,
        },
      },
    ],
    [
      "packaging",
      {
        ...candidate,
        status: "blocked",
        failureCode: "argon2_packaging_failed",
        pageSize: {
          ...candidate.pageSize,
          packagedLibrariesInspected: false,
        },
      },
    ],
  ])("accepts explicit blocked %s evidence", (_label, blocked) => {
    expect(parseCandidateKdfDescriptor(blocked).status).toBe("blocked");
  });

  it.each([
    [
      "passed descriptor with a failure code",
      mutateCandidate(["failureCode"], "argon2_derivation_failed"),
    ],
    [
      "blocked descriptor without a failure code",
      {
        ...candidate,
        status: "blocked",
        failureCode: null,
      },
    ],
    [
      "blocked descriptor with an unknown failure code",
      {
        ...candidate,
        status: "blocked",
        failureCode: "native-secret-detail",
      },
    ],
    [
      "passed descriptor without three samples",
      {
        ...candidate,
        feasibilityTiming: {
          sampleCount: 0,
          samplesMs: [],
          minMs: null,
          medianMs: null,
          maxMs: null,
        },
      },
    ],
  ])("rejects status invariant: %s", (_label, invalid) => {
    expect(() => parseCandidateKdfDescriptor(invalid)).toThrow(
      CandidateKdfDescriptorError,
    );
  });

  it.each([
    ["primitive manifest", null],
    ["schema", { ...buildManifest, schema_version: 2 }],
    ["suite", { ...buildManifest, suite: "other" }],
    ["profile", { ...buildManifest, profile: "production" }],
    ["head", { ...buildManifest, base_head: "d".repeat(40) }],
    ["source digest", { ...buildManifest, source_tree_sha256: "d".repeat(64) }],
    ["package", { ...buildManifest, package: "com.example.other" }],
    ["apk object", { ...buildManifest, apk: null }],
    ["apk path", { ...buildManifest, apk: { ...buildManifest.apk, path: "other.apk" } }],
    ["apk size", { ...buildManifest, apk: { ...buildManifest.apk, size_bytes: 1 } }],
    ["alignment", {
      ...buildManifest,
      apk: { ...buildManifest.apk, page_alignment_kib: 4 },
    }],
    ["alignment proof", {
      ...buildManifest,
      apk: { ...buildManifest.apk, page_alignment_verified: false },
    }],
    ["device object", { ...buildManifest, device: null }],
    ["device serial", {
      ...buildManifest,
      device: { ...buildManifest.device, serial: "other" },
    }],
    ["device api", {
      ...buildManifest,
      device: { ...buildManifest.device, api: 35 },
    }],
    ["device abi", {
      ...buildManifest,
      device: { ...buildManifest.device, abi: "x86_64" },
    }],
    ["device model", {
      ...buildManifest,
      device: { ...buildManifest.device, model: "other" },
    }],
    ["device release", {
      ...buildManifest,
      device: { ...buildManifest.device, android_release: "15" },
    }],
  ])("rejects build mismatch: %s", (_label, invalidBuild) => {
    const parsed = parseCandidateKdfDescriptor(candidate);
    expect(() => assertCandidateKdfDescriptorMatchesBuild(
      parsed,
      invalidBuild,
    )).toThrow(CandidateKdfDescriptorError);
  });
});
