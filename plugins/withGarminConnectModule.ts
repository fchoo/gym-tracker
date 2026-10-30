import {
  ConfigPlugin,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} from "expo/config-plugins";

const CHAQUOPY_PLUGIN = 'id("com.chaquo.python") version "17.0.0" apply false';
const CHAQUOPY_CLASSPATH = "classpath('com.chaquo.python:gradle:17.0.0')";
const CHAQUOPY_REPOSITORY = 'maven { url "https://chaquo.com/maven" }';
const HOST_MARKER = "// gym-tracker: Garmin Connect embedded Python";

type GradleProperty =
  | Readonly<{ type: "comment"; value: string }>
  | Readonly<{ type: "empty" }>
  | Readonly<{ type: "property"; key: string; value: string }>;

export function applyGarminGradleProperties(
  properties: readonly GradleProperty[],
): GradleProperty[] {
  return [
    ...properties.filter(
      (entry) => entry.type !== "property" || entry.key !== "reactNativeArchitectures",
    ),
    { type: "property", key: "reactNativeArchitectures", value: "arm64-v8a" },
  ];
}

export function applyGarminProjectBuildGradle(contents: string): string {
  let configured = contents;
  if (configured.includes(CHAQUOPY_PLUGIN)) return configured;
  if (configured.includes(CHAQUOPY_CLASSPATH)) return addChaquopyRepository(configured);
  const pluginsBlock = /plugins\s*\{/u.exec(contents);
  if (pluginsBlock !== null) {
    const insertionPoint = pluginsBlock.index + pluginsBlock[0].length;
    return `${contents.slice(0, insertionPoint)}\n    ${CHAQUOPY_PLUGIN}${contents.slice(insertionPoint)}`;
  }
  const buildscriptDependencies = /buildscript\s*\{[\s\S]*?\bdependencies\s*\{/u.exec(contents);
  if (buildscriptDependencies === null) throw new Error("garmin_cng_missing_plugins_block");
  const insertionPoint = buildscriptDependencies.index + buildscriptDependencies[0].length;
  configured = `${contents.slice(0, insertionPoint)}\n    ${CHAQUOPY_CLASSPATH}${contents.slice(insertionPoint)}`;
  return addChaquopyRepository(configured);
}

function addChaquopyRepository(contents: string): string {
  if (contents.includes(CHAQUOPY_REPOSITORY)) return contents;
  const allProjectsRepositories = /allprojects\s*\{[\s\S]*?\brepositories\s*\{/u.exec(contents);
  if (allProjectsRepositories === null) return contents;
  const insertionPoint = (allProjectsRepositories.index) + allProjectsRepositories[0].length;
  return `${contents.slice(0, insertionPoint)}\n    ${CHAQUOPY_REPOSITORY}${contents.slice(insertionPoint)}`;
}

export function applyGarminAppBuildGradle(contents: string): string {
  if (contents.includes(HOST_MARKER)) return contents;
  if (!contents.includes('apply plugin: "com.android.application"')) {
    throw new Error("garmin_cng_missing_android_application_plugin");
  }
  return `${contents.trimEnd()}

${HOST_MARKER}
apply plugin: "com.chaquo.python"

def garminPythonRoot = new File(rootProject.projectDir.parentFile, "modules/garmin-connect/python")
def garminPythonLockFile = new File(garminPythonRoot, "garmin-python-lock.json")
def garminPythonArtifactDir = new File(garminPythonRoot, "garmin-python-artifacts")
def garminPythonLock = new groovy.json.JsonSlurper().parse(garminPythonLockFile)

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
            options "--no-deps", "--only-binary", "cffi,curl-cffi,chaquopy-libffi"
            garminPythonLock.packages.each { lockedPackage ->
                if (!(lockedPackage.name == "python-garminconnect" || lockedPackage.artifact.filename.endsWith(".whl"))) {
                    throw new GradleException("garmin_python_native_source_forbidden")
                }
                install new File(garminPythonArtifactDir, lockedPackage.artifact.filename).absolutePath
            }
        }
    }
    sourceSets {
        main {
            srcDir "../../modules/garmin-connect/android/src/main/python"
        }
    }
}

tasks.register("materializeGarminPythonLock", Exec) {
    workingDir rootProject.projectDir.parentFile
    commandLine "node", "scripts/verify-garmin-python-lock.mjs", "--materialize", "--artifacts-dir", garminPythonArtifactDir.absolutePath
}
tasks.register("verifyGarminPythonLock", Exec) {
    dependsOn("materializeGarminPythonLock")
    workingDir rootProject.projectDir.parentFile
    commandLine "node", "scripts/verify-garmin-python-lock.mjs", "--artifacts-dir", garminPythonArtifactDir.absolutePath
}
tasks.named("preBuild").configure {
    dependsOn("verifyGarminPythonLock")
}
tasks.matching { task -> task.name.startsWith("generate") && task.name.endsWith("PythonRequirements") }.configureEach {
    dependsOn("verifyGarminPythonLock")
}
`;
}

const withGarminConnectModule: ConfigPlugin = (config) => {
  config = withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = applyGarminGradleProperties(
      gradleConfig.modResults,
    );
    return gradleConfig;
  });
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
