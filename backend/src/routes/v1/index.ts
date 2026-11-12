import { Router } from "express";
import { createAuthController } from "../../controllers/auth-controller.js";
import { createDiscoveryController } from "../../controllers/discovery-controller.js";
import { createPhotoController } from "../../controllers/photo-controller.js";
import { createProfileController } from "../../controllers/profile-controller.js";
import { createSwipeController } from "../../controllers/swipe-controller.js";
import { prismaDiscoveryRepository, type DiscoveryRepository } from "../../db/discovery-repository.js";
import { prismaPhotoRepository, type PhotoRepository } from "../../db/photo-repository.js";
import { prismaProfileRepository, type ProfileRepository } from "../../db/profile-repository.js";
import { prismaSwipeRepository, type SwipeRepository } from "../../db/swipe-repository.js";
import { prismaUserRepository, type UserRepository } from "../../db/user-repository.js";
import { createRequireAuth } from "../../middleware/require-auth.js";
import { DiscoveryService } from "../../services/discovery-service.js";
import { PhotoService } from "../../services/photo-service.js";
import { unconfiguredPhotoStorage } from "../../services/photo-storage.js";
import { ProfileService } from "../../services/profile-service.js";
import { SwipeService } from "../../services/swipe-service.js";
import { UserService } from "../../services/user-service.js";
import { verifyFirebaseIdToken } from "../../services/firebase-admin.js";
import type { FirebaseTokenVerifier } from "../../types/auth.js";
import type { PhotoStorage } from "../../types/photo-storage.js";
import { discoveryQuerySchema } from "../../validation/discovery-schemas.js";
import {
  confirmPhotoSchema,
  photoUploadRequestSchema,
  reorderPhotosSchema,
} from "../../validation/photo-schemas.js";
import { upsertProfileSchema } from "../../validation/profile-schemas.js";
import { swipeSchema } from "../../validation/swipe-schemas.js";
import { validateBody } from "../../validation/validate-body.js";
import { validateQuery } from "../../validation/validate-query.js";

export interface V1RouterDependencies {
  firebaseTokenVerifier?: FirebaseTokenVerifier;
  userRepository?: UserRepository;
  profileRepository?: ProfileRepository;
  photoRepository?: PhotoRepository;
  photoStorage?: PhotoStorage;
  swipeRepository?: SwipeRepository;
  discoveryRepository?: DiscoveryRepository;
}

export function createV1Router(dependencies: V1RouterDependencies = {}) {
  const router = Router();
  const userService = new UserService(dependencies.userRepository ?? prismaUserRepository);
  const profileRepository = dependencies.profileRepository ?? prismaProfileRepository;
  const profileService = new ProfileService(userService, profileRepository);
  const photoService = new PhotoService(
    userService,
    dependencies.photoRepository ?? prismaPhotoRepository,
    dependencies.photoStorage ?? unconfiguredPhotoStorage,
  );
  const swipeService = new SwipeService(
    userService,
    profileRepository,
    dependencies.swipeRepository ?? prismaSwipeRepository,
  );
  const discoveryService = new DiscoveryService(
    userService,
    profileRepository,
    dependencies.discoveryRepository ?? prismaDiscoveryRepository,
  );
  const requireAuth = createRequireAuth(dependencies.firebaseTokenVerifier ?? verifyFirebaseIdToken);
  const authController = createAuthController(userService);
  const profileController = createProfileController(profileService);
  const photoController = createPhotoController(photoService);
  const swipeController = createSwipeController(swipeService);
  const discoveryController = createDiscoveryController(discoveryService);

  router.get("/", (_request, response) => {
    response.status(200).json({
      name: "Purple Hearts API",
      version: "v1",
    });
  });

  router.post("/auth/sync", requireAuth, authController.sync);
  router.get("/me", requireAuth, authController.me);
  router.get("/me/profile", requireAuth, profileController.getOwn);
  router.put(
    "/me/profile",
    requireAuth,
    validateBody(upsertProfileSchema),
    profileController.upsertOwn,
  );

  router.get("/me/photos", requireAuth, photoController.list);
  router.post(
    "/me/photos/upload-url",
    requireAuth,
    validateBody(photoUploadRequestSchema),
    photoController.requestUpload,
  );
  router.post("/me/photos", requireAuth, validateBody(confirmPhotoSchema), photoController.confirm);
  router.put(
    "/me/photos/order",
    requireAuth,
    validateBody(reorderPhotosSchema),
    photoController.reorder,
  );
  router.delete("/me/photos/:photoId", requireAuth, photoController.remove);

  router.post("/swipes", requireAuth, validateBody(swipeSchema), swipeController.swipe);
  router.get("/me/matches", requireAuth, swipeController.listMatches);

  router.get(
    "/discovery",
    requireAuth,
    validateQuery(discoveryQuerySchema),
    discoveryController.browse,
  );

  return router;
}