import {
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  join,
  resolve,
} from "node:path";

const repositoryRoot = resolve(__dirname, "../../..");

describe("Plan 01-05 installed Argon2 feasibility harness", () => {
  it("declares a development-test bridge route and bounded evidence runner", () => {
    const routePath = join(repositoryRoot, "app/__argon2-contracts.tsx");
    const runnerPath = join(repositoryRoot, "scripts/run-argon2-feasibility.mjs");

    expect(existsSync(routePath)).toBe(true);
    expect(existsSync(runnerPath)).toBe(true);

    const route = readFileSync(routePath, "utf8");
    const runner = readFileSync(runnerPath, "utf8");
    const contract = readFileSync(
      join(
        repositoryRoot,
        "src/testing/contracts/argon2Feasibility.contract.ts",
      ),
      "utf8",
    );

    expect(route).toContain("ARGON2_FEASIBILITY_RESULT_MARKER");
    expect(contract).toContain("GYM_TRACKER_ARGON2_FEASIBILITY_RESULT:");
    expect(route).toContain("nativeContractsEnabled");
    expect(route).toContain("performArgon2Feasibility");
    expect(route).not.toMatch(/backup|restore|archive|aes/iu);
    expect(runner).toContain("run-native-sqlite-contracts.mjs");
    expect(runner).toContain("candidate-kdf.json");
    expect(runner).toContain("force-stop");
    expect(runner).toContain("timeoutMs");
    expect(runner).toContain('manifest.build_variant !== "release"');
    expect(runner).toContain("manifest.js_bundle?.embedded !== true");
    expect(runner).not.toContain('"expo",\n      "start"');
    expect(runner).not.toContain("restoreSourceFiles");
    expect(runner).not.toContain("uiautomator");
  });

  it("keeps result logs metadata-only and binds the candidate to the build", () => {
    const route = readFileSync(
      join(repositoryRoot, "app/__argon2-contracts.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(repositoryRoot, "scripts/run-argon2-feasibility.mjs"),
      "utf8",
    );

    expect(route).toContain("responsive");
    expect(route).toContain("samplesMs");
    expect(route).toContain("providerVersion");
    expect(route).not.toMatch(/console\.log\([^)]*(password|salt|output)/iu);
    expect(runner).toContain("base_head");
    expect(runner).toContain("source_tree_sha256");
    expect(runner).toContain("apk.sha256");
    expect(runner).toContain("physicalDeviceCalibration");
    expect(runner).toContain("deferred-to-01-10");
    expect(runner).toContain('deviceKind === "physical"');
    expect(runner).toContain('["argon2", "phase1"].includes(manifest.suite)');
    expect(runner).toContain("serialHash: sha256(serial)");
    expect(runner).toContain("freeMemoryBytes");
    expect(runner).toContain("requestedSamples");
    expect(runner).toContain("parameters");
    expect(runner).toContain(
      "exactly one ready physical Android device is required",
    );
    expect(runner).toContain(
      "--device=physical requires the final Phase 1 build manifest",
    );
    expect(runner).toContain(
      "--device=emulator requires the isolated Argon2 build manifest",
    );
    expect(runner).toContain("verify-pr-artifact-roundtrip.mjs");
    expect(runner).toContain("Argon2 test secret material appeared in logcat");
  });

  it("uses Expo typed arrays at the native boundary and ignores generated module builds", () => {
    const nativeModule = readFileSync(
      join(
        repositoryRoot,
        "modules/argon2-kdf/android/src/main/java/expo/modules/argon2kdf/Argon2KdfModule.kt",
      ),
      "utf8",
    );
    const gitignore = readFileSync(
      join(repositoryRoot, ".gitignore"),
      "utf8",
    );
    const digestPaths = [
      "scripts/build-bootstrap-native-test-apk.sh",
      "scripts/build-current-native-test-apk.sh",
      "scripts/verify-bootstrap-native-evidence.mjs",
      "scripts/verify-native-evidence.mjs",
    ];
    const sourceTreeDigest = readFileSync(
      join(repositoryRoot, "scripts/source-tree-digest.mjs"),
      "utf8",
    );

    expect(nativeModule).toContain(
      "import expo.modules.kotlin.typedarray.Uint8Array",
    );
    expect(nativeModule).toMatch(/password: Uint8Array/u);
    expect(nativeModule).toMatch(/salt: Uint8Array/u);
    expect(nativeModule).not.toContain("class Argon2KdfRequest : Record");
    expect(nativeModule).toContain(
      "AsyncFunction(\"derive\") Coroutine {",
    );
    expect(nativeModule).not.toMatch(
      /@Required\s+val (?:password|salt): ByteArray/u,
    );
    expect(nativeModule).toContain("argon2_native_input_failed");
    expect(nativeModule).toContain("argon2_native_parameters_failed");
    expect(nativeModule).toContain("argon2_native_generation_failed");
    expect(nativeModule).toContain("argon2_native_output_failed");
    expect(gitignore).toContain("/modules/*/android/build/");
    expect(sourceTreeDigest).toContain("^modules\\/[^/]+\\/android\\/build");
    for (const digestPath of digestPaths) {
      const source = readFileSync(join(repositoryRoot, digestPath), "utf8");
      if (digestPath === "scripts/build-current-native-test-apk.sh") {
        expect(source).toContain("scripts/source-tree-digest.mjs");
      } else {
        expect(source).toContain("^modules\\/[^/]+\\/android\\/build");
      }
      expect(source).toContain("development-test");
      if (digestPath.includes("build-")) {
        expect(source).toContain("assembleRelease");
        expect(source).toContain("assets/index.android.bundle");
      } else {
        expect(source).toContain("build variant");
        expect(source).toContain("embedded JS bundle");
      }
    }
  });
});
