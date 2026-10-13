export type V12Target = Readonly<{ widthDp: number; heightDp: number; overlap: boolean }>;

/** Static contract for the native observation shard; it does not claim device evidence. */
export function validateV12AccessibilityContract(value: Readonly<{
  fontScale: number;
  focusRingDp: number;
  focusOffsetDp: number;
  target: V12Target;
}>): boolean {
  if (value.fontScale !== 2 || value.focusRingDp !== 3 || value.focusOffsetDp !== 3
    || value.target.widthDp < 48 || value.target.heightDp < 48 || value.target.overlap) {
    throw new Error("v12_accessibility_contract_invalid");
  }
  return true;
}
