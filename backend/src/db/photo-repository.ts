import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { NewProfilePhotoInput, ProfilePhoto } from "../types/photo.js";

export interface PhotoRepository {
  listByUserId(userId: string): Promise<ProfilePhoto[]>;
  add(userId: string, input: NewProfilePhotoInput, maxPhotos: number): Promise<ProfilePhoto | null>;
  remove(userId: string, photoId: string): Promise<ProfilePhoto | null>;
  reorder(userId: string, orderedPhotoIds: string[]): Promise<ProfilePhoto[] | null>;
}

const photoFields = {
  id: true,
  userId: true,
  storageKey: true,
  contentType: true,
  sizeBytes: true,
  position: true,
  createdAt: true,
} as const;

const TEMPORARY_POSITION_OFFSET = 1000;

async function renumber(
  tx: Prisma.TransactionClient,
  userId: string,
  orderedPhotoIds: string[],
): Promise<void> {
  for (const [index, id] of orderedPhotoIds.entries()) {
    await tx.profilePhoto.updateMany({
      where: { id, userId },
      data: { position: TEMPORARY_POSITION_OFFSET + index },
    });
  }

  for (const [index, id] of orderedPhotoIds.entries()) {
    await tx.profilePhoto.updateMany({
      where: { id, userId },
      data: { position: index },
    });
  }
}

export const prismaPhotoRepository: PhotoRepository = {
  listByUserId(userId) {
    return prisma.profilePhoto.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      select: photoFields,
    });
  },

  add(userId, input, maxPhotos) {
    return prisma.$transaction(async (tx) => {
      const count = await tx.profilePhoto.count({ where: { userId } });
      if (count >= maxPhotos) {
        return null;
      }

      const last = await tx.profilePhoto.findFirst({
        where: { userId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      return tx.profilePhoto.create({
        data: {
          userId,
          storageKey: input.storageKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          position: last ? last.position + 1 : 0,
        },
        select: photoFields,
      });
    });
  },

  remove(userId, photoId) {
    return prisma.$transaction(async (tx) => {
      const photo = await tx.profilePhoto.findFirst({
        where: { id: photoId, userId },
        select: photoFields,
      });
      if (!photo) {
        return null;
      }

      await tx.profilePhoto.delete({ where: { id: photo.id } });

      const remaining = await tx.profilePhoto.findMany({
        where: { userId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      await renumber(tx, userId, remaining.map((item) => item.id));

      return photo;
    });
  },

  reorder(userId, orderedPhotoIds) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.profilePhoto.findMany({
        where: { userId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((item) => item.id));
      const requestedIds = new Set(orderedPhotoIds);

      const isExactSet =
        orderedPhotoIds.length === current.length &&
        requestedIds.size === orderedPhotoIds.length &&
        orderedPhotoIds.every((id) => currentIds.has(id));
      if (!isExactSet) {
        return null;
      }

      await renumber(tx, userId, orderedPhotoIds);

      return tx.profilePhoto.findMany({
        where: { userId },
        orderBy: { position: "asc" },
        select: photoFields,
      });
    });
  },
};