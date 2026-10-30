import { describe, expect, it } from "@jest/globals";

import { validateV12AccessibilityContract } from "./v12Accessibility.contract";

describe("v1.2 accessibility contract", () => {
  it("locks actual F200, 48dp targets, and the Phase 14 focus ring", () => {
    expect(validateV12AccessibilityContract({ fontScale: 2, focusRingDp: 3, focusOffsetDp: 3, target: { widthDp: 48, heightDp: 48, overlap: false } })).toBe(true);
  });

  it("rejects each source-of-truth accessibility constraint", () => {
    const valid = { fontScale: 2, focusRingDp: 3, focusOffsetDp: 3, target: { widthDp: 48, heightDp: 48, overlap: false } };
    expect(() => validateV12AccessibilityContract({ ...valid, fontScale: 1 })).toThrow("v12_accessibility_contract_invalid");
    expect(() => validateV12AccessibilityContract({ ...valid, focusRingDp: 2 })).toThrow("v12_accessibility_contract_invalid");
    expect(() => validateV12AccessibilityContract({ ...valid, focusOffsetDp: 2 })).toThrow("v12_accessibility_contract_invalid");
    expect(() => validateV12AccessibilityContract({ ...valid, target: { ...valid.target, widthDp: 47 } })).toThrow("v12_accessibility_contract_invalid");
    expect(() => validateV12AccessibilityContract({ ...valid, target: { ...valid.target, heightDp: 47 } })).toThrow("v12_accessibility_contract_invalid");
    expect(() => validateV12AccessibilityContract({ ...valid, target: { ...valid.target, overlap: true } })).toThrow("v12_accessibility_contract_invalid");
  });
});
