import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.(t|j)s',
    '!<rootDir>/src/**/*.spec.ts',
    '!<rootDir>/src/main.ts',
    '!<rootDir>/src/**/*.module.ts',
    '!<rootDir>/src/**/*.interface.ts',
    '!<rootDir>/src/**/*.dto.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!@faker-js)'],
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest.setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
};

export default config;
