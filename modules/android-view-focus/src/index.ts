export type AndroidViewFocusNativeModule = Readonly<{
  requestFocus(nativeID: string): Promise<unknown>;
}>;
