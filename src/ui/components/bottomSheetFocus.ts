import React from "react";

import { sizes } from "../theme";

export type BottomSheetFocusableTarget = Readonly<{ focus?: () => void }>;
export type BottomSheetFocusableRef = React.RefObject<BottomSheetFocusableTarget | null>;

export type BottomSheetFocusRegistration = Readonly<{
  onFocus: (ref: BottomSheetFocusableRef) => void;
  register: (ref: BottomSheetFocusableRef) => () => void;
  moveFocus: (direction: "next" | "previous") => boolean;
}>;

export const BottomSheetFocusContext = React.createContext<BottomSheetFocusRegistration | null>(
  null,
);

const FocusClearanceContext = React.createContext<number>(sizes.focusClearance);

export function FocusClearanceProvider({ children, clearance }: Readonly<{
  children: React.ReactNode;
  clearance: number;
}>) {
  return React.createElement(FocusClearanceContext.Provider, { value: clearance }, children);
}

export function useFocusClearance(): number {
  return React.useContext(FocusClearanceContext);
}

export function useBottomSheetFocusRegistration(): BottomSheetFocusRegistration | null {
  return React.useContext(BottomSheetFocusContext);
}
