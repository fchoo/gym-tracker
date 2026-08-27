import {
  SQLiteStorage,
} from "expo-sqlite/kv-store";

export const APPEARANCE_PREFERENCE_KEY =
  "gym_tracker.appearance_preference.v1" as const;

type SyncPreferenceStorage = Readonly<{
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): boolean;
}>;

export function createSqliteAppearanceStore(
  storage: SyncPreferenceStorage,
) {
  return Object.freeze({
    read(): string | null {
      try {
        return storage.getItemSync(APPEARANCE_PREFERENCE_KEY);
      } catch {
        return null;
      }
    },
    write(value: "Light" | "Dark" | null): void {
      try {
        if (value === null) {
          storage.removeItemSync(APPEARANCE_PREFERENCE_KEY);
          return;
        }
        storage.setItemSync(APPEARANCE_PREFERENCE_KEY, value);
      } catch {
        return;
      }
    },
  });
}

export function createLazyAppearanceStore(
  createStorage: () => SyncPreferenceStorage,
) {
  let store: ReturnType<typeof createSqliteAppearanceStore> | undefined;
  const getStore = () => {
    store ??= createSqliteAppearanceStore(createStorage());
    return store;
  };

  return Object.freeze({
    read(): string | null {
      return getStore().read();
    },
    write(value: "Light" | "Dark" | null): void {
      getStore().write(value);
    },
  });
}

export const productionAppearanceStore = createLazyAppearanceStore(
  () => new SQLiteStorage("gym-tracker-preferences.db"),
);
