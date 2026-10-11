import {
  ConfigPlugin,
  withAppBuildGradle,
  withProjectBuildGradle,
} from "expo/config-plugins";

const CHAQUOPY_PLUGIN = 'id("com.chaquo.python") version "17.0.0" apply false';
const HOST_MARKER = "// gym-tracker: Garmin Connect embedded Python";

export function applyGarminProjectBuildGradle(contents: string): string {
  if (contents.includes(CHAQUOPY_PLUGIN)) return contents;
  const pluginsBlock = /plugins\s*\{/u.exec(contents);
  if (pluginsBlock === null) throw new Error("garmin_cng_missing_plugins_block");
  const insertionPoint = (pluginsBlock.index ?? 0) + pluginsBlock[0].length;
  return `${contents.slice(0, insertionPoint)}\n    ${CHAQUOPY_PLUGIN}${contents.slice(insertionPoint)}`;
}

export function applyGarminAppBuildGradle(contents: string): string {
  if (contents.includes(HOST_MARKER)) return contents;
  if (!contents.includes('apply plugin: "com.android.application"')) {
    throw new Error("garmin_cng_missing_android_application_plugin");
  }
  return `${contents.trimEnd()}

${HOST_MARKER}
apply plugin: "com.chaquo.python"

android {
    defaultConfig {
        minSdk 24
        ndk {
            abiFilters "arm64-v8a"
        }
    }
}

chaquopy {
    defaultConfig {
        version = "3.13"
        pip {
            install "git+https://github.com/cyberjunky/python-garminconnect.git@218e72ca5459e014435fc2d94fd18bd601fa0c14"
            install "https://files.pythonhosted.org/packages/19/6a/c24df8a4fc22fa84070dcd94abeba43c15e08cc09e35869565c0bad196fd/curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl#sha256=4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92"
            install "requests==2.34.2"
            install "ua-generator==2.1.6"
        }
    }
    sourceSets {
        main {
            srcDir "../../modules/garmin-connect/android/src/main/python"
        }
    }
}

tasks.register("verifyGarminPythonLock", Exec) {
    workingDir rootProject.projectDir.parentFile
    commandLine "node", "scripts/verify-garmin-python-lock.mjs"
}
tasks.named("preBuild").configure {
    dependsOn("verifyGarminPythonLock")
}
`;
}

const withGarminConnectModule: ConfigPlugin = (config) => {
  config = withProjectBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = applyGarminProjectBuildGradle(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
  return withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = applyGarminAppBuildGradle(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
};

export default withGarminConnectModule;
