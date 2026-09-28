import { act, fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";

import { useCsvExportController } from "./useCsvExportController";

function Harness(input: Parameters<typeof useCsvExportController<{ exportId: string }>>[0]) {
  const controller = useCsvExportController(input);
  return <>
    <Text testID="state">{controller.state.kind}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="create" testID="create" onPress={() => { void controller.create(); }} />
    <Pressable accessibilityRole="button" accessibilityLabel="share" testID="share" onPress={() => { void controller.share(); }} />
  </>;
}

describe("useCsvExportController", () => {
  it("disposes a late export after unmount without publishing it", async () => {
    let resolveExport: ((value: { exportId: string }) => void) | undefined;
    const create = jest.fn(() => new Promise<{ exportId: string }>((resolve) => {
      resolveExport = resolve;
    }));
    const discard = jest.fn(async () => undefined);
    const route = await render(<Harness
      create={create}
      share={async () => undefined}
      discard={discard}
    />);

    await act(async () => {
      fireEvent.press(route.getByTestId("create"));
      await Promise.resolve();
    });
    route.unmount();
    await act(async () => { resolveExport?.({ exportId: "late" }); });

    expect(discard).toHaveBeenCalledWith({ exportId: "late" });
  });

});
