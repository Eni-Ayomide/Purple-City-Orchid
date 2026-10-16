import { prisma } from "./prisma.js";
import type { ApplicationUser } from "../types/account.js";
import type { FirebaseIdentity } from "../types/auth.js";

export interface UserRepository {
  syncFromFirebase(identity: FirebaseIdentity): Promise<ApplicationUser>;
  findByFirebaseUid(firebaseUid: string): Promise<ApplicationUser | null>;
}

const accountFields = {
  id: true,
  email: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const prismaUserRepository: UserRepository = {
  syncFromFirebase(identity) {
    return prisma.user.upsert({
      where: { firebaseUid: identity.uid },
      create: {
        firebaseUid: identity.uid,
        email: identity.email,
        emailVerified: identity.emailVerified,
      },
      update: {
        email: identity.email,
        emailVerified: identity.emailVerified,
      },
      select: accountFields,
    });
  },

  findByFirebaseUid(firebaseUid) {
    return prisma.user.findUnique({
      where: { firebaseUid },
      select: accountFields,
    });
  },
};
