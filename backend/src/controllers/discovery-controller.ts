import type { Request, RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { DiscoveryService } from "../services/discovery-service.js";
import type { FirebaseIdentity } from "../types/auth.js";
import type { DiscoveryQuery } from "../types/discovery.js";

function getFirebaseIdentity(request: Request): FirebaseIdentity {
  if (!request.firebaseIdentity) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid Firebase ID token is required.");
  }

  return request.firebaseIdentity;
}

export function createDiscoveryController(discoveryService: DiscoveryService): {
  browse: RequestHandler;
} {
  return {
    browse: async (request, response) => {
      const query = response.locals["validatedQuery"] as DiscoveryQuery;
      const feed = await discoveryService.browse(getFirebaseIdentity(request).uid, query);
      response.status(200).json({ data: feed });
    },
  };
}