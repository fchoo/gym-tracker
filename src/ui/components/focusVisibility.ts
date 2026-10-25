// Native focus also follows touches and modal restoration. Keep its visual
// treatment tied to input modality, independently from the native focus target.
let inputModality: "keyboard" | "pointer" = "keyboard";

export function markPointerFocusModality(): void {
  inputModality = "pointer";
}

export function markKeyboardFocusModality(): void {
  inputModality = "keyboard";
}

export function shouldShowFocusRing(): boolean {
  return inputModality === "keyboard";
}
