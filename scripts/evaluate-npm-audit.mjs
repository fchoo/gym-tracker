const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

export function evaluateAudit(audit) {
  if (
    !audit ||
    typeof audit !== "object" ||
    !audit.metadata?.vulnerabilities ||
    !audit.vulnerabilities ||
    typeof audit.vulnerabilities !== "object"
  ) {
    throw new Error("npm_audit_malformed");
  }

  const counts = audit.metadata.vulnerabilities;
  const hasReportedCount = [...SEVERITIES, "total"].some(
    (severity) => (counts[severity] ?? 0) !== 0,
  );
  if (hasReportedCount || Object.keys(audit.vulnerabilities).length !== 0) {
    throw new Error("npm_audit_policy_rejected");
  }
}

if (process.argv[1]?.endsWith("evaluate-npm-audit.mjs")) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  evaluateAudit(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  process.stdout.write("npm audit policy passed; no advisories reported\n");
}
