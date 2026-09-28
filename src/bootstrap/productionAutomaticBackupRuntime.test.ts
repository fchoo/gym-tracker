import { describe, expect, it, jest } from "@jest/globals";

const mockCreateGoogleAuthAdapter = jest.fn(() => ({
  accessToken: () => null,
  reauthenticate: async () => null,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        buildProfile: "development-test",
        googleOAuth: { webClientId: "1234567890-test.apps.googleusercontent.com" },
      },
    },
  },
}));

jest.mock("../platform/google/googleAuthAdapter", () => ({ createGoogleAuthAdapter: mockCreateGoogleAuthAdapter }));

import { createProductionAutomaticBackupServices } from "./productionAutomaticBackupRuntime";

describe("production automatic-backup composition", () => {
  it("constructs one cached Drive-only runtime for the SQLite kernel", () => {
    const kernel = {
      queryAll: jest.fn(async () => []),
      queryFirst: jest.fn(async () => null),
      execute: jest.fn(async () => undefined),
      transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(kernel)),
    } as never;

    const first = createProductionAutomaticBackupServices(kernel);
    const second = createProductionAutomaticBackupServices(kernel);

    expect(first).toBe(second);
    expect(mockCreateGoogleAuthAdapter).toHaveBeenCalledWith(expect.objectContaining({
      webClientId: "1234567890-test.apps.googleusercontent.com",
    }));
    expect(first.runtime.current()).toMatchObject({ status: "paused", reason: "unavailable" });
  });
});
