export const REST_ALERT_PREFERENCE_KEY =
  "gym_tracker.rest_alert_preferences.v1" as const;

export type RestAlertPreferences = Readonly<{
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}>;

type StoredRestAlertPreferencesV1 = Readonly<{
  version: 1;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}>;

type SyncPreferenceStorage = Readonly<{
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
}>;

export type RestAlertPreferenceStore = Readonly<{
  read(): RestAlertPreferences;
  write(preferences: RestAlertPreferences): void;
}>;

type SQLiteStorageConstructor = new (
  databaseName: string,
) => SyncPreferenceStorage;

export const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences =
  Object.freeze({
    soundEnabled: true,
    vibrationEnabled: true,
  });

function freezePreferences(
  preferences: RestAlertPreferences,
): RestAlertPreferences {
  return Object.freeze({
    soundEnabled: preferences.soundEnabled,
    vibrationEnabled: preferences.vibrationEnabled,
  });
}

function parseStoredRestAlertPreferences(
  value: string | null,
): RestAlertPreferences {
  if (value === null) {
    return DEFAULT_REST_ALERT_PREFERENCES;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object"
      || parsed === null
      || Array.isArray(parsed)
    ) {
      return DEFAULT_REST_ALERT_PREFERENCES;
    }
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1
      || typeof record.soundEnabled !== "boolean"
      || typeof record.vibrationEnabled !== "boolean"
    ) {
      return DEFAULT_REST_ALERT_PREFERENCES;
    }
    return freezePreferences({
      soundEnabled: record.soundEnabled,
      vibrationEnabled: record.vibrationEnabled,
    });
  } catch {
    return DEFAULT_REST_ALERT_PREFERENCES;
  }
}

export function createSqliteRestAlertPreferenceStore(
  storage: SyncPreferenceStorage,
): RestAlertPreferenceStore {
  return Object.freeze({
    read(): RestAlertPreferences {
      try {
        return parseStoredRestAlertPreferences(
          storage.getItemSync(REST_ALERT_PREFERENCE_KEY),
        );
      } catch {
        return DEFAULT_REST_ALERT_PREFERENCES;
      }
    },

    write(preferences: RestAlertPreferences): void {
      const record: StoredRestAlertPreferencesV1 = {
        version: 1,
        soundEnabled: preferences.soundEnabled,
        vibrationEnabled: preferences.vibrationEnabled,
      };
      try {
        storage.setItemSync(
          REST_ALERT_PREFERENCE_KEY,
          JSON.stringify(record),
        );
      } catch {
        return;
      }
    },
  });
}

let cachedProductionStorage: SyncPreferenceStorage | null | undefined;

function productionStorage(): SyncPreferenceStorage | null {
  if (cachedProductionStorage !== undefined) {
    return cachedProductionStorage;
  }
  try {
    const module = require("expo-sqlite/kv-store") as Readonly<{
      SQLiteStorage: SQLiteStorageConstructor;
    }>;
    cachedProductionStorage = new module.SQLiteStorage(
      "gym-tracker-preferences.db",
    );
  } catch {
    cachedProductionStorage = null;
  }
  return cachedProductionStorage;
}

export const productionRestAlertPreferenceStore = Object.freeze({
  read(): RestAlertPreferences {
    const storage = productionStorage();
    return storage === null
      ? DEFAULT_REST_ALERT_PREFERENCES
      : createSqliteRestAlertPreferenceStore(storage).read();
  },

  write(preferences: RestAlertPreferences): void {
    const storage = productionStorage();
    if (storage !== null) {
      createSqliteRestAlertPreferenceStore(storage).write(preferences);
    }
  },
});
