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

export type AppearanceReadResult =
  | Readonly<{ status: "ready"; value: string | null }>
  | Readonly<{ status: "failed" }>;

export type AppearanceWriteResult =
  | Readonly<{ status: "written"; value: "Light" | "Dark" | null }>
  | Readonly<{ status: "failed" }>;

export function createSqliteAppearanceStore(
  storage: SyncPreferenceStorage,
) {
  return Object.freeze({
    read(): AppearanceReadResult {
      try {
        return { status: "ready", value: storage.getItemSync(APPEARANCE_PREFERENCE_KEY) };
      } catch {
        return { status: "failed" };
      }
    },
    write(value: "Light" | "Dark" | null): AppearanceWriteResult {
      try {
        if (value === null) {
          storage.removeItemSync(APPEARANCE_PREFERENCE_KEY);
          return { status: "written", value: null };
        }
        storage.setItemSync(APPEARANCE_PREFERENCE_KEY, value);
        return { status: "written", value };
      } catch {
        return { status: "failed" };
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
    read(): AppearanceReadResult {
      return getStore().read();
    },
    write(value: "Light" | "Dark" | null): AppearanceWriteResult {
      return getStore().write(value);
    },
  });
}

export const productionAppearanceStore = createLazyAppearanceStore(
  () => new SQLiteStorage("gym-tracker-preferences.db"),
);
