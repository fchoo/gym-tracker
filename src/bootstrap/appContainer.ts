import {
  BoundedDiagnostics,
  Clock,
  SystemClock,
} from "../domains/shared";

export type AppContainer = Readonly<{
  clock: Clock;
  diagnostics: BoundedDiagnostics;
}>;

export type AppContainerOverrides = Partial<AppContainer>;

export function createAppContainer(
  overrides: AppContainerOverrides = {},
): AppContainer {
  return {
    clock: overrides.clock ?? new SystemClock(),
    diagnostics: overrides.diagnostics ?? new BoundedDiagnostics(),
  };
}
