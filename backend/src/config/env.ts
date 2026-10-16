import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must use the postgresql:// or postgres:// scheme",
    )
    .optional(),
  FRONTEND_ORIGINS: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

if (parsed.data.NODE_ENV === "production" && !parsed.data.DATABASE_URL) {
  throw new Error("Invalid environment configuration: DATABASE_URL is required in production.");
}

export const env = {
  ...parsed.data,
  FIREBASE_PROJECT_ID: parsed.data.FIREBASE_PROJECT_ID?.trim() || undefined,
  FIREBASE_CLIENT_EMAIL: parsed.data.FIREBASE_CLIENT_EMAIL?.trim() || undefined,
  FIREBASE_PRIVATE_KEY: parsed.data.FIREBASE_PRIVATE_KEY?.trim() || undefined,
  frontendOrigins: parsed.data.FRONTEND_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

for (const origin of env.frontendOrigins) {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("Invalid environment configuration: FRONTEND_ORIGINS must be a comma-separated list of valid origins.");
  }

  if (
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== origin
  ) {
    throw new Error("Invalid environment configuration: FRONTEND_ORIGINS entries must be exact HTTP(S) origins without paths.");
  }
}
