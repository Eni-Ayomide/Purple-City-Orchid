import { z } from "zod";

export const photoUploadRequestSchema = z
  .object({
    contentType: z.string().trim().min(1).max(100),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const confirmPhotoSchema = z
  .object({
    storageKey: z.string().trim().min(1).max(255),
  })
  .strict();

export const reorderPhotosSchema = z
  .object({
    photoIds: z.array(z.string().trim().min(1).max(100)).min(1).max(6),
  })
  .strict();