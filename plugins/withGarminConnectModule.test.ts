import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyGarminAppBuildGradle,
  applyGarminGradleProperties,
  applyGarminProjectBuildGradle,
} from "./withGarminConnectModule";

describe("withGarminConnectModule", () => {
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
    expect(configuredApp).toContain("218e72ca5459e014435fc2d94fd18bd601fa0c14");
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
