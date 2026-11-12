import { ApiError } from "../errors/api-error.js";
import type { DiscoveryRepository } from "../db/discovery-repository.js";
import type { ProfileRepository } from "../db/profile-repository.js";
import type { DiscoveryCandidate, DiscoveryPhoto, DiscoveryQuery } from "../types/discovery.js";
import { UserService } from "./user-service.js";

export interface PublicProfile {
  userId: string;
  displayName: string;
  age: number;
  bio: string | null;
  gender: string | null;
  university: string | null;
  interests: string[];
  photos: DiscoveryPhoto[];
}

export interface DiscoveryFeed {
  profiles: PublicProfile[];
  nextCursor: string | null;
}

export function calculateAge(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDifference = now.getUTCMonth() - dateOfBirth.getUTCMonth();

  if (monthDifference < 0 || (monthDifference === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }

  return age;
}

function toPublicProfile(candidate: DiscoveryCandidate): PublicProfile {
  return {
    userId: candidate.userId,
    displayName: candidate.displayName,
    age: calculateAge(candidate.dateOfBirth),
    bio: candidate.bio,
    gender: candidate.gender,
    university: candidate.university,
    interests: candidate.interests,
    photos: candidate.photos.map((photo) => ({ id: photo.id, position: photo.position })),
  };
}

export class DiscoveryService {
  constructor(
    private readonly userService: UserService,
    private readonly profileRepository: ProfileRepository,
    private readonly discoveryRepository: DiscoveryRepository,
  ) {}

  async browse(firebaseUid: string, query: DiscoveryQuery): Promise<DiscoveryFeed> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);

    const ownProfile = await this.profileRepository.findByUserId(user.id);
    if (!ownProfile) {
      throw new ApiError(403, "PROFILE_REQUIRED", "Create a profile before browsing.");
    }

    const page = await this.discoveryRepository.listCandidates(user.id, query);

    return {
      profiles: page.candidates.map(toPublicProfile),
      nextCursor: page.nextCursor,
    };
  }
}