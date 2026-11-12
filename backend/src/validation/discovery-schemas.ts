import { z } from "zod";

export const discoveryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(100).optional(),
    university: z.string().trim().min(1).max(150).optional(),
  })
  .strict()
  .transform((query) => ({
    limit: query.limit,
    cursor: query.cursor ?? null,
    university: query.university ?? null,
  }));