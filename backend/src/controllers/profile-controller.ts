import type { Request, RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { ProfileService } from "../services/profile-service.js";
import type { FirebaseIdentity } from "../types/auth.js";

function getFirebaseIdentity(request: Request): FirebaseIdentity {
  if (!request.firebaseIdentity) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid Firebase ID token is required.");
  }

  return request.firebaseIdentity;
}

export function createProfileController(profileService: ProfileService): {
  getOwn: RequestHandler;
  upsertOwn: RequestHandler;
} {
  return {
    getOwn: async (request, response) => {
      const identity = getFirebaseIdentity(request);
      const profile = await profileService.getOwnProfile(identity.uid);
      response.status(200).json({ data: { profile } });
    },

    upsertOwn: async (request, response) => {
      const identity = getFirebaseIdentity(request);
      const profile = await profileService.upsertOwnProfile(identity.uid, request.body);
      response.status(200).json({ data: { profile } });
    },
  };
}