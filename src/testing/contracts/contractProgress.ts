/** Only fixed operation labels and canonical registry indexes belong in stages. */
export type ContractProgressObserver = (stage: string) => void;

/** Diagnostics must never change source execution or cleanup outcomes. */
export function reportContractProgress<Stage extends string>(observer: ((stage: Stage) => void) | undefined, stage: Stage): void {
  try {
    observer?.(stage);
  } catch {
    // An observer is not part of the acceptance work.
  }
}

/** A pending or rejected await has no completion checkpoint. */
export async function observeContractOperation<Result>(
  observer: ContractProgressObserver | undefined,
  operation: string,
  work: () => Promise<Result>,
): Promise<Result> {
  reportContractProgress(observer, `${operation}:start`);
  const result = await work();
  reportContractProgress(observer, `${operation}:done`);
  return result;
}
