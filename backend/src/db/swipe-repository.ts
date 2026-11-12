import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { MatchRecord, SwipeAction, SwipeOutcome } from "../types/swipe.js";

export interface SwipeRepository {
  record(swiperId: string, targetId: string, action: SwipeAction): Promise<SwipeOutcome | null>;
  listMatches(userId: string): Promise<MatchRecord[]>;
}

const matchFields = {
  id: true,
  userAId: true,
  userBId: true,
  createdAt: true,
} as const;

function orderedPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

export const prismaSwipeRepository: SwipeRepository = {
  async record(swiperId, targetId, action) {
    const [userAId, userBId] = orderedPair(swiperId, targetId);

    try {
      return await prisma.$transaction(async (tx): Promise<SwipeOutcome> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userAId}:${userBId}`}))`;

        await tx.swipe.create({ data: { swiperId, targetId, action } });

        if (action !== "LIKE") {
          return { action, matched: false, match: null };
        }

        const reverse = await tx.swipe.findUnique({
          where: { swiperId_targetId: { swiperId: targetId, targetId: swiperId } },
          select: { action: true },
        });
        if (reverse?.action !== "LIKE") {
          return { action, matched: false, match: null };
        }

        const match = await tx.match.upsert({
          where: { userAId_userBId: { userAId, userBId } },
          create: { userAId, userBId },
          update: {},
          select: matchFields,
        });

        return { action, matched: true, match };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }

      throw error;
    }
  },

  listMatches(userId) {
    return prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: "desc" },
      select: matchFields,
    });
  },
};