export type AndroidViewFocusNativeModule = Readonly<{
  requestFocus(nativeID: string): Promise<unknown>;
}>;

export type AndroidNavigationKeyNativeModule = Readonly<{
  getNavigationKeyEpoch(): number;
}>;

export type AndroidExactRestAlarmNativeModule = Readonly<{
  canScheduleExactRestAlarm(): boolean;
  openExactRestAlarmSettings(): Promise<boolean>;
}>;
