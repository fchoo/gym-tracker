import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  REST_ALERT_PREFERENCE_KEY,
  createSqliteRestAlertPreferenceStore,
  DEFAULT_REST_ALERT_PREFERENCES,
} from "./restAlertPreferenceStore";

describe("SQLite rest-alert preference store", () => {
  it("defaults both independently persisted modalities to enabled", () => {
    const store = createSqliteRestAlertPreferenceStore({
      getItemSync: jest.fn(() => null),
      setItemSync: jest.fn(),
    });

    const preferences = store.read();

    expect(preferences).toEqual({
      soundEnabled: true,
      vibrationEnabled: true,
    });
    expect(preferences).toEqual(DEFAULT_REST_ALERT_PREFERENCES);
    expect(Object.isFrozen(preferences)).toBe(true);
  });

  it("round-trips each independently configurable modality in one versioned record", () => {
    const storage = {
      getItemSync: jest.fn(() => JSON.stringify({
        version: 1,
        soundEnabled: false,
        vibrationEnabled: true,
      })),
      setItemSync: jest.fn(),
    };
    const store = createSqliteRestAlertPreferenceStore(storage);

    expect(store.read()).toEqual({
      soundEnabled: false,
      vibrationEnabled: true,
    });

    store.write({ soundEnabled: true, vibrationEnabled: false });

    expect(storage.setItemSync).toHaveBeenCalledWith(
      REST_ALERT_PREFERENCE_KEY,
      JSON.stringify({
        version: 1,
        soundEnabled: true,
        vibrationEnabled: false,
      }),
    );
  });

  it.each([
    null,
    "not-json",
    "42",
    JSON.stringify({
      version: 2,
      soundEnabled: false,
      vibrationEnabled: false,
    }),
    JSON.stringify({
      version: 1,
      soundEnabled: "false",
      vibrationEnabled: true,
    }),
    JSON.stringify({
      version: 1,
      soundEnabled: false,
    }),
  ])("safely falls back to defaults for malformed or mismatched storage (%p)", (
    value,
  ) => {
    const store = createSqliteRestAlertPreferenceStore({
      getItemSync: jest.fn(() => value),
      setItemSync: jest.fn(),
    });

    expect(store.read()).toEqual(DEFAULT_REST_ALERT_PREFERENCES);
  });

  it("keeps reads and writes fail-soft when SQLite KV storage is unavailable", () => {
    const store = createSqliteRestAlertPreferenceStore({
      getItemSync: jest.fn(() => {
        throw new Error("read_failed");
      }),
      setItemSync: jest.fn(() => {
        throw new Error("write_failed");
      }),
    });

    expect(store.read()).toEqual(DEFAULT_REST_ALERT_PREFERENCES);
    expect(() => store.write({
      soundEnabled: false,
      vibrationEnabled: false,
    })).not.toThrow();
  });

  it("uses one cached Expo SQLite KV store for production reads and writes", () => {
    const databaseNames: string[] = [];
    const setItemSync = jest.fn();
    const getItemSync = jest.fn(() => JSON.stringify({
      version: 1,
      soundEnabled: false,
      vibrationEnabled: true,
    }));

    jest.isolateModules(() => {
      jest.doMock("expo-sqlite/kv-store", () => ({
        SQLiteStorage: class {
          constructor(databaseName: string) {
            databaseNames.push(databaseName);
          }

          getItemSync = getItemSync;
          setItemSync = setItemSync;
        },
      }));
      const { productionRestAlertPreferenceStore } = require(
        "./restAlertPreferenceStore",
      ) as typeof import("./restAlertPreferenceStore");

      expect(productionRestAlertPreferenceStore.read()).toEqual({
        soundEnabled: false,
        vibrationEnabled: true,
      });
      productionRestAlertPreferenceStore.write({
        soundEnabled: true,
        vibrationEnabled: false,
      });
      expect(productionRestAlertPreferenceStore.read()).toEqual({
        soundEnabled: false,
        vibrationEnabled: true,
      });
    });

    expect(databaseNames).toEqual(["gym-tracker-preferences.db"]);
    expect(setItemSync).toHaveBeenCalledWith(
      REST_ALERT_PREFERENCE_KEY,
      JSON.stringify({
        version: 1,
        soundEnabled: true,
        vibrationEnabled: false,
      }),
    );
    expect(getItemSync).toHaveBeenCalledTimes(2);
  });

  it("keeps a stable default-on production fallback when Expo KV storage is unavailable", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-sqlite/kv-store", () => {
        throw new Error("storage_module_unavailable");
      });
      const { productionRestAlertPreferenceStore } = require(
        "./restAlertPreferenceStore",
      ) as typeof import("./restAlertPreferenceStore");

      expect(productionRestAlertPreferenceStore.read()).toEqual(
        DEFAULT_REST_ALERT_PREFERENCES,
      );
      expect(() => productionRestAlertPreferenceStore.write({
        soundEnabled: false,
        vibrationEnabled: false,
      })).not.toThrow();
    });
  });
});
