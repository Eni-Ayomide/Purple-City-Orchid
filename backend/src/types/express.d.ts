import type { FirebaseIdentity } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      firebaseIdentity?: FirebaseIdentity;
    }
  }
}

export {};
