import {
  SqliteConnection,
  SqliteStatementFinalizeError,
} from "./connection";

export const SQLITE_BEGIN_IMMEDIATE = "BEGIN IMMEDIATE" as const;
export const SQLITE_COMMIT = "COMMIT" as const;
export const SQLITE_ROLLBACK = "ROLLBACK" as const;

export type SqliteWriterFailureStage =
  | "begin"
  | "commit"
  | "rollback"
  | "statement"
  | "transaction";

export class SqliteWriterError extends Error {
  constructor(
    readonly stage: SqliteWriterFailureStage,
    readonly cause: unknown,
  ) {
    super(`sqlite_${stage}_failed`);
    this.name = "SqliteWriterError";
  }
}

export class SerializedWriteExecutor {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly writer: SqliteConnection,
    private readonly beforeCommit?: () => Promise<void>,
  ) {}

  execute<Result>(
    command: (writer: SqliteConnection) => Promise<Result>,
  ): Promise<Result> {
    const pending = this.tail.then(() => this.executeExclusive(command));
    this.tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private async executeExclusive<Result>(
    command: (writer: SqliteConnection) => Promise<Result>,
  ): Promise<Result> {
    try {
      await this.writer.execAsync(SQLITE_BEGIN_IMMEDIATE);
    } catch (error) {
      throw new SqliteWriterError("begin", error);
    }

    let result: Result;
    try {
      result = await command(this.writer);
    } catch (error) {
      await this.rollback(error);
      throw new SqliteWriterError(
        error instanceof SqliteStatementFinalizeError ? "statement" : "transaction",
        error,
      );
    }

    try {
      await this.beforeCommit?.();
      await this.writer.execAsync(SQLITE_COMMIT);
      return result;
    } catch (error) {
      await this.rollback(error);
      throw new SqliteWriterError("commit", error);
    }
  }

  private async rollback(originalError: unknown): Promise<void> {
    try {
      await this.writer.execAsync(SQLITE_ROLLBACK);
    } catch (rollbackError) {
      throw new SqliteWriterError("rollback", {
        originalError,
        rollbackError,
      });
    }
  }
}
