import {
  validateBodyweightCommand,
  type BodyweightCommand,
  type BodyweightTransition,
} from "./contracts";

export type BodyweightCommandRepository = Readonly<{
  commit(input: BodyweightCommand): Promise<BodyweightTransition>;
}>;

export async function commitBodyweightCommand(
  repository: BodyweightCommandRepository,
  input: BodyweightCommand,
): Promise<BodyweightTransition> {
  validateBodyweightCommand(input);
  return repository.commit(input);
}
