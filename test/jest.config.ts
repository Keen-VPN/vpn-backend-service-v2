import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.spec.ts', '<rootDir>/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '../src/**/*.(t|j)s',
    '!../src/**/*.spec.ts',
    '!../src/main.ts',
    '!../src/**/*.module.ts',
    '!../src/**/*.interface.ts',
    '!../src/**/*.dto.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!@faker-js)'],
  setupFilesAfterEnv: ['<rootDir>/setup/jest.setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/../src'],
};

export default config;
