import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  FakeClock,
} from "./index";
import {
  createAppContainer,
} from "../../bootstrap/appContainer";

describe("application container", () => {
  it("composes explicit shared dependencies and honors injected ports", () => {
    const clock = new FakeClock(1_726_780_800_000);

    const container = createAppContainer({ clock });

    expect(container.clock).toBe(clock);
    expect(container.diagnostics.serialize()).toBe("[]");
  });

  it("constructs production-safe defaults without a DI framework", () => {
    const container = createAppContainer();

    expect(container.clock.nowMs()).toBeGreaterThan(0);
    expect(container.diagnostics.serialize()).toBe("[]");
  });
});
