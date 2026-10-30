import {
  canonicalBodyweightRequestPayload,
  validateBodyweightCommand,
  type BodyweightCommand,
  type BodyweightTransition,
} from "./contracts";

export type BodyweightCommandRepository = Readonly<{
  commit(input: BodyweightCommand): Promise<BodyweightTransition>;
}>;

export type BodyweightRequestSha256 = (canonicalRequest: string) => Promise<string>;

export async function commitBodyweightCommand(
  repository: BodyweightCommandRepository,
  input: BodyweightCommand,
  sha256: BodyweightRequestSha256,
): Promise<BodyweightTransition> {
  const { requestSha256: _requestSha256, ...request } = input;
  const expectedRequestSha256 = await sha256(canonicalBodyweightRequestPayload(request));
  validateBodyweightCommand(input, expectedRequestSha256);
  return repository.commit(input);
}
