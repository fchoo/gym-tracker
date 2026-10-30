import { describe, expect, it, jest } from "@jest/globals";

jest.mock('expo/config-plugins', () => ({
  withGradleProperties: (config: object, action: (value: object) => object) => ({ ...config, properties: action({modResults: []}) }),
  withProjectBuildGradle: (config: object, action: (value: object) => object) => ({ ...config, project: action({modResults: {contents: 'plugins {}'}}) }),
  withAppBuildGradle: (config: object, action: (value: object) => object) => ({ ...config, app: action({modResults: {contents: 'apply plugin: "com.android.application"'}}) }),
}));
import { readFileSync } from "node:fs";
import { join } from "node:path";

import withGarminConnectModule, {
  applyGarminAppBuildGradle,
  applyGarminGradleProperties,
  applyGarminProjectBuildGradle,
} from "./withGarminConnectModule";

describe("withGarminConnectModule", () => {
  it('applies every CNG callback and retains unrelated Gradle properties', () => {
    const configured = withGarminConnectModule({name: 'Gym', slug: 'gym'});
    expect(configured).toHaveProperty('properties');
    expect(configured).toHaveProperty('project');
    expect(configured).toHaveProperty('app');
    expect(applyGarminGradleProperties([{type:'comment',value:'keep'},{type:'empty'}])).toEqual([{type:'comment',value:'keep'},{type:'empty'},{type:'property',key:'reactNativeArchitectures',value:'arm64-v8a'}]);
    const classpath = "buildscript { dependencies { classpath('com.chaquo.python:gradle:17.0.0') } }";
    expect(applyGarminProjectBuildGradle(classpath)).toBe(classpath);
    const repositories = classpath + '\nallprojects { repositories {} }';
    expect(applyGarminProjectBuildGradle(repositories)).toContain('https://chaquo.com/maven');
    const pinned = classpath + '\nmaven { url "https://chaquo.com/maven" }';
    expect(applyGarminProjectBuildGradle(pinned)).toBe(pinned);
    expect(() => applyGarminAppBuildGradle('plugins {}')).toThrow('garmin_cng_missing_android_application_plugin');
  });
  it("restricts the generated React Native architecture set to ARM64", () => {
    const configured = applyGarminGradleProperties([
      { type: "property", key: "reactNativeArchitectures", value: "armeabi-v7a,arm64-v8a,x86,x86_64" },
      { type: "property", key: "newArchEnabled", value: "true" },
    ]);

    expect(configured.filter((entry) => entry.type === "property" && entry.key === "reactNativeArchitectures")).toEqual([
      { type: "property", key: "reactNativeArchitectures", value: "arm64-v8a" },
    ]);
  });

  it("adds Chaquopy to Expo SDK 57's generated buildscript dependencies", () => {
    const project = `buildscript {
  repositories { google(); mavenCentral() }
  dependencies {
    classpath('com.android.tools.build:gradle')
  }
}
allprojects {
  repositories { google(); mavenCentral() }
}
`;

    const configured = applyGarminProjectBuildGradle(project);

    expect(configured).toContain("classpath('com.chaquo.python:gradle:17.0.0')");
    expect(configured).toContain('maven { url "https://chaquo.com/maven" }');
    expect(applyGarminProjectBuildGradle(configured)).toBe(configured);
  });

  it("adds the pinned host-only Chaquopy configuration exactly once", () => {
    const project = "plugins {\n  id(\"com.android.application\") version \"8.9.1\" apply false\n}\n";
    const app = "apply plugin: \"com.android.application\"\n";

    const configuredProject = applyGarminProjectBuildGradle(project);
    const configuredApp = applyGarminAppBuildGradle(app);

    expect(configuredProject).toContain('id("com.chaquo.python") version "17.0.0" apply false');
    expect(configuredApp).toContain('apply plugin: "com.chaquo.python"');
    expect(configuredApp).toContain('version = "3.13"');
    expect(configuredApp).toContain('abiFilters "arm64-v8a"');
    expect(configuredApp).toContain("verifyGarminPythonLock");
    expect(configuredApp).toContain("garmin-python-lock.json");
    expect(configuredApp).toContain("garmin-python-artifacts");
    expect(configuredApp).toContain('options "--no-deps", "--only-binary", "cffi,curl-cffi,chaquopy-libffi"');
    expect(configuredApp).toContain('lockedPackage.name == "python-garminconnect"');
    expect(configuredApp).toContain('throw new GradleException("garmin_python_native_source_forbidden")');
    expect(configuredApp).toContain('install new File(garminPythonArtifactDir');
    expect(configuredApp).not.toContain('install "--no-deps"');
    expect(configuredApp).toContain("materializeGarminPythonLock");
    expect(configuredApp).not.toContain("git+https://");
    expect(configuredApp).not.toContain("files.pythonhosted.org");
    expect(configuredApp).not.toMatch(/hermes|x86|x86_64|token|localhost|http:\/\//iu);

    expect(applyGarminProjectBuildGradle(configuredProject)).toBe(configuredProject);
    expect(applyGarminAppBuildGradle(configuredApp)).toBe(configuredApp);
  });

  it("rejects a host Gradle file without a plugins block", () => {
    expect(() => applyGarminProjectBuildGradle("buildscript {}\n")).toThrow(
      "garmin_cng_missing_plugins_block",
    );
  });

  it("registers the local module and plugin without a runtime engine override", () => {
    const root = process.cwd();
    const appConfig = readFileSync(join(root, "app.config.ts"), "utf8");
    const moduleConfig = readFileSync(
      join(root, "modules/garmin-connect/expo-module.config.json"),
      "utf8",
    );
    const packageConfig = readFileSync(
      join(root, "modules/garmin-connect/package.json"),
      "utf8",
    );

    expect(appConfig).toContain("./plugins/withGarminConnectModule.ts");
    expect(moduleConfig).toContain("expo.modules.garminconnect.GarminConnectModule");
    expect(packageConfig).toContain('"name": "garmin-connect"');
    expect(`${appConfig}\n${moduleConfig}\n${packageConfig}`).not.toMatch(
      /hermes|jsc|localhost|downloaded script|runtime agent/iu,
    );
  });
});
