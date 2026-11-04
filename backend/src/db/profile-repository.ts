import { prisma } from "./prisma.js";
import type { UpsertProfileInput, UserProfile } from "../types/profile.js";

export interface ProfileRepository {
  findByUserId(userId: string): Promise<UserProfile | null>;
  upsertForUser(userId: string, input: UpsertProfileInput): Promise<UserProfile>;
}

const profileFields = {
  id: true,
  userId: true,
  displayName: true,
  dateOfBirth: true,
  bio: true,
  gender: true,
  university: true,
  interests: true,
  createdAt: true,
  updatedAt: true,
} as const;

function providedOptionalFields(input: UpsertProfileInput) {
  return {
    ...(input.bio !== undefined && { bio: input.bio }),
    ...(input.gender !== undefined && { gender: input.gender }),
    ...(input.university !== undefined && { university: input.university }),
    ...(input.interests !== undefined && { interests: input.interests }),
  };
}

export const prismaProfileRepository: ProfileRepository = {
  findByUserId(userId) {
    return prisma.userProfile.findUnique({
      where: { userId },
      select: profileFields,
    });
  },

  upsertForUser(userId, input) {
    const optionalFields = providedOptionalFields(input);

    return prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: input.displayName,
        dateOfBirth: input.dateOfBirth,
        ...optionalFields,
      },
      update: {
        displayName: input.displayName,
        dateOfBirth: input.dateOfBirth,
        ...optionalFields,
      },
      select: profileFields,
    });
  },
};