import type { Config } from "jest";
import baseConfig from "./jest.config";

const config: Config = {
  ...baseConfig,
  testMatch: ["**/__tests__/**/*.e2e.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.e2e.ts"],
};

export default config;
