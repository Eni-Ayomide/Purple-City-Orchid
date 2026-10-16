import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import type { FirebaseIdentity, FirebaseTokenVerifier } from "../types/auth.js";

export interface FirebaseAdminConfig {
  projectId?: string | undefined;
  clientEmail?: string | undefined;
  privateKey?: string | undefined;
}

const ADMIN_APP_NAME = "purple-hearts-firebase-auth";

function readFirebaseConfig(): FirebaseAdminConfig {
  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
  };
}

export function normalizeFirebasePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

export function createFirebaseTokenVerifier(
  getConfig: () => FirebaseAdminConfig = readFirebaseConfig,
): FirebaseTokenVerifier {
  let firebaseAuth: ReturnType<typeof getAuth> | undefined;

  return async (idToken: string): Promise<FirebaseIdentity> => {
    const config = getConfig();
    const projectId = config.projectId?.trim();
    const clientEmail = config.clientEmail?.trim();
    const privateKey = config.privateKey?.trim();

    if (!projectId || !clientEmail || !privateKey) {
      throw new ApiError(
        503,
        "AUTH_PROVIDER_UNAVAILABLE",
        "Firebase authentication is not configured on this server.",
      );
    }

    if (!firebaseAuth) {
      const app =
        getApps().find((candidate) => candidate.name === ADMIN_APP_NAME) ??
        initializeApp(
          {
            credential: cert({
              projectId,
              clientEmail,
              privateKey: normalizeFirebasePrivateKey(privateKey),
            }),
            projectId,
          },
          ADMIN_APP_NAME,
        );

      firebaseAuth = getAuth(app);
    }

    const decodedToken = await firebaseAuth.verifyIdToken(idToken);

    return {
      uid: decodedToken.uid,
      email: typeof decodedToken.email === "string" ? decodedToken.email : null,
      emailVerified: decodedToken.email_verified === true,
    };
  };
}

export const verifyFirebaseIdToken = createFirebaseTokenVerifier();
