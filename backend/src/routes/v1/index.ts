import { Router } from "express";
import { createAuthController } from "../../controllers/auth-controller.js";
import { createProfileController } from "../../controllers/profile-controller.js";
import { prismaProfileRepository, type ProfileRepository } from "../../db/profile-repository.js";
import { prismaUserRepository, type UserRepository } from "../../db/user-repository.js";
import { createRequireAuth } from "../../middleware/require-auth.js";
import { ProfileService } from "../../services/profile-service.js";
import { UserService } from "../../services/user-service.js";
import { verifyFirebaseIdToken } from "../../services/firebase-admin.js";
import type { FirebaseTokenVerifier } from "../../types/auth.js";
import { upsertProfileSchema } from "../../validation/profile-schemas.js";
import { validateBody } from "../../validation/validate-body.js";

export interface V1RouterDependencies {
  firebaseTokenVerifier?: FirebaseTokenVerifier;
  userRepository?: UserRepository;
  profileRepository?: ProfileRepository;
}

export function createV1Router(dependencies: V1RouterDependencies = {}) {
  const router = Router();
  const userService = new UserService(dependencies.userRepository ?? prismaUserRepository);
  const profileService = new ProfileService(
    userService,
    dependencies.profileRepository ?? prismaProfileRepository,
  );
  const requireAuth = createRequireAuth(dependencies.firebaseTokenVerifier ?? verifyFirebaseIdToken);
  const authController = createAuthController(userService);
  const profileController = createProfileController(profileService);

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

  return router;
}