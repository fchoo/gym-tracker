const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const base = require(path.join(projectRoot, "jest.config.js"));
const dependencyRoot = process.env.PHASE19_NODE_MODULES
  ?? path.join(projectRoot, "node_modules");
const moduleNameMapper = {
  "^react$": path.join(dependencyRoot, "react"),
  "^react/(.*)$": path.join(dependencyRoot, "react", "$1"),
  "^react-native$": path.join(dependencyRoot, "react-native"),
  "^react-native/(.*)$": path.join(dependencyRoot, "react-native", "$1"),
  "^react-test-renderer$": path.join(dependencyRoot, "react-test-renderer"),
  "^@testing-library/react-native$": path.join(
    dependencyRoot,
    "@testing-library/react-native",
  ),
};

module.exports = {
  ...base,
  rootDir: projectRoot,
  modulePaths: [dependencyRoot],
  moduleNameMapper,
  projects: base.projects.map((project) => ({
    ...project,
    rootDir: projectRoot,
    modulePaths: [dependencyRoot],
    moduleNameMapper,
  })),
};
