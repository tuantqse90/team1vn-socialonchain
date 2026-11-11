import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  schemaFilter: ["chain", "app"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://soc:soc@localhost:5440/socialonchain" },
});
