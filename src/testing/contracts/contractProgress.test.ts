import { describe, expect, it } from "@jest/globals";
import { observeContractOperation, reportContractProgress } from "./contractProgress";

describe("source-owned contract progress", () => {
  it("isolates absent and throwing observers from genuine work", async () => {
    reportContractProgress(undefined, "case-1:start");
    reportContractProgress(() => { throw new Error("observer_failed"); }, "case-1:start");
    const stages: string[] = [];
    const result = await observeContractOperation((stage) => {
      stages.push(stage);
      throw new Error("observer_failed");
    }, "open", async () => 7);
    expect(result).toBe(7);
    expect(stages).toEqual(["open:start", "open:done"]);
    await expect(observeContractOperation(undefined, "close", async () => 8)).resolves.toBe(8);
  });

  it("never claims a pending or rejected operation completed", async () => {
    const stages: string[] = [];
    let finish!: (value: number) => void;
    const pending = observeContractOperation((stage) => stages.push(stage), "readback", () => new Promise<number>((resolve) => { finish = resolve; }));
    expect(stages).toEqual(["readback:start"]);
    finish(9);
    await expect(pending).resolves.toBe(9);
    expect(stages).toEqual(["readback:start", "readback:done"]);
    const failure = new Error("work_failed");
    await expect(observeContractOperation((stage) => stages.push(stage), "close", async () => { throw failure; })).rejects.toBe(failure);
    expect(stages.at(-1)).toBe("close:start");
  });
});
