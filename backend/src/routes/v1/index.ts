import { Router } from "express";
import { createAuthController } from "../../controllers/auth-controller.js";
import { prismaUserRepository, type UserRepository } from "../../db/user-repository.js";
import { createRequireAuth } from "../../middleware/require-auth.js";
import { UserService } from "../../services/user-service.js";
import { verifyFirebaseIdToken } from "../../services/firebase-admin.js";
import type { FirebaseTokenVerifier } from "../../types/auth.js";

export interface V1RouterDependencies {
  firebaseTokenVerifier?: FirebaseTokenVerifier;
  userRepository?: UserRepository;
}

export function createV1Router(dependencies: V1RouterDependencies = {}) {
  const router = Router();
  const userService = new UserService(dependencies.userRepository ?? prismaUserRepository);
  const requireAuth = createRequireAuth(dependencies.firebaseTokenVerifier ?? verifyFirebaseIdToken);
  const authController = createAuthController(userService);

  router.get("/", (_request, response) => {
    response.status(200).json({
      name: "Purple Hearts API",
      version: "v1",
    });
  });

  router.post("/auth/sync", requireAuth, authController.sync);
  router.get("/me", requireAuth, authController.me);

  return router;
}
