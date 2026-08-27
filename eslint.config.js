module.exports = [
  {
    ignores: [
      "android/**",
      "ios/**",
      "node_modules/**",
      "coverage/**",
      "artifacts/**",
    ],
  },
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "src/**/*.{js,jsx,ts,tsx}"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    settings: {
      boundaryCommand: "node scripts/check-boundaries.mjs",
    },
  },
];
