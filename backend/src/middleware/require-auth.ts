import type { RequestHandler } from "express";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/api-error.js";
import type { FirebaseTokenVerifier } from "../types/auth.js";

const INVALID_TOKEN_CODES = new Set([
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/user-disabled",
]);

function firebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

function invalidTokenError(): ApiError {
  return new ApiError(401, "UNAUTHENTICATED", "The Firebase ID token is invalid or expired.");
}

export function createRequireAuth(verifyToken: FirebaseTokenVerifier): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.get("authorization");

    if (!authorization) {
      next(new ApiError(401, "UNAUTHENTICATED", "A Bearer token is required."));
      return;
    }

    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match?.[1]) {
      next(new ApiError(401, "UNAUTHENTICATED", "Authorization must use the Bearer token format."));
      return;
    }

    try {
      request.firebaseIdentity = await verifyToken(match[1]);
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }

      const code = firebaseErrorCode(error);
      if (code && INVALID_TOKEN_CODES.has(code)) {
        next(invalidTokenError());
        return;
      }

      logger.error(
        {
          firebaseErrorCode: code && /^(auth|app)\/[a-z-]+$/.test(code) ? code : "unknown",
        },
        "Firebase token verification is unavailable",
      );
      next(
        new ApiError(
          503,
          "AUTH_PROVIDER_UNAVAILABLE",
          "Firebase token verification is temporarily unavailable.",
        ),
      );
    }
  };
}
