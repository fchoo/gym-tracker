import React from "react";

import type { Phase20VisualRequest } from "./phase20VisualRequest";

const Phase20VisualContext = React.createContext<Phase20VisualRequest | null>(null);

export function Phase20VisualContextProvider({
  children,
  request,
}: Readonly<{
  children: React.ReactNode;
  request: Phase20VisualRequest;
}>) {
  return (
    <Phase20VisualContext.Provider value={request}>
      {children}
    </Phase20VisualContext.Provider>
  );
}

export function usePhase20VisualRequest(): Phase20VisualRequest | null {
  return React.useContext(Phase20VisualContext);
}
