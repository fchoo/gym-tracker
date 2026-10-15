import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
} from "expo/config-plugins";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const instrumentationClass = ".Phase20QualityInstrumentation";

export function phase20QualityInstrumentationEnabled(
  extra: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  return extra?.buildProfile === "development-test"
    && extra.nativeContractsEnabled === true
    && extra.nativeContractSuite === "v1.2-acceptance";
}

/** Checked-in source copied verbatim into the generated Android project. */
export const phase20InstrumentationSource = readFileSync(
  path.join(__dirname, "phase20", "Phase20QualityInstrumentation.kt"),
  "utf8",
);

const withPhase20QualityInstrumentation: ConfigPlugin = (config) => {
  if (!phase20QualityInstrumentationEnabled(config.extra)) return config;
  config = withAndroidManifest(config, (manifestConfig) => {
    type Instrumentation = { $: Record<string, string> };
    const manifest = manifestConfig.modResults.manifest as typeof manifestConfig.modResults.manifest & { instrumentation?: Instrumentation[] };
    manifest.instrumentation ??= [];
    manifest.instrumentation = manifest.instrumentation.filter(
      (entry: Instrumentation) =>
        entry.$["android:name"] !== instrumentationClass,
    );
    manifest.instrumentation.push({
      $: {
        "android:name": instrumentationClass,
        "android:targetPackage": "com.fchoo.gymtracker.devtest",
        "android:handleProfiling": "false",
        "android:functionalTest": "true",
      },
    });
    return manifestConfig;
  });
  return withDangerousMod(config, ["android", async (modConfig) => {
    const directory = path.join(
      modConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "java",
      "com",
      "fchoo",
      "gymtracker",
      "devtest",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "Phase20QualityInstrumentation.kt"),
      phase20InstrumentationSource,
    );
    return modConfig;
  }]);
};

export default withPhase20QualityInstrumentation;
