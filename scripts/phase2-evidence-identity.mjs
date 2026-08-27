export function validateImplementationIdentity({
  manifestHead,
  currentHead,
  changedPaths,
  manifestSourceSha256,
  currentSourceSha256,
  implementationSourceSha256,
}) {
  if (currentHead === manifestHead) {
    if (currentSourceSha256 !== manifestSourceSha256) {
      throw new Error("current implementation source digest is stale.");
    }
    return;
  }
  if (
    changedPaths.length < 1
    || changedPaths.some((filePath) => !filePath.startsWith(".planning/"))
  ) {
    throw new Error(
      "current HEAD differs from the implementation HEAD outside planning metadata.",
    );
  }
  if (implementationSourceSha256 !== manifestSourceSha256) {
    throw new Error("implementation source digest does not match the manifest.");
  }
}
