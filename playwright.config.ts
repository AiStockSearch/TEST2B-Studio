import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

// E2E против запущенного приложения (npm run build && npm start) и облачной БД.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  expect: { timeout: 20_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", screenshot: "only-on-failure" },
});
