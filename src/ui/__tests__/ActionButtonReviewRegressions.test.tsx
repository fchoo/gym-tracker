import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionCluster, ActionRow, IconAction, PrimaryAction, SecondaryAction } from "../components";
import { PlanRow } from "../components/PlanRow";
import { AppearanceProvider } from "../theme";

const kinds = ["Recovery", "Long run", "Progression", "Tempo", "Intervals", "Hills", "Fartlek"] as const;

describe("action button review recovery", () => {
  it("keeps an icon sidebar intrinsic so a horizontal title retains available width", async () => {
    await render(<AppearanceProvider><View style={{ flexDirection: "row", width: 320 }}>
      <Text style={{ flex: 1 }} testID="title">Exercise title</Text>
      <ActionCluster style={{ alignSelf: "stretch" }} testID="sidebar"><IconAction accessibilityLabel="Favorite exercise" icon="favorite" onPress={jest.fn()} /></ActionCluster>
    </View></AppearanceProvider>);
    expect(StyleSheet.flatten(screen.getByTestId("sidebar").props.style).width).toBeUndefined();
    expect(screen.getByTestId("sidebar")).toHaveStyle({ flexDirection: "row", justifyContent: "flex-end" });
    expect(screen.getByRole("button", { name: "Favorite exercise" })).toHaveStyle({ width: 48 });
    expect(screen.getByTestId("title")).toHaveStyle({ flex: 1 });
  });

  it("keeps the actual PlanRow update sidebar from claiming the title row width", async () => {
    await render(<AppearanceProvider><PlanRow item={{ id: "plan", name: "Plan title", daysPerWeek: 3, templateUpdateTemplateId: "template" }} onPress={jest.fn()} onOpenTemplateUpdate={jest.fn()} /></AppearanceProvider>);
    const main = screen.getByRole("button", { name: /^Plan title\./ });
    const row = main.parent!;
    const sidebar = row.children.find((child) => typeof child !== "string" && child !== main)!;
    expect(typeof sidebar).not.toBe("string");
    if (typeof sidebar === "string") throw new Error("Missing sidebar");
    expect(StyleSheet.flatten(sidebar.props.style).width).toBeUndefined();
    expect(main).toHaveStyle({ flex: 1, minWidth: 0 });
    expect(screen.getByRole("button", { name: "Template update available for Plan title" }).parent).toBe(sidebar);
  });

  it("retains the explicit full-width equal action row contract", async () => {
    await render(<AppearanceProvider><ActionRow testID="decisions"><SecondaryAction label="Cancel" onPress={jest.fn()} /><PrimaryAction label="Save" onPress={jest.fn()} /></ActionRow></AppearanceProvider>);
    expect(screen.getByTestId("decisions")).toHaveStyle({ width: "100%", flexWrap: "nowrap" });
  });

  it("keeps Retry visible in the failed-set half dock and preserves its full accessible name", async () => {
    const retry = jest.fn();
    await render(<AppearanceProvider><PrimaryAction label="Set not saved · Retry" onPress={retry} /></AppearanceProvider>);
    const caption = screen.getByText("Set not saved · Retry");
    await fireEvent(caption.parent!, "layout", { nativeEvent: { layout: { width: 128 } } });
    expect(screen.getByText("Retry")).toHaveProp("numberOfLines", 1);
    expect(screen.queryByText("Set not saved · Retry")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Set not saved · Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each(kinds)("retains %s choice identity when the Add-session caption is too wide", async (kind) => {
    await render(<AppearanceProvider><SecondaryAction label={`Add ${kind} session`} onPress={jest.fn()} /></AppearanceProvider>);
    const caption = screen.getByText(`Add ${kind} session`);
    await fireEvent(caption.parent!, "layout", { nativeEvent: { layout: { width: 160 } } });
    // Native width, rather than the renderer's default font-scale estimate, chooses the fitting kind caption.
    await fireEvent(screen.getAllByText(kind, { includeHiddenElements: true }).find((node) => typeof node.props.onTextLayout === "function")!, "textLayout", { nativeEvent: { lines: [{ width: 120 }] } });
    expect(screen.getByText(kind)).toHaveProp("numberOfLines", 1);
    expect(screen.queryByText("Add")).toBeNull();
    expect(screen.getByRole("button", { name: `Add ${kind} session` })).toBeOnTheScreen();
  });

  it("uses distinct glyphs for all seven running kinds when enlarged captions cannot fit", async () => {
    const signatures = [];
    for (const kind of kinds) {
      const rendered = await render(<AppearanceProvider><SecondaryAction label={`Add ${kind} session`} onPress={jest.fn()} /></AppearanceProvider>);
      const caption = screen.getByText(`Add ${kind} session`);
      await fireEvent(caption.parent!, "layout", { nativeEvent: { layout: { width: 24 } } });
      expect(screen.queryByText(kind)).toBeNull();
      const svgNodes: unknown[] = [];
      function collect(node: unknown) {
        if (node === null || typeof node !== "object") return;
        const item = node as { type?: string; props?: unknown; children?: readonly unknown[] };
        if (item.type?.startsWith("RNSVG") === true) svgNodes.push({ type: item.type, props: item.props });
        item.children?.forEach(collect);
      }
      collect(rendered.toJSON());
      expect(svgNodes.length).toBeGreaterThan(0);
      signatures.push(JSON.stringify(svgNodes));
      await rendered.unmount();
    }
    expect(new Set(signatures).size).toBe(7);
  });
});
