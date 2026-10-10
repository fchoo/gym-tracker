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

    expect(view.getByLabelText("Volume distance metres")).toBeOnTheScreen();
    expect(view.getByText("Easy target")).toBeOnTheScreen();
    expect(view.queryByText("Finish")).not.toBeOnTheScreen();
    expect(view.queryByText("Stages")).not.toBeOnTheScreen();

    fireEvent.changeText(view.getByLabelText("Volume distance metres"), "5000");
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
});
