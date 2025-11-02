module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^constants/(.*)$': '<rootDir>/src/constants/$1',
    '^services/(.*)$': '<rootDir>/src/services/$1',
    '^utils/(.*)$': '<rootDir>/src/utils/$1',
    '^types$': '<rootDir>/src/types.d.ts',
    '^test/(.*)$': '<rootDir>/src/test/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**',
    '!src/**/*.test.ts',
  ],
  globals: {
    'ts-jest': {
      tsconfig: {
        baseUrl: 'src',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
};