#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";

function command(program, args) { return execFileSync(program, args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function parseArguments(args) {
  const index = args.indexOf("--manifest");
  if (index < 0 || args[index + 1] === undefined) throw new Error("prepare:phase12:google requires --manifest");
  return { manifest: args[index + 1] };
}
export function validateDevelopmentTestManifest(manifest, head, source) {
  if (manifest?.suite !== "phase12" || manifest.profile !== "development-test" || manifest.package !== PACKAGE
    || manifest.base_head !== head || manifest.source_tree_sha256 !== source || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")) throw new Error("phase12_google_acceptance_manifest_invalid");
}
export function preparePhase12GoogleAcceptance(args = process.argv.slice(2)) {
  const { manifest: manifestPath } = parseArguments(args);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateDevelopmentTestManifest(manifest, command("git", ["rev-parse", "HEAD"]), command("node", ["scripts/source-tree-digest.mjs", "--assert-no-untracked"]));
  const output = path.join(ROOT, "artifacts/native/phase12/attended", "CHECKLIST.md");
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `# Phase 12 attended Google acceptance\n\nManifest source: \`${manifest.base_head}\`\nAPK SHA-256: \`${manifest.apk.sha256}\`\nPackage: \`${PACKAGE}\`\n\n## Before connection\n\n- [ ] Owner confirms a dedicated Google test account and development-test namespace; no production objects are present.\n- [ ] Owner confirms this exact retained APK is installed on one Google-enabled emulator.\n\n## Emulator replacement proof\n\n- [ ] One-Tap + \`drive.file\` consent succeeds; record only redacted hash/count/size/time evidence.\n- [ ] First and second generation prove latest/previous rotation.\n- [ ] Owner performs the dev-test package clear/uninstall/reinstall, then verifies quarantine, direct restore digest, successor claim, post-restore backup, bounded manifest recovery, orphan trash, and non-empty merge/adoption.\n\n## Phone smoke proof\n\n- [ ] Same signed development-test profile proves One-Tap, scope, refresh, and environment isolation only. Do not upload, restore, clear, merge, or inspect backup data.\n\nDo not record tokens, emails, permission IDs, Drive IDs, object names, or workout content.\n`);
  return { output, manifest: { base_head: manifest.base_head, apk_sha256: manifest.apk.sha256, package: manifest.package } };
}
if (process.argv[1]?.endsWith("prepare-phase12-google-acceptance.mjs")) {
  try { process.stdout.write(`${JSON.stringify(preparePhase12GoogleAcceptance())}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
