import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws outside the React Server Components bundler; tests run in plain Node.
      "server-only": path.resolve(__dirname, "tests/helpers/empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      AUTH_PROVIDER: "local",
      AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      DB_DRIVER: "pglite",
      DEMO_MODE: "true",
      PAYMENTS_SANDBOX_ENABLED: "true",
      RAZORPAY_WEBHOOK_SECRET: "whsec_test_only",
      RAZORPAY_KEY_SECRET: "rzp_test_secret_only",
      RAZORPAY_KEY_ID: "rzp_test_key",
      TRANSPORT_SIMULATOR_ENABLED: "true",
    },
  },
});
