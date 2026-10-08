import {
  describe,
  expect,
  it,
} from "@jest/globals";

import createConfig from "../../app.config";

const approvedWebClientId =
  "359232211920-gqfkasvsr8r5qbmprc6ukh9fofu246r9.apps.googleusercontent.com";

function configForProfile(
  buildProfile: string | undefined,
  nativeContractSuite?: string,
) {
  const previousProfile = process.env.GYM_TRACKER_BUILD_PROFILE;
  const previousWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const previousNativeContractSuite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
  try {
    if (buildProfile === undefined) {
      delete process.env.GYM_TRACKER_BUILD_PROFILE;
    } else {
      process.env.GYM_TRACKER_BUILD_PROFILE = buildProfile;
    }
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = approvedWebClientId;
    if (nativeContractSuite === undefined) {
      delete process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
    } else {
      process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE = nativeContractSuite;
    }
    return createConfig({ config: {} } as never);
  } finally {
    if (previousProfile === undefined) {
      delete process.env.GYM_TRACKER_BUILD_PROFILE;
    } else {
      process.env.GYM_TRACKER_BUILD_PROFILE = previousProfile;
    }
    if (previousWebClientId === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = previousWebClientId;
    }
    if (previousNativeContractSuite === undefined) {
      delete process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
    } else {
      process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE = previousNativeContractSuite;
    }
  }
}

describe("Android lifecycle configuration", () => {
  it("allows rotation and blocks exact-alarm permissions", () => {
    const config = configForProfile(undefined);

    expect(config.orientation).toBe("default");
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.USE_EXACT_ALARM",
      ]),
    );
    expect(config.plugins).toEqual(expect.arrayContaining([
      [
        "expo-notifications",
        { defaultChannel: "workout-rest-v2-sound-vibration" },
      ],
    ]));
  });

  it("defaults an absent build profile to the production identity", () => {
    const config = configForProfile(undefined);

    expect(config.name).toBe("Gym Tracker");
    expect(config.scheme).toBe("gymtracker");
    expect(config.android?.package).toBe("com.fchoo.gymtracker");
    expect(config.extra).toMatchObject({
      buildProfile: "production",
      nativeContractsEnabled: false,
    });
  });

  it("enables the isolated identity only for explicit development-test", () => {
    const config = configForProfile("development-test");

    expect(config.name).toBe("Gym Tracker Dev Test");
    expect(config.scheme).toBe("gymtracker-devtest");
    expect(config.android?.package).toBe("com.fchoo.gymtracker.devtest");
    expect(config.extra).toMatchObject({
      buildProfile: "development-test",
      nativeContractsEnabled: true,
    });
  });

  it("embeds an explicit native-contract suite for the installed development-test runtime", () => {
    const config = configForProfile("development-test", "phase14-font-proof");

    expect(config.extra).toMatchObject({
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      nativeContractSuite: "phase14-font-proof",
    });
  });

  it("keeps explicit production on the production identity", () => {
    const config = configForProfile("production");

    expect(config.name).toBe("Gym Tracker");
    expect(config.scheme).toBe("gymtracker");
    expect(config.android?.package).toBe("com.fchoo.gymtracker");
    expect(config.extra).toMatchObject({
      buildProfile: "production",
      nativeContractsEnabled: false,
    });
  });

  it("rejects an unknown build profile instead of guessing", () => {
    expect(() => configForProfile("preview")).toThrow(
      'Unsupported GYM_TRACKER_BUILD_PROFILE "preview". Use development-test or production.',
    );
  });
});
