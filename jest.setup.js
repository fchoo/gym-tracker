jest.mock("react-native-worklets", () => {
  const mock = require("react-native-worklets/lib/module/mock");

  return {
    ...mock,
    scheduleOnRN: (callback, ...args) => callback(...args),
  };
});
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const mock = require("react-native-reanimated/mock");

  return {
    ...mock,
    useSharedValue: (initialValue) =>
      React.useRef({ value: initialValue }).current,
  };
});
jest.mock("react-native-gesture-handler", () => {
  const actual = jest.requireActual("react-native-gesture-handler");
  const { View } = require("react-native");

  return {
    ...actual,
    __esModule: true,
    GestureHandlerRootView: View,
  };
});
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        nativeContractsEnabled: false,
      },
    },
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

global.__GYM_TRACKER_TEST_SHA256__ = async (value) =>
  require("node:crypto").createHash("sha256").update(value).digest("hex");
