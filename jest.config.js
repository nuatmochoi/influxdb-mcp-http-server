export default {
  testEnvironment: "node",
  transform: {},
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 60000,
  transformIgnorePatterns: [],
  resolver: undefined,
};
