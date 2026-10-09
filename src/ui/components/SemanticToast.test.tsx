import { act, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { StyleSheet } from "react-native";

import {
  SemanticToastBoundary,
  SemanticToastProvider,
  useSemanticToast,
} from "./SemanticToast";
import { AppearanceProvider } from "../theme";

function ToastTrigger({ events }: Readonly<{ events: readonly { message: string; severity?: "success" | "progress" | "error" }[] }>) {
  const { enqueue } = useSemanticToast();
  React.useEffect(() => {
    events.forEach(enqueue);
  }, [enqueue, events]);
  return null;
}

describe("SemanticToast", () => {
  it("announces success and progress politely, failures assertively, and de-duplicates identical copy", async () => {
    await render(
      <AppearanceProvider>
        <SemanticToastProvider>
          <ToastTrigger events={[
            { message: "Workout saved", severity: "success" },
            { message: "Workout saved", severity: "success" },
            { message: "Syncing backup", severity: "progress" },
            { message: "Backup needs attention", severity: "error" },
          ]} />
        </SemanticToastProvider>
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("semantic-toast")).toHaveProp(
      "accessibilityLiveRegion",
      "polite",
    );
    expect(screen.getByTestId("semantic-toast")).toHaveProp(
      "accessibilityLabel",
      "Workout saved",
    );
    expect(screen.getByTestId("semantic-toast")).toHaveProp("accessible", true);
    expect(screen.getAllByText("Workout saved")).toHaveLength(1);
  });

  it("uses a stable queue and never displays raw diagnostic values", async () => {
    await render(
      <AppearanceProvider>
        <SemanticToastProvider>
          <ToastTrigger events={[
            { message: "First saved" },
            { message: "Second saved" },
            { message: "Error: /Users/test token=secret", severity: "error" },
          ]} />
        </SemanticToastProvider>
      </AppearanceProvider>,
    );

    expect(screen.getByText("First saved")).toBeOnTheScreen();
    expect(screen.queryByText(/token=secret/u)).toBeNull();
  });

  it("reuses an existing provider instead of creating a split queue", async () => {
    await render(
      <AppearanceProvider>
        <SemanticToastProvider>
          <SemanticToastBoundary bottomAvoidance={400} topAvoidance={300}>
            <ToastTrigger events={[{ message: "Workout saved" }]} />
          </SemanticToastBoundary>
        </SemanticToastProvider>
      </AppearanceProvider>,
    );

    expect(screen.getAllByTestId("semantic-toast-host")).toHaveLength(1);
    expect(StyleSheet.flatten(screen.getByTestId("semantic-toast-host").props.style))
      .toMatchObject({ bottom: 16, top: 16 });
  });

  it("keeps a naturally sized toast inside the measured top and bottom corridor", async () => {
    jest.useFakeTimers();
    await render(
      <AppearanceProvider>
        <SemanticToastProvider bottomAvoidance={74} topAvoidance={56}>
          <ToastTrigger events={[{ message: "Workout saved" }]} />
        </SemanticToastProvider>
      </AppearanceProvider>,
    );

    const hostStyle = StyleSheet.flatten(
      screen.getByTestId("semantic-toast-host").props.style,
    );
    const toastStyle = StyleSheet.flatten(
      screen.getByTestId("semantic-toast").props.style,
    );
    expect(hostStyle).toMatchObject({
      bottom: 90,
      left: 16,
      position: "absolute",
      right: 16,
      top: 72,
    });
    expect(toastStyle).toMatchObject({
      borderRadius: 12,
      minHeight: 50,
    });
    expect(toastStyle.position).toBeUndefined();
    expect(toastStyle.top).toBeUndefined();
    expect(toastStyle.bottom).toBeUndefined();
    await act(() => jest.advanceTimersByTime(2400));
    expect(screen.queryByText("Workout saved")).toBeNull();
    jest.useRealTimers();
  });
});
