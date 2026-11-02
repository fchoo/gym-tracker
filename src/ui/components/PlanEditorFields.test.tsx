import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../theme";
import { PlanEditorTextField } from "./PlanEditorFields";

describe("PlanEditorTextField", () => {
  it("keeps an editor field and its validation feedback reachable at 200% text", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <PlanEditorTextField
          error="Enter a complete target."
          label="Working sets"
          onChangeText={jest.fn()}
          value="2"
        />
      </AppearanceProvider>,
    );

    expect(rendered.getByLabelText("Working sets")).toHaveStyle({
      minHeight: 56,
    });
    expect(rendered.getByText("Enter a complete target.")).toHaveProp(
      "accessibilityLiveRegion",
      "polite",
    );
  });
});
