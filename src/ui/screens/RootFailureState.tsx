import React, {
  useState,
} from "react";

import {
  EmptyState,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
} from "../components";

export type RootLaunchFailure = Readonly<{
  category: "migration" | "storage";
  code: string;
  correlationCode: string;
  retryable: boolean;
}>;

function categoryLabel(category: RootLaunchFailure["category"]): string {
  return category === "migration" ? "Migration" : "Storage";
}

export function RootFailureState({
  failure,
  onRetry,
}: Readonly<{
  failure: RootLaunchFailure;
  onRetry: () => void;
}>) {
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  return (
    <EmptyState
      body="Your saved data was not changed. Try again."
      heading="Workout data could not be opened"
      primaryAction={
        <PrimaryAction
          disabled={!failure.retryable}
          label="Retry opening workout data"
          onPress={onRetry}
        />
      }
      secondaryAction={
        <>
          <SecondaryAction
            label="View diagnostic code"
            onPress={() => setShowDiagnostic((visible) => !visible)}
          />
          {showDiagnostic ? (
            <InlineNotice
              body={`${categoryLabel(failure.category)} · ${failure.correlationCode}`}
              heading="Diagnostic code"
              tone="error"
            />
          ) : null}
        </>
      }
    />
  );
}
