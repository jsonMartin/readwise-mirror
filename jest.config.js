module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleDirectories: ["node_modules", "src"],
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
    "^test/(.*)$": "<rootDir>/tests/$1",
    "^types/(.*)$": "<rootDir>/src/types/$1",
    "^services/(.*)$": "<rootDir>/src/services/$1",
    "^constants/(.*)$": "<rootDir>/src/constants/$1",
    "^utils/(.*)$": "<rootDir>/src/utils/$1",
    "^ui/(.*)$": "<rootDir>/src/ui/$1",
  },
};
