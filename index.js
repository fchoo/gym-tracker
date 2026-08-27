const { AppRegistry } = require('react-native');

const {
  PHYSICAL_TEST_TASK_NAME,
  runPhysicalTestTask,
} = require('./src/bootstrap/physicalTestTask');

AppRegistry.registerHeadlessTask(
  PHYSICAL_TEST_TASK_NAME,
  () => runPhysicalTestTask,
);

require('expo-router/entry');
