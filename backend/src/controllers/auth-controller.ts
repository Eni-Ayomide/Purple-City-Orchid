import type { Request, RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { UserService } from "../services/user-service.js";
import type { FirebaseIdentity } from "../types/auth.js";

function getFirebaseIdentity(request: Request): FirebaseIdentity {
  if (!request.firebaseIdentity) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid Firebase ID token is required.");
  }

  return request.firebaseIdentity;
}

export function createAuthController(userService: UserService): {
  sync: RequestHandler;
  me: RequestHandler;
} {
  return {
    sync: async (request, response) => {
      const user = await userService.syncFromFirebase(getFirebaseIdentity(request));
      response.status(200).json({ data: { user } });
    },

    me: async (request, response) => {
      const identity = getFirebaseIdentity(request);
      const user = await userService.getByFirebaseUid(identity.uid);
      response.status(200).json({ data: { user } });
    },
  };
}
