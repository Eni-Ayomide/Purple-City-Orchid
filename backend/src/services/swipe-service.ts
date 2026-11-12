import { ApiError } from "../errors/api-error.js";
import type { ProfileRepository } from "../db/profile-repository.js";
import type { SwipeRepository } from "../db/swipe-repository.js";
import type { SwipeAction } from "../types/swipe.js";
import { UserService } from "./user-service.js";

export interface MatchSummary {
  id: string;
  otherUserId: string;
  createdAt: Date;
}

export interface SwipeResult {
  action: SwipeAction;
  matched: boolean;
  match: MatchSummary | null;
}

function summarize(
  match: { id: string; userAId: string; userBId: string; createdAt: Date },
  userId: string,
): MatchSummary {
  return {
    id: match.id,
    otherUserId: match.userAId === userId ? match.userBId : match.userAId,
    createdAt: match.createdAt,
  };
}

export class SwipeService {
  constructor(
    private readonly userService: UserService,
    private readonly profileRepository: ProfileRepository,
    private readonly swipeRepository: SwipeRepository,
  ) {}

  async swipe(firebaseUid: string, targetUserId: string, action: SwipeAction): Promise<SwipeResult> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);

    if (targetUserId === user.id) {
      throw new ApiError(400, "CANNOT_SWIPE_SELF", "You cannot swipe on your own profile.");
    }

    const ownProfile = await this.profileRepository.findByUserId(user.id);
    if (!ownProfile) {
      throw new ApiError(403, "PROFILE_REQUIRED", "Create a profile before swiping.");
    }

    const targetProfile = await this.profileRepository.findByUserId(targetUserId);
    if (!targetProfile) {
      throw new ApiError(404, "USER_NOT_FOUND", "No such user.");
    }

    const outcome = await this.swipeRepository.record(user.id, targetUserId, action);
    if (!outcome) {
      throw new ApiError(409, "ALREADY_SWIPED", "You have already swiped on this user.");
    }

    return {
      action: outcome.action,
      matched: outcome.matched,
      match: outcome.match ? summarize(outcome.match, user.id) : null,
    };
  }

  async listOwnMatches(firebaseUid: string): Promise<MatchSummary[]> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);
    const matches = await this.swipeRepository.listMatches(user.id);
    return matches.map((match) => summarize(match, user.id));
  }
}