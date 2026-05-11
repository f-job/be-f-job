import type { Config } from "jest";
import baseConfig from "../../../jest.config";

const config: Config = {
  ...baseConfig,
  testMatch: ["**/__tests__/websocket/**/*.test.ts"],
};

export default config; 