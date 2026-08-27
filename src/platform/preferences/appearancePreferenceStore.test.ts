import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  APPEARANCE_PREFERENCE_KEY,
  createLazyAppearanceStore,
  createSqliteAppearanceStore,
} from "./appearancePreferenceStore";

describe("SQLite appearance preference store", () => {
  it("does not construct durable storage until production state is accessed", () => {
    const storage = {
      getItemSync: jest.fn(() => "Light"),
      setItemSync: jest.fn(),
      removeItemSync: jest.fn(() => true),
    };
    const createStorage = jest.fn(() => storage);
    const store = createLazyAppearanceStore(createStorage);

    expect(createStorage).not.toHaveBeenCalled();
    expect(store.read()).toBe("Light");
    store.write("Dark");

    expect(createStorage).toHaveBeenCalledTimes(1);
    expect(storage.setItemSync).toHaveBeenCalledWith(
      APPEARANCE_PREFERENCE_KEY,
      "Dark",
    );
  });

  it("persists explicit overrides and removes System from durable storage", () => {
    const storage = {
      getItemSync: jest.fn(() => "Dark"),
      setItemSync: jest.fn(),
      removeItemSync: jest.fn(() => true),
    };
    const store = createSqliteAppearanceStore(storage);

    expect(store.read()).toBe("Dark");
    store.write("Light");
    expect(storage.setItemSync).toHaveBeenCalledWith(
      APPEARANCE_PREFERENCE_KEY,
      "Light",
    );

    store.write(null);
    expect(storage.removeItemSync).toHaveBeenCalledWith(
      APPEARANCE_PREFERENCE_KEY,
    );
  });

  it("falls back to System semantics when native storage is unavailable", () => {
    const store = createSqliteAppearanceStore({
      getItemSync: jest.fn(() => {
        throw new Error("read_failed");
      }),
      setItemSync: jest.fn(() => {
        throw new Error("write_failed");
      }),
      removeItemSync: jest.fn(() => {
        throw new Error("remove_failed");
      }),
    });

    expect(store.read()).toBeNull();
    expect(() => store.write("Dark")).not.toThrow();
    expect(() => store.write(null)).not.toThrow();
  });
});
