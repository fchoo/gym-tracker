jest.mock("react-native-worklets", () => {
  const mock = require("react-native-worklets/lib/module/mock");

  return {
    ...mock,
    scheduleOnRN: (callback, ...args) => callback(...args),
  };
});
jest.mock("react-native-reanimated", () =>
  {
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
