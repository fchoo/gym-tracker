import React, { useMemo } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";

import { AppTabs } from "../components";
import { AppRootShell } from "../shell/AppRootShell";
import type { RootRouteKey } from "../shell/rootFocus";
import { useAppTheme } from "../theme";

export type GarminRouteOrigin = "workout" | RootRouteKey;

function rootForOrigin(origin: GarminRouteOrigin): RootRouteKey {
  return origin === "workout" ? "index" : origin;
}

function hrefForRoot(root: RootRouteKey): Href {
  if (root === "index") {
    return "/";
  }
  return `/${root}` as Href;
}

export function GarminRouteShell({
  children,
  origin,
}: Readonly<{
  children: React.ReactNode;
  origin: GarminRouteOrigin;
}>) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const activeRoot = rootForOrigin(origin);
  const state = useMemo(() => ({
    index: activeRoot === "index"
      ? 0
      : activeRoot === "calendar"
        ? 1
        : activeRoot === "library"
          ? 2
          : 3,
    routes: [
      { key: "root-index", name: "index" },
      { key: "root-calendar", name: "calendar" },
      { key: "root-library", name: "library" },
      { key: "root-progress", name: "progress" },
    ] as const,
  }), [activeRoot]);
  const navigation = useMemo(() => ({
    emit: () => ({ defaultPrevented: false }),
    navigate: (name: string) => {
      if (name === "index" || name === "calendar" || name === "library" || name === "progress") {
        router.navigate(hrefForRoot(name));
      }
    },
  }), [router]);

  return (
    <AppRootShell activeRoot={activeRoot} currentPath="/garmin">
      <View style={{ backgroundColor: colors.canvas, flex: 1 }}>
        <View style={{ flex: 1 }}>
          {children}
        </View>
        <AppTabs navigation={navigation} state={state} />
      </View>
    </AppRootShell>
  );
}
