import type { Request, RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { SwipeService } from "../services/swipe-service.js";
import type { FirebaseIdentity } from "../types/auth.js";

function getFirebaseIdentity(request: Request): FirebaseIdentity {
  if (!request.firebaseIdentity) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid Firebase ID token is required.");
  }

  return request.firebaseIdentity;
}

export function createSwipeController(swipeService: SwipeService): {
  swipe: RequestHandler;
  listMatches: RequestHandler;
} {
  return {
    swipe: async (request, response) => {
      const result = await swipeService.swipe(
        getFirebaseIdentity(request).uid,
        request.body.targetUserId,
        request.body.action,
      );
      response.status(201).json({ data: { swipe: result } });
    },

    listMatches: async (request, response) => {
      const matches = await swipeService.listOwnMatches(getFirebaseIdentity(request).uid);
      response.status(200).json({ data: { matches } });
    },
  };
}