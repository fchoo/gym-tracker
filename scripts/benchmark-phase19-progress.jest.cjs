const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const base = require(path.join(projectRoot, "jest.config.js"));
const components = base.projects.find(({ displayName }) => displayName === "components");
const dependencyRoot = process.env.PHASE19_NODE_MODULES
  ?? path.join(projectRoot, "node_modules");

module.exports = {
  ...components,
  rootDir: projectRoot,
  displayName: "phase19-benchmark",
  modulePaths: [dependencyRoot],
  moduleNameMapper: {
    "^react$": path.join(dependencyRoot, "react"),
    "^react/(.*)$": path.join(dependencyRoot, "react", "$1"),
    "^react-native$": path.join(dependencyRoot, "react-native"),
    "^react-native/(.*)$": path.join(dependencyRoot, "react-native", "$1"),
    "^react-test-renderer$": path.join(dependencyRoot, "react-test-renderer"),
    "^@testing-library/react-native$": path.join(
      dependencyRoot,
      "@testing-library/react-native",
    ),
  },
};
