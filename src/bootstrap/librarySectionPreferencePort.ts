import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";

const LIBRARY_SECTION_SETTING_KEY = "library.section";

export type LibraryRuntimeSection = "plans" | "exercises";

export type LibraryRuntimeSectionPreference = Readonly<{
  section: LibraryRuntimeSection;
  revision: number;
}>;

type LibrarySectionSettingRow = Readonly<{
  value_version: number;
  value_json: string;
  revision: number;
}>;

function parseLibrarySectionPreference(
  row: LibrarySectionSettingRow | undefined,
): LibraryRuntimeSectionPreference {
  if (row === undefined) return { section: "plans", revision: 0 };
  if (row.value_version !== 1 || !Number.isSafeInteger(row.revision)) {
    throw new Error("library_section_preference_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value_json);
  } catch {
    throw new Error("library_section_preference_invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    || Object.keys(parsed).length !== 1) {
    throw new Error("library_section_preference_invalid");
  }
  const section = (parsed as { section?: unknown }).section;
  if (section !== "plans" && section !== "exercises") {
    throw new Error("library_section_preference_invalid");
  }
  return { section, revision: row.revision };
}

async function readLibrarySectionPreference(
  kernel: SqliteKernel,
): Promise<LibraryRuntimeSectionPreference> {
  const [row] = await kernel.queryAll<LibrarySectionSettingRow>(
    `SELECT value_version, value_json, revision
     FROM app_settings
     WHERE key = ?`,
    [LIBRARY_SECTION_SETTING_KEY],
  );
  return parseLibrarySectionPreference(row);
}

export type LibrarySectionPreferencePort = Readonly<{
  read(): Promise<LibraryRuntimeSectionPreference>;
  write(
    section: LibraryRuntimeSection,
    expectedRevision: number,
  ): Promise<LibraryRuntimeSectionPreference>;
}>;

/** The Library-owned persisted section preference, with its optimistic revision contract. */
export function createLibrarySectionPreferencePort(
  kernel: SqliteKernel,
  nowMs: () => number,
): LibrarySectionPreferencePort {
  return Object.freeze({
    read: () => readLibrarySectionPreference(kernel),
    async write(section, expectedRevision) {
      if ((section !== "plans" && section !== "exercises")
        || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new Error("library_section_preference_invalid");
      }
      return kernel.write(async (transaction) => {
        const [row] = await transaction.queryAll<LibrarySectionSettingRow>(
          `SELECT value_version, value_json, revision
           FROM app_settings
           WHERE key = ?`,
          [LIBRARY_SECTION_SETTING_KEY],
        );
        const current = parseLibrarySectionPreference(row);
        if (current.section === section) return current;
        if (current.revision !== expectedRevision) {
          throw new Error("library_section_preference_conflict");
        }
        const next: LibraryRuntimeSectionPreference = {
          section,
          revision: current.revision + 1,
        };
        if (row === undefined) {
          await transaction.execute(
            `INSERT INTO app_settings
              (key, value_version, value_json, revision, updated_at_ms)
             VALUES (?, 1, ?, ?, ?)`,
            [LIBRARY_SECTION_SETTING_KEY, JSON.stringify({ section }), next.revision, nowMs()],
          );
        } else {
          const result = await transaction.execute(
            `UPDATE app_settings
             SET value_json = ?, revision = ?, updated_at_ms = ?
             WHERE key = ? AND revision = ?`,
            [JSON.stringify({ section }), next.revision, nowMs(), LIBRARY_SECTION_SETTING_KEY, expectedRevision],
          );
          if (result.changes !== 1) throw new Error("library_section_preference_conflict");
        }
        return Object.freeze(next);
      });
    },
  });
}
