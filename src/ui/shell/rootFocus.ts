import React from "react";

export type RootRouteKey = "index" | "calendar" | "library" | "progress";
export type RootFocusTarget = Readonly<{ focus?: () => void }>;
export type RootOrigin = Readonly<{
  root: RootRouteKey;
  trigger?: React.RefObject<RootFocusTarget | null>;
}>;
export type RootHeadingRefs = Readonly<Record<
  RootRouteKey,
  React.RefObject<RootFocusTarget | null>
>>;

const RootHeadingRefsContext = React.createContext<RootHeadingRefs | null>(null);

export function RootHeadingRefsProvider({
  children,
  headingRefs,
}: Readonly<{
  children: React.ReactNode;
  headingRefs: RootHeadingRefs;
}>) {
  return React.createElement(
    RootHeadingRefsContext.Provider,
    { value: headingRefs },
    children,
  );
}

export function useRootHeadingRef(
  root: RootRouteKey,
): React.RefObject<RootFocusTarget | null> {
  const headingRefs = React.useContext(RootHeadingRefsContext);
  const fallbackRef = React.useRef<RootFocusTarget | null>(null);
  return headingRefs?.[root] ?? fallbackRef;
}
