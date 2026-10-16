import { ApiError } from "../errors/api-error.js";
import type { UserRepository } from "../db/user-repository.js";
import type { ApplicationUser } from "../types/account.js";
import type { FirebaseIdentity } from "../types/auth.js";

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  syncFromFirebase(identity: FirebaseIdentity): Promise<ApplicationUser> {
    return this.userRepository.syncFromFirebase(identity);
  }

  async getByFirebaseUid(firebaseUid: string): Promise<ApplicationUser> {
    const user = await this.userRepository.findByFirebaseUid(firebaseUid);
    if (!user) {
      throw new ApiError(
        404,
        "USER_NOT_PROVISIONED",
        "No application account has been provisioned for this Firebase identity.",
      );
    }

    return user;
  }
}
