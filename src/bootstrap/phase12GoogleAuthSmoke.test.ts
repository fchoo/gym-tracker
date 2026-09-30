import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const connect = jest.fn<() => Promise<Readonly<{ permissionId: string; displayEmail: string | null }> | null>>();

jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("../platform/google/googleAuthAdapter", () => ({ createGoogleAuthAdapter: jest.fn() }));
jest.mock("./productionAutomaticBackupRuntime", () => ({ fetchGoogleDriveIdentity: jest.fn() }));

import { DRIVE_FILE_SCOPE } from "../domains/backup/googleAuthPort";
import { performPhase12GoogleAuthSmoke } from "./phase12GoogleAuthSmoke";

const { createGoogleAuthAdapter: mockCreateGoogleAuthAdapter } = jest.requireMock(
  "../platform/google/googleAuthAdapter",
) as { createGoogleAuthAdapter: jest.Mock };

describe("Phase 12 Google auth smoke composition", () => {
  beforeEach(() => {
    connect.mockReset();
    mockCreateGoogleAuthAdapter.mockReset();
    mockCreateGoogleAuthAdapter.mockImplementation(() => ({ connect }));
  });

  it("returns only the bounded auth and scope result", async () => {
    connect.mockResolvedValueOnce({ permissionId: "permission", displayEmail: "…@example.com" });

    await expect(performPhase12GoogleAuthSmoke("123-client.apps.googleusercontent.com"))
      .resolves.toEqual({ authenticated: true, scope: DRIVE_FILE_SCOPE });
    expect(mockCreateGoogleAuthAdapter).toHaveBeenCalledWith(expect.objectContaining({
      webClientId: "123-client.apps.googleusercontent.com",
      about: expect.any(Function),
    }));
  });

  it("fails when the account chooser is cancelled", async () => {
    connect.mockResolvedValueOnce(null);

    await expect(performPhase12GoogleAuthSmoke("123-client.apps.googleusercontent.com"))
      .rejects.toThrow("phase12_google_auth_smoke_cancelled");
  });
});
