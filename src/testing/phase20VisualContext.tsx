import React from "react";

import type { Phase20VisualRequest } from "./phase20VisualRequest";

const Phase20VisualContext = React.createContext<Phase20VisualRequest | null>(null);
export type Phase20VisualScrollOffset = Readonly<{
  native_id: string;
  x: number;
  y: number;
}>;
export type Phase20VisualProductionMount = Readonly<{
  production_instance_id: string;
  mount_id: string;
}>;
const Phase20VisualScrollContext = React.createContext<((offset: Phase20VisualScrollOffset) => void) | null>(null);
const Phase20VisualProductionMountContext = React.createContext<((mount: Phase20VisualProductionMount) => void) | null>(null);

export function Phase20VisualContextProvider({
  children,
  onProductionMount = null,
  onScrollOffset = null,
  request,
}: Readonly<{
  children: React.ReactNode;
  onProductionMount?: ((mount: Phase20VisualProductionMount) => void) | null;
  onScrollOffset?: ((offset: Phase20VisualScrollOffset) => void) | null;
  request: Phase20VisualRequest;
}>) {
  return (
    <Phase20VisualContext.Provider value={request}>
      <Phase20VisualProductionMountContext.Provider value={onProductionMount}>
        <Phase20VisualScrollContext.Provider value={onScrollOffset}>
          {children}
        </Phase20VisualScrollContext.Provider>
      </Phase20VisualProductionMountContext.Provider>
    </Phase20VisualContext.Provider>
  );
}

export function usePhase20VisualRequest(): Phase20VisualRequest | null {
  return React.useContext(Phase20VisualContext);
}

export function usePhase20VisualScrollReporter(): ((offset: Phase20VisualScrollOffset) => void) | null {
  return React.useContext(Phase20VisualScrollContext);
}

export function usePhase20VisualProductionMountReporter(): ((mount: Phase20VisualProductionMount) => void) | null {
  return React.useContext(Phase20VisualProductionMountContext);
}
