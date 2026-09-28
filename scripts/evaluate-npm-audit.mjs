const APPROVED = new Map([
  [1147955, "GHSA-vcc3-ghjq-m6fr"],
  [1119441, "GHSA-w5hq-g745-h8pq"],
]);
export const AUDIT_EXCEPTION_EXPIRES_ON = "2026-10-31";

export function evaluateAudit(audit, today = new Date().toISOString().slice(0, 10)) {
  if (!audit || typeof audit !== "object" || !audit.metadata?.vulnerabilities || !audit.vulnerabilities) throw new Error("npm_audit_malformed");
  const counts = audit.metadata.vulnerabilities;
  if ((counts.high ?? 0) !== 0 || (counts.critical ?? 0) !== 0 || today > AUDIT_EXCEPTION_EXPIRES_ON) throw new Error("npm_audit_policy_rejected");
  const actual = new Set();
  for (const entry of Object.values(audit.vulnerabilities)) for (const via of entry.via ?? []) {
    if (typeof via !== "object" || via === null || !Number.isInteger(via.source) || typeof via.url !== "string") continue;
    const ghsa = via.url.split("/").at(-1);
    if (APPROVED.get(via.source) !== ghsa || via.severity !== "moderate") throw new Error("npm_audit_policy_rejected");
    actual.add(via.source);
  }
  if (actual.size !== APPROVED.size || [...APPROVED].some(([source]) => !actual.has(source))) throw new Error("npm_audit_policy_rejected");
}

if (process.argv[1]?.endsWith("evaluate-npm-audit.mjs")) {
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
  evaluateAudit(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  process.stdout.write(`npm audit policy passed; review expires ${AUDIT_EXCEPTION_EXPIRES_ON}\n`);
}
