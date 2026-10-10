import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import {
  RunningSessionFields,
  initialRunningSessionFormDraft,
  type RunningSessionFormDraft,
} from "./RunningSessionFields";
import { AppearanceProvider } from "../theme";

describe("RunningSessionFields", () => {
  it("shows only Recovery fields and keeps its exact semantic target", async () => {
    const onChange = jest.fn();
    const view = await render(<AppearanceProvider><RunningSessionFields
      draft={initialRunningSessionFormDraft("recovery", "Monday")}
      onChange={onChange}
    /></AppearanceProvider>);

    expect(view.getByLabelText("Volume (metres)")).toBeOnTheScreen();
    expect(view.getByText("Easy target")).toBeOnTheScreen();
    expect(view.queryByText("Finish")).not.toBeOnTheScreen();
    expect(view.queryByText("Stages")).not.toBeOnTheScreen();

    fireEvent.changeText(view.getByLabelText("Volume (metres)"), "5000");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ volume: "5000" }));
  });

  it("keeps separate Long run and Progression validation shapes", async () => {
    const longRun: RunningSessionFormDraft = {
      ...initialRunningSessionFormDraft("long_run", "Tuesday"),
      finish: "progression_finish",
      volume: "12000",
    };
    const view = await render(<AppearanceProvider><RunningSessionFields draft={longRun} onChange={jest.fn()} /></AppearanceProvider>);
    expect(view.getByText("Effort target")).toBeOnTheScreen();

    await view.rerender(<AppearanceProvider><RunningSessionFields
      draft={{
        ...initialRunningSessionFormDraft("progression", "Wednesday"),
        volume: "9000",
        stages: "3",
      }}
      onChange={jest.fn()}
    /></AppearanceProvider>);
    expect(view.getByText("Start target")).toBeOnTheScreen();
    expect(view.getByText("Finish target")).toBeOnTheScreen();
    expect(view.getByLabelText("Stages")).toBeOnTheScreen();
    expect(view.queryByText("Effort target")).not.toBeOnTheScreen();
  });

  it("shows the Tempo and Intervals contextual fields without leaking a hidden recovery branch", async () => {
    const onChange = jest.fn();
    const view = await render(<AppearanceProvider><RunningSessionFields
      draft={initialRunningSessionFormDraft("tempo", "Monday")}
      onChange={onChange}
    /></AppearanceProvider>);

    expect(view.getByText("Format")).toBeOnTheScreen();
    expect(view.getByRole("button", { name: "Format Continuous" })).toBeOnTheScreen();
    expect(view.getByLabelText("Work (minutes)")).toBeOnTheScreen();
    expect(view.getByText("Intensity target")).toBeOnTheScreen();
    expect(view.queryByLabelText("Repeats")).not.toBeOnTheScreen();
    expect(view.queryByLabelText("Recovery duration milliseconds")).not.toBeOnTheScreen();

    await view.rerender(<AppearanceProvider><RunningSessionFields
      draft={{ ...initialRunningSessionFormDraft("intervals", "Tuesday"), repeats: "4" } as never}
      onChange={onChange}
    /></AppearanceProvider>);
    expect(view.getByLabelText("Repeats")).toBeOnTheScreen();
    expect(view.getByLabelText("Work (minutes)")).toBeOnTheScreen();
    expect(view.getByLabelText("Recovery (minutes)")).toBeOnTheScreen();
    expect(view.getByText("Intensity target")).toBeOnTheScreen();
    expect(view.queryByText("Format")).not.toBeOnTheScreen();
  });

  it("keeps Hills uphill and return recovery as separate unit-bearing controls", async () => {
    const view = await render(<AppearanceProvider><RunningSessionFields
      draft={initialRunningSessionFormDraft("hills", "Saturday")}
      onChange={jest.fn()}
    /></AppearanceProvider>);

    expect(view.getByLabelText("Repeats")).toBeOnTheScreen();
    expect(view.getByLabelText("Uphill (minutes)")).toBeOnTheScreen();
    expect(view.getByLabelText("Return recovery (minutes)")).toBeOnTheScreen();
    expect(view.getByText("Effort target")).toBeOnTheScreen();
    expect(view.queryByLabelText("Work (minutes)")).not.toBeOnTheScreen();
  });

  it("keeps Structured and Unstructured Fartlek fields distinct", async () => {
    const view = await render(<AppearanceProvider><RunningSessionFields
      draft={initialRunningSessionFormDraft("fartlek", "Sunday")}
      onChange={jest.fn()}
    /></AppearanceProvider>);
    expect(view.getByRole("button", { name: "Style Structured" })).toBeOnTheScreen();
    expect(view.getByLabelText("Surges / repeats")).toBeOnTheScreen();
    expect(view.getByLabelText("Fast segment (minutes)")).toBeOnTheScreen();
    expect(view.getByLabelText("Easy float / recovery (minutes)")).toBeOnTheScreen();
    expect(view.queryByLabelText("Fast cue")).not.toBeOnTheScreen();

    await view.rerender(<AppearanceProvider><RunningSessionFields
      draft={{ ...initialRunningSessionFormDraft("fartlek", "Sunday"), fartlekStyle: "unstructured" } as never}
      onChange={jest.fn()}
    /></AppearanceProvider>);
    expect(view.getByLabelText("Fast cue")).toBeOnTheScreen();
    expect(view.getByLabelText("Easy recovery cue")).toBeOnTheScreen();
    expect(view.queryByLabelText("Fast segment (minutes)")).not.toBeOnTheScreen();
  });
});
