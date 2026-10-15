import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const SHA256 = /^[a-f0-9]{64}$/u;
const MANIFEST_PATH = ".planning/design/v1.2-browser-evidence/source-manifest.json";
const REQUIRED_SOURCES = Object.freeze(["approved-json", "approved-hybrid-html"]);

const fail = (code) => { throw new Error(`v12_visual_authority_${code}`); };
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function safeFile(root, relative, code) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\")
    || relative.split("/").some((part) => !part || part === "." || part === "..")) fail(code);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail(code);
  let cursor = resolvedRoot;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink()) fail(code);
  }
  if (!lstatSync(resolved).isFile()) fail(code);
  return resolved;
}

function orderedUnique(values) {
  return [...new Set(values)];
}

function semanticContract(entry) {
  return {
    name: entry.name,
    theme: entry.theme,
    text: entry.text,
    controls: entry.controls.map(({ id, text, value }) => ({ id, text, value })),
  };
}

function layoutContract(entry) {
  return {
    name: entry.name,
    theme: entry.theme,
    line_count: entry.text.split(/\r?\n/u).length,
    control_order: entry.controls.map(({ id, text, data }) => ({ id, text, data })),
    oracle_viewport: { width: 390, height: 844 },
  };
}

export function deriveV12VisualAuthorityDigests({ walk, rendererSha256, sourceHashes }) {
  const semanticDigest = sha256(JSON.stringify(walk.map(semanticContract)));
  const layoutDigest = sha256(JSON.stringify(walk.map(layoutContract)));
  const rendererDigest = sha256(JSON.stringify({
    contract: "v12-deterministic-renderer/v1",
    renderer_sha256: rendererSha256,
    approved_json_sha256: sourceHashes["approved-json"],
    approved_hybrid_html_sha256: sourceHashes["approved-hybrid-html"],
    semantic_digest: semanticDigest,
    layout_digest: layoutDigest,
  }));
  return Object.freeze({ semantic_digest: semanticDigest, layout_digest: layoutDigest, renderer_digest: rendererDigest });
}

export function loadV12VisualAuthority({ root = process.cwd(), externalRoot = process.env.V12_APPROVED_SOURCE_ROOT } = {}) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(safeFile(root, MANIFEST_PATH, "manifest_invalid"), "utf8")); } catch (error) {
    if (error instanceof Error && error.message.startsWith("v12_visual_authority_")) throw error;
    fail("manifest_invalid");
  }
  if (manifest?.schema_version !== 2 || manifest.revision !== 18 || !Array.isArray(manifest.sources)
    || !manifest.portable_fallback || manifest.portable_fallback.kind !== "checked_in_derived_contract") fail("manifest_invalid");
  const sourceIds = manifest.sources.map(({ id }) => id);
  if (!REQUIRED_SOURCES.every((id) => sourceIds.includes(id)) || new Set(sourceIds).size !== sourceIds.length
    || manifest.sources.some(({ id, filename, sha256: digest }) => typeof id !== "string" || typeof filename !== "string"
      || filename !== path.basename(filename) || path.isAbsolute(filename) || !SHA256.test(digest ?? ""))) fail("manifest_invalid");
  const sourceHashes = Object.fromEntries(manifest.sources.map((entry) => [entry.id, entry.sha256]));
  const fallback = manifest.portable_fallback;
  const walkPath = safeFile(root, fallback.serial_walk.path, "portable_fallback_invalid");
  const rendererPath = safeFile(root, fallback.renderer.path, "portable_fallback_invalid");
  const walkBytes = readFileSync(walkPath); const rendererBytes = readFileSync(rendererPath);
  if (sha256(walkBytes) !== fallback.serial_walk.sha256 || sha256(rendererBytes) !== fallback.renderer.sha256) fail("portable_fallback_invalid");
  let walk;
  try { walk = JSON.parse(walkBytes.toString("utf8")); } catch { fail("portable_fallback_invalid"); }
  if (!Array.isArray(walk) || walk.length !== 214) fail("portable_fallback_invalid");
  const digests = deriveV12VisualAuthorityDigests({ walk, rendererSha256: fallback.renderer.sha256, sourceHashes });
  if (digests.semantic_digest !== fallback.semantic_digest || digests.layout_digest !== fallback.layout_digest
    || digests.renderer_digest !== fallback.renderer_digest) fail("portable_fallback_invalid");

  let authorityMode = "checked_in_derived_contract";
  if (typeof externalRoot === "string" && externalRoot.length > 0) {
    const resolved = path.resolve(externalRoot);
    for (const source of manifest.sources) {
      const sourcePath = path.join(resolved, source.filename);
      if (!existsSync(sourcePath) || !lstatSync(sourcePath).isFile() || lstatSync(sourcePath).isSymbolicLink()
        || sha256(readFileSync(sourcePath)) !== source.sha256) fail("external_authority_hash_invalid");
    }
    authorityMode = "external_exact_sources";
  }

  return Object.freeze({ manifest, manifest_path: MANIFEST_PATH, manifest_sha256: sha256(readFileSync(path.join(root, MANIFEST_PATH))), source_hashes: Object.freeze(sourceHashes), walk: Object.freeze(walk), authority_mode: authorityMode, ...digests });
}

export function v12VisualStateAuthority(authority, light, dark) {
  if (!light || !dark || light.name !== dark.name || light.theme !== "light" || dark.theme !== "dark") fail("state_pair_invalid");
  return Object.freeze({
    approved_json_sha256: authority.source_hashes["approved-json"],
    approved_hybrid_html_sha256: authority.source_hashes["approved-hybrid-html"],
    source_manifest_sha256: authority.manifest_sha256,
    renderer_digest: authority.renderer_digest,
    semantic_digest: sha256(JSON.stringify([semanticContract(light), semanticContract(dark)])),
    layout_digest: sha256(JSON.stringify([layoutContract(light), layoutContract(dark)])),
    state_name: light.name,
  });
}

export function validateV12VisualSourceBinding(binding, { root = process.cwd(), stateName } = {}) {
  const authority = loadV12VisualAuthority({ root });
  if (!binding || binding.kind !== "approved_source" || binding.state_name !== stateName
    || binding.approved_json_sha256 !== authority.source_hashes["approved-json"]
    || binding.approved_hybrid_html_sha256 !== authority.source_hashes["approved-hybrid-html"]
    || binding.source_manifest_sha256 !== authority.manifest_sha256
    || binding.renderer_digest !== authority.renderer_digest
    || !SHA256.test(binding.semantic_digest ?? "") || !SHA256.test(binding.layout_digest ?? "")) fail("source_binding_invalid");
  const index = authority.walk.slice(0, 107).findIndex((entry) => entry.name === stateName);
  if (index < 0) fail("source_binding_invalid");
  const expected = v12VisualStateAuthority(authority, authority.walk[index], authority.walk[index + 107]);
  if (JSON.stringify(binding) !== JSON.stringify({ kind: "approved_source", ...expected })) fail("source_binding_invalid");
  return true;
}

export function selectV12VisualReference(state, configuration) {
  const exactOracle = configuration.size === "C390" && configuration.orientation === "P" && configuration.fontScale === 1;
  if (exactOracle && state.reference.kind === "retained_png") {
    return Object.freeze({ kind: "retained_png", ...(configuration.scheme === "dark" ? state.reference.dark : state.reference.light), source: state.reference });
  }
  return Object.freeze({ kind: "approved_source", ...(state.reference.kind === "approved_source" ? state.reference : state.reference.source) });
}
