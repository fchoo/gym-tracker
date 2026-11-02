import { describe, expect, it } from "@jest/globals";

import * as backupPlugin from "./withAndroidBackupRules";

function exportedXml(name: string): string {
  const value = (backupPlugin as unknown as Record<string, unknown>)[name];
  expect(typeof value).toBe("string");
  return String(value);
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("withAndroidBackupRules", () => {
  it("excludes Garmin token and native response staging paths from legacy backup", () => {
    const xml = exportedXml("fullBackupContent");

    expect(occurrences(xml, 'path="garmin-session"')).toBe(3);
    expect(occurrences(xml, 'path="garmin-response-staging"')).toBe(3);
    expect(xml).not.toContain("<include");
  });

  it("excludes Garmin token and native response staging paths from cloud backup and device transfer", () => {
    const xml = exportedXml("dataExtractionRules");

    expect(xml).toContain("<cloud-backup>");
    expect(xml).toContain("<device-transfer>");
    expect(occurrences(xml, 'path="garmin-session"')).toBe(6);
    expect(occurrences(xml, 'path="garmin-response-staging"')).toBe(6);
    expect(xml).not.toContain("<include");
  });

  it("preserves the existing database and plaintext staging exclusions", () => {
    const full = exportedXml("fullBackupContent");
    const extraction = exportedXml("dataExtractionRules");

    expect(occurrences(full, 'domain="database" path="."')).toBe(1);
    expect(occurrences(extraction, 'domain="database" path="."')).toBe(2);
    for (const path of ["backup-staging", "plaintext-staging"]) {
      expect(occurrences(full, `path="${path}"`)).toBe(3);
      expect(occurrences(extraction, `path="${path}"`)).toBe(6);
    }
  });
});
