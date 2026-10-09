import React from "react";

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

export function useBottomSheetFocusRegistration(): BottomSheetFocusRegistration | null {
  return React.useContext(BottomSheetFocusContext);
}
