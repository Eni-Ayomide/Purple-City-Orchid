import { z } from "zod";

export const swipeSchema = z
  .object({
    targetUserId: z.string().trim().min(1).max(100),
    action: z.enum(["LIKE", "PASS"]),
  })
  .strict();