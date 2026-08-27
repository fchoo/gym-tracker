import {
  describe,
  expect,
  it,
} from "@jest/globals";

import createConfig from "../../app.config";

function configForProfile(buildProfile: string | undefined) {
  const previousProfile = process.env.GYM_TRACKER_BUILD_PROFILE;
  try {
    if (buildProfile === undefined) {
      delete process.env.GYM_TRACKER_BUILD_PROFILE;
    } else {
      process.env.GYM_TRACKER_BUILD_PROFILE = buildProfile;
    }
    return createConfig({ config: {} } as never);
  } finally {
    if (previousProfile === undefined) {
      delete process.env.GYM_TRACKER_BUILD_PROFILE;
    } else {
      process.env.GYM_TRACKER_BUILD_PROFILE = previousProfile;
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
