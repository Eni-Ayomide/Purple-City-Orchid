import { z } from "zod";

export const MINIMUM_AGE = 18;

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isRealCalendarDate(value: string): boolean {
  const date = parseDateOnly(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isAtLeastAge(dateOfBirth: Date, minimumAge: number, now: Date = new Date()): boolean {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - minimumAge, now.getUTCMonth(), now.getUTCDate()),
  );
  return dateOfBirth.getTime() <= cutoff.getTime();
}

const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must use the YYYY-MM-DD format.")
  .refine(isRealCalendarDate, "Date of birth must be a real calendar date.")
  .transform(parseDateOnly)
  .refine((date) => date.getUTCFullYear() >= 1900, "Date of birth is not valid.")
  .refine(
    (date) => isAtLeastAge(date, MINIMUM_AGE),
    `You must be at least ${MINIMUM_AGE} years old.`,
  );

export const upsertProfileSchema = z
  .object({
    displayName: z.string().trim().min(1, "Display name is required.").max(50),
    dateOfBirth: dateOfBirthSchema,
    bio: z.string().trim().max(500).nullable().optional(),
    gender: z.string().trim().max(30).nullable().optional(),
    university: z.string().trim().max(150).nullable().optional(),
    interests: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  })
  .strict();