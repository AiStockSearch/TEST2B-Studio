import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL нужен только для `prisma db pull`; generate работает без него.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/postgres" },
});
