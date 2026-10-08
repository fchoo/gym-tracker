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
    <Pressable accessibilityRole="button" accessibilityLabel="cancel" testID="cancel" onPress={controller.cancel} />
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
    await route.unmount();
    await act(async () => { resolveExport?.({ exportId: "late" }); });

    expect(discard).toHaveBeenCalledWith({ exportId: "late" });
  });

  it("cancels a prepared CSV before sharing and clears its opaque handle", async () => {
    const discard = jest.fn(async () => undefined);
    const route = await render(<Harness
      create={async () => ({ exportId: "prepared-csv" })}
      share={async () => undefined}
      discard={discard}
    />);

    await act(async () => {
      fireEvent.press(route.getByTestId("create"));
      await Promise.resolve();
    });
    expect(route.getByTestId("state").children).toEqual(["ready_to_share"]);

    await act(async () => { fireEvent.press(route.getByTestId("cancel")); });

    expect(discard).toHaveBeenCalledWith({ exportId: "prepared-csv" });
    expect(route.getByTestId("state").children).toEqual(["ready"]);
  });

});
