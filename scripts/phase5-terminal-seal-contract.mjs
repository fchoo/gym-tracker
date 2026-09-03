export function validateTerminalSealDocument(source) {
  const fenced = [...source.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/gu)]
    .flatMap((match) => match[1].split(/\r?\n/u))
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (fenced.length !== 1) {
    throw new Error("Terminal Seal must contain exactly one executable command.");
  }
  const command = fenced[0];
  const tokens = command.split(" ");
  const expected = [
    "npm", "run", "verify:release:phase5", "--",
    "--bundle-dir", "<retained-candidate-directory>",
    "--manifest-sha256", "<manifest-sha256>",
    "--automated-evidence", "<automated-evidence-json>",
    "--attended-record", "<attended-record-json>",
    "--checklist", "<checklist-json>",
    "--observations", "<observations-json>",
    "--evidence-dir", "<attended-evidence-directory>",
    "--phase6-n4-record", "<phase6-n4-record-json>",
    "--phase6-n4-checklist", "<phase6-n4-checklist-json>",
    "--phase6-n4-observations", "<phase6-n4-observations-json>",
    "--phase6-n4-evidence-dir", "<phase6-n4-evidence-directory>",
    "--phase6-n4-run-id", "<phase6-n4-run-id>",
    "--phase6-n4-artifact-name", "<phase6-n4-artifact-name>",
    "--release-tag", "<release-tag>",
    "--candidate-run-id", "<candidate-run-id>",
    "--candidate-repository", "<owner/repository>",
    "--candidate-commit", "<candidate-commit>",
    "--promotion-proof", "<promotion-proof-json>",
    "--promotion-proof-run-id", "<promotion-proof-run-id>",
    "--promotion-proof-artifact-id", "<promotion-proof-artifact-id>",
    "--promotion-proof-artifact-digest", "<promotion-proof-artifact-digest>",
    "--public-assets-dir", "<downloaded-public-assets-directory>",
  ];
  if (JSON.stringify(tokens) !== JSON.stringify(expected)) {
    throw new Error("Terminal Seal executable must only validate the existing candidate and evidence.");
  }
  for (const required of [
    "05-07-SUMMARY.md", "verification", "tracking", "review",
    "literal final executable command", "no tool call", "promotion is complete",
  ]) {
    if (!source.toLowerCase().includes(required.toLowerCase())) {
      throw new Error(`Terminal Seal ordering contract is missing: ${required}`);
    }
  }
}
