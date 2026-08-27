export const APP_ERROR_KINDS = [
  "validation",
  "conflict",
  "storage",
  "migration",
  "permission",
  "crypto",
  "unsupported_version",
  "transient_platform",
] as const;

export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

export type AppErrorMetadata = Readonly<{
  revision?: number;
  expectedRevision?: number;
  fromVersion?: number;
  toVersion?: number;
  version?: number;
  capability?: string;
}>;

export type AppError = Readonly<{
  kind: AppErrorKind;
  code: string;
  retryable: boolean;
  correlationCode: string;
  metadata?: AppErrorMetadata;
}>;

export type CreateAppErrorInput = {
  kind: AppErrorKind;
  code: string;
  retryable: boolean;
  correlationCode: string;
  metadata?: AppErrorMetadata;
};

const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const CORRELATION_CODE_PATTERN = /^GT-[A-Z0-9]{8,16}$/;

export function createAppError(input: CreateAppErrorInput): AppError {
  if (!ERROR_CODE_PATTERN.test(input.code)) {
    throw new TypeError("Invalid application error code");
  }

  if (!CORRELATION_CODE_PATTERN.test(input.correlationCode)) {
    throw new TypeError("Invalid correlation code");
  }

  return input.metadata === undefined
    ? {
        kind: input.kind,
        code: input.code,
        retryable: input.retryable,
        correlationCode: input.correlationCode,
      }
    : {
        kind: input.kind,
        code: input.code,
        retryable: input.retryable,
        correlationCode: input.correlationCode,
        metadata: { ...input.metadata },
      };
}

export function mapUnknownError(
  _unknown: unknown,
  fallback: CreateAppErrorInput,
): AppError {
  return createAppError(fallback);
}

export class BoundaryValidationError extends Error {
  readonly kind: "validation" | "unsupported_version";
  readonly code: string;
  readonly retryable = false;
  readonly correlationCode: string;
  readonly metadata?: AppErrorMetadata;

  constructor(input: {
    kind: "validation" | "unsupported_version";
    code: string;
    correlationCode: string;
    metadata?: AppErrorMetadata;
  }) {
    super(input.code);
    this.name = "BoundaryValidationError";
    this.kind = input.kind;
    this.code = input.code;
    this.correlationCode = input.correlationCode;
    if (input.metadata !== undefined) {
      this.metadata = { ...input.metadata };
    }
  }
}
