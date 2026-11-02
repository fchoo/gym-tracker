import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { useWorkoutAppRuntime } from "../../src/bootstrap/workoutAppRuntime";
import {
  resolveV12NativeAcceptanceRequest,
  V12NativeAcceptanceReceipt,
  type V12NativeAcceptanceReceiptReader,
} from "../../src/testing/v12NativeAcceptanceFixture";

export default function NativeAcceptanceRoute() {
  const params = useLocalSearchParams<{
    shard?: string | string[];
    case?: string | string[];
    fixture?: string | string[];
    nonce?: string | string[];
    mode?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const extra = Constants.expoConfig?.extra;
  const request = resolveV12NativeAcceptanceRequest({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
  }, params);
  const readReceipt = (runtime as typeof runtime & Readonly<{
    readV12NativeAcceptanceReceipt?: V12NativeAcceptanceReceiptReader;
  }>).readV12NativeAcceptanceReceipt;
  return request === null || readReceipt === undefined ? (
    <View testID="native-acceptance-disabled">
      <Text accessibilityRole="header">Native acceptance unavailable</Text>
    </View>
  ) : (
    <V12NativeAcceptanceReceipt readReceipt={readReceipt} request={request} />
  );
}
