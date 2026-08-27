const shared = {
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  roots: ["<rootDir>/app", "<rootDir>/src", "<rootDir>/tests"],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
};

module.exports = {
  ...shared,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/testing/**",
    "!src/types/**",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["json-summary", "text", "text-summary"],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  projects: [
    {
      ...shared,
      displayName: "unit",
      preset: "jest-expo",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/src/**/*.test.ts",
        "<rootDir>/src/**/*.test.tsx",
      ],
      testPathIgnorePatterns: [
        ...shared.testPathIgnorePatterns,
        "/src/ui/",
      ],
    },
    {
      ...shared,
      displayName: "components",
      preset: "jest-expo",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/app/**/*.test.ts",
        "<rootDir>/app/**/*.test.tsx",
        "<rootDir>/src/ui/**/*.test.ts",
        "<rootDir>/src/ui/**/*.test.tsx",
      ],
    },
    {
      ...shared,
      displayName: "sqlite-host",
      testEnvironment: "node",
      transform: {
        "^.+\\.[jt]sx?$": [
          "babel-jest",
          {
            presets: ["babel-preset-expo"],
          },
        ],
      },
      testMatch: ["<rootDir>/tests/sqlite-host/**/*.test.ts"],
    },
    {
      ...shared,
      displayName: "integration",
      testEnvironment: "node",
      transform: {
        "^.+\\.[jt]sx?$": [
          "babel-jest",
          {
            presets: ["babel-preset-expo"],
          },
        ],
      },
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
    },
  ],
};
