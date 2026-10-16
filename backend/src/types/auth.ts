export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export type FirebaseTokenVerifier = (idToken: string) => Promise<FirebaseIdentity>;
