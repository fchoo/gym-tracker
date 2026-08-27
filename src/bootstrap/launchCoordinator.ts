export type LaunchFailureCategory = "migration" | "storage";

export type LaunchFailure = Readonly<{
  category: LaunchFailureCategory;
  code: string;
  correlationCode: string;
  retryable: boolean;
}>;

export type LaunchResult<Trusted> =
  | Readonly<{
      status: "trusted";
      value: Trusted;
    }>
  | Readonly<{
      status: "failed";
      failure: LaunchFailure;
    }>;

type LaunchPorts<Trusted> = Readonly<{
  openWriter(): Promise<unknown>;
  runMigrations(): Promise<unknown>;
  runIntegrityChecks(): Promise<unknown>;
  openReader(): Promise<unknown>;
  resetStaleEffectClaims(): Promise<unknown>;
  repairRestState(): Promise<unknown>;
  drainUrgentEffects(): Promise<unknown>;
  firstTrustedQuery(): Promise<Trusted>;
}>;

type LaunchPortName = keyof LaunchPorts<unknown>;

const launchFailures: Record<LaunchPortName, LaunchFailure> = {
  openWriter: {
    category: "storage",
    code: "launch_openWriter_failed",
    correlationCode: "GT-WRITER01",
    retryable: true,
  },
  runMigrations: {
    category: "migration",
    code: "launch_runMigrations_failed",
    correlationCode: "GT-MIGRATE1",
    retryable: true,
  },
  runIntegrityChecks: {
    category: "migration",
    code: "launch_runIntegrityChecks_failed",
    correlationCode: "GT-CHECKS01",
    retryable: true,
  },
  openReader: {
    category: "storage",
    code: "launch_openReader_failed",
    correlationCode: "GT-READER01",
    retryable: true,
  },
  resetStaleEffectClaims: {
    category: "storage",
    code: "launch_resetStaleEffectClaims_failed",
    correlationCode: "GT-LEASES01",
    retryable: true,
  },
  repairRestState: {
    category: "storage",
    code: "launch_repairRestState_failed",
    correlationCode: "GT-RESTFIX1",
    retryable: true,
  },
  drainUrgentEffects: {
    category: "storage",
    code: "launch_drainUrgentEffects_failed",
    correlationCode: "GT-EFFECT01",
    retryable: true,
  },
  firstTrustedQuery: {
    category: "storage",
    code: "launch_firstTrustedQuery_failed",
    correlationCode: "GT-QUERY001",
    retryable: true,
  },
};

async function passGate(
  name: LaunchPortName,
  operation: () => Promise<unknown>,
): Promise<LaunchFailure | null> {
  try {
    await operation();
    return null;
  } catch {
    return launchFailures[name];
  }
}

export function createLaunchCoordinator<Trusted>(
  ports: LaunchPorts<Trusted>,
): Readonly<{
  run(): Promise<LaunchResult<Trusted>>;
}> {
  return Object.freeze({
    async run() {
      for (const [name, operation] of [
        ["openWriter", ports.openWriter],
        ["runMigrations", ports.runMigrations],
        ["runIntegrityChecks", ports.runIntegrityChecks],
        ["openReader", ports.openReader],
        ["resetStaleEffectClaims", ports.resetStaleEffectClaims],
        ["repairRestState", ports.repairRestState],
        ["drainUrgentEffects", ports.drainUrgentEffects],
      ] as const) {
        const failure = await passGate(name, operation);
        if (failure !== null) {
          return {
            status: "failed" as const,
            failure,
          };
        }
      }

      try {
        return {
          status: "trusted" as const,
          value: await ports.firstTrustedQuery(),
        };
      } catch {
        return {
          status: "failed" as const,
          failure: launchFailures.firstTrustedQuery,
        };
      }
    },
  });
}
