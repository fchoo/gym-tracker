import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import {
  resolveV12NativeAcceptanceRequest,
  V12NativeAcceptanceFixture,
} from "../../src/testing/v12NativeAcceptanceFixture";

export default function NativeAcceptanceRoute() {
  const params = useLocalSearchParams<{
    shard?: string | string[];
    case?: string | string[];
    fixture?: string | string[];
    nonce?: string | string[];
  }>();
  const extra = Constants.expoConfig?.extra;
  const request = resolveV12NativeAcceptanceRequest({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
  }, params);
  return request === null ? (
    <View testID="native-acceptance-disabled">
      <Text accessibilityRole="header">Native acceptance unavailable</Text>
    </View>
  ) : (
    <V12NativeAcceptanceFixture request={request} />
  );
}
