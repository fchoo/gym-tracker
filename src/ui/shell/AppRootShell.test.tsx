import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text, View } from "react-native";

import { AppearanceProvider } from "../theme";
import { useSemanticToast } from "../components/SemanticToast";
import { AppRootShell } from "./AppRootShell";

function ShellToastTrigger() {
  const { enqueue } = useSemanticToast();
  React.useEffect(() => enqueue({ message: "Workout saved" }), [enqueue]);
  return null;
}

describe("AppRootShell", () => {
  it("keeps mounted root content in place and focuses the selected root heading", async () => {
    const workoutHeading = { current: { focus: jest.fn() } };
    const libraryHeading = { current: { focus: jest.fn() } };
    const { rerender } = await render(
      <AppearanceProvider>
        <AppRootShell
          activeRoot="index"
          headingRefs={{ index: workoutHeading, library: libraryHeading }}
        >
          <View>
            <Text>Library query: deadlift</Text>
          </View>
        </AppRootShell>
      </AppearanceProvider>,
    );

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="library"
            headingRefs={{ index: workoutHeading, library: libraryHeading }}
          >
            <View>
              <Text>Library query: deadlift</Text>
            </View>
          </AppRootShell>
        </AppearanceProvider>,
      );
    });

    expect(screen.getByText("Library query: deadlift")).toBeOnTheScreen();
    expect(libraryHeading.current.focus).toHaveBeenCalledTimes(1);
  });

  it("keeps Settings last in the contextual action region", async () => {
    const onOpenSettings = jest.fn();
    await render(
      <AppearanceProvider>
        <AppRootShell activeRoot="index" onOpenSettings={onOpenSettings}>
          <View />
        </AppRootShell>
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Open App Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("restores the exact originating trigger and falls back to the root heading", async () => {
    const trigger = { current: { focus: jest.fn() } };
    const heading = { current: { focus: jest.fn() } };
    const { rerender } = await render(
      <AppearanceProvider>
        <AppRootShell activeRoot="library" headingRefs={{ library: heading }}>
          <View />
        </AppRootShell>
      </AppearanceProvider>,
    );

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell
            activeRoot="library"
            headingRefs={{ library: heading }}
            origin={{ root: "library", trigger }}
          >
            <View />
          </AppRootShell>
        </AppearanceProvider>,
      );
    });
    expect(trigger.current.focus).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <AppearanceProvider>
          <AppRootShell activeRoot="library" headingRefs={{ library: heading }} origin={{ root: "library" }}>
            <View />
          </AppRootShell>
        </AppearanceProvider>,
      );
    });
    expect(heading.current.focus).toHaveBeenCalledTimes(2);
  });

  it("mounts one measured shell-level toast host", async () => {
    await render(
      <AppearanceProvider>
        <AppRootShell toastBottomAvoidance={74} toastTopAvoidance={56}>
          <ShellToastTrigger />
        </AppRootShell>
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("semantic-toast")).toHaveStyle({
      bottom: 90,
      top: 72,
    });
  });
});
