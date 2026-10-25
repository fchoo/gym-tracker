export type AndroidViewFocusNativeModule = Readonly<{
  requestFocus(nativeID: string): Promise<unknown>;
}>;

export type AndroidNavigationKeyNativeModule = Readonly<{
  getNavigationKeyEpoch(): number;
}>;
