import { prisma } from "./prisma.js";
import type { DiscoveryPage, DiscoveryQuery } from "../types/discovery.js";

export interface DiscoveryRepository {
  listCandidates(viewerId: string, query: DiscoveryQuery): Promise<DiscoveryPage>;
}

export const prismaDiscoveryRepository: DiscoveryRepository = {
  async listCandidates(viewerId, query) {
    const rows = await prisma.userProfile.findMany({
      where: {
        userId: { not: viewerId },
        user: { swipesReceived: { none: { swiperId: viewerId } } },
        ...(query.university !== null && {
          university: { equals: query.university, mode: "insensitive" as const },
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor !== null && { cursor: { id: query.cursor }, skip: 1 }),
      select: {
        id: true,
        userId: true,
        displayName: true,
        dateOfBirth: true,
        bio: true,
        gender: true,
        university: true,
        interests: true,
        user: {
          select: {
            photos: {
              orderBy: { position: "asc" },
              select: { id: true, position: true },
            },
          },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      candidates: pageRows.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        dateOfBirth: row.dateOfBirth,
        bio: row.bio,
        gender: row.gender,
        university: row.university,
        interests: row.interests,
        photos: row.user.photos,
      })),
      nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
  },
};