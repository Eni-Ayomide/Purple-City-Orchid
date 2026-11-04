import { ApiError } from "../errors/api-error.js";
import type { ProfileRepository } from "../db/profile-repository.js";
import type { UpsertProfileInput, UserProfile } from "../types/profile.js";
import { UserService } from "./user-service.js";

export class ProfileService {
  constructor(
    private readonly userService: UserService,
    private readonly profileRepository: ProfileRepository,
  ) {}

  async getOwnProfile(firebaseUid: string): Promise<UserProfile> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);
    const profile = await this.profileRepository.findByUserId(user.id);

    if (!profile) {
      throw new ApiError(404, "PROFILE_NOT_FOUND", "This account does not have a profile yet.");
    }

    return profile;
  }

  async upsertOwnProfile(firebaseUid: string, input: UpsertProfileInput): Promise<UserProfile> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);
    return this.profileRepository.upsertForUser(user.id, input);
  }
}