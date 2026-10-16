import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  createFirebaseTokenVerifier,
  normalizeFirebasePrivateKey,
} from "../src/services/firebase-admin.js";
import type { ApplicationUser } from "../src/types/account.js";
import type { FirebaseIdentity, FirebaseTokenVerifier } from "../src/types/auth.js";
import type { UserRepository } from "../src/db/user-repository.js";

const identityA: FirebaseIdentity = {
  uid: "firebase-uid-a",
  email: "person-a@example.test",
  emailVerified: true,
};

const accountA: ApplicationUser = {
  id: "application-user-a",
  email: identityA.email,
  emailVerified: true,
  createdAt: new Date("2026-10-16T00:00:00.000Z"),
  updatedAt: new Date("2026-10-16T00:00:00.000Z"),
};

const accountResponseA = {
  ...accountA,
  createdAt: accountA.createdAt.toISOString(),
  updatedAt: accountA.updatedAt.toISOString(),
};

function makeRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    syncFromFirebase: vi.fn(async () => accountA),
    findByFirebaseUid: vi.fn(async () => accountA),
    ...overrides,
  };
}

function makeVerifier(identity: FirebaseIdentity = identityA): FirebaseTokenVerifier {
  return vi.fn(async (_idToken: string) => identity);
}

function makeAuthenticatedApp(
  verifier: FirebaseTokenVerifier = makeVerifier(),
  repository: UserRepository = makeRepository(),
) {
  return createApp({
    firebaseTokenVerifier: verifier,
    userRepository: repository,
  });
}

describe("Firebase-protected API routes", () => {
  it("rejects a missing Authorization header", async () => {
    const verifier = makeVerifier();
    const repository = makeRepository();

    const response = await request(makeAuthenticatedApp(verifier, repository))
      .post("/api/v1/auth/sync");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(verifier).not.toHaveBeenCalled();
    expect(repository.syncFromFirebase).not.toHaveBeenCalled();
  });

  it.each(["Basic token", "Bearer", "Bearer token extra"])(
    "rejects a malformed Authorization header: %s",
    async (authorization) => {
      const verifier = makeVerifier();
      const response = await request(makeAuthenticatedApp(verifier))
        .get("/api/v1/me")
        .set("Authorization", authorization);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(verifier).not.toHaveBeenCalled();
    },
  );

  it.each(["auth/invalid-id-token", "auth/id-token-expired"])(
    "rejects invalid or expired Firebase tokens (%s)",
    async (code) => {
      const verifier = vi.fn(async (_idToken: string) => identityA);
      verifier.mockRejectedValue({ code });
      const repository = makeRepository();

      const response = await request(makeAuthenticatedApp(verifier, repository))
        .get("/api/v1/me")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        code: "UNAUTHENTICATED",
        message: "The Firebase ID token is invalid or expired.",
      });
      expect(repository.findByFirebaseUid).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { projectId: "project-id-only" },
    { projectId: "project-id", clientEmail: "service@example.test" },
  ])("returns a safe 503 response when Firebase configuration is missing or incomplete", async (config) => {
    const verifier = createFirebaseTokenVerifier(() => config);

    const response = await request(makeAuthenticatedApp(verifier))
      .get("/api/v1/me")
      .set("Authorization", "Bearer well-formed-token");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("privateKey");
    expect(JSON.stringify(response.body)).not.toContain("project-id");
  });

  it("converts escaped newlines in Firebase private keys", () => {
    expect(normalizeFirebasePrivateKey("first-line\\nsecond-line"))
      .toBe("first-line\nsecond-line");
  });

  it("provisions an account using only the verified Firebase identity", async () => {
    const syncFromFirebase = vi.fn(async () => accountA);
    const repository = makeRepository({ syncFromFirebase });
    const verifier = makeVerifier(identityA);

    const response = await request(makeAuthenticatedApp(verifier, repository))
      .post("/api/v1/auth/sync")
      .set("Authorization", "Bearer firebase-token")
      .send({
        uid: "attacker-supplied-uid",
        email: "attacker@example.test",
        emailVerified: false,
      });

    expect(response.status).toBe(200);
    expect(verifier).toHaveBeenCalledWith("firebase-token");
    expect(syncFromFirebase).toHaveBeenCalledWith(identityA);
    expect(response.body).toEqual({ data: { user: accountResponseA } });
    expect(response.body.data.user).not.toHaveProperty("firebaseUid");
  });

  it("keeps repeated account synchronization idempotent", async () => {
    const users = new Map<string, ApplicationUser>();
    let createCount = 0;
    const repository: UserRepository = {
      async syncFromFirebase(identity) {
        const existing = users.get(identity.uid);
        if (existing) {
          const updated = {
            ...existing,
            email: identity.email,
            emailVerified: identity.emailVerified,
          };
          users.set(identity.uid, updated);
          return updated;
        }

        createCount += 1;
        const created = { ...accountA, email: identity.email, emailVerified: identity.emailVerified };
        users.set(identity.uid, created);
        return created;
      },
      async findByFirebaseUid(uid) {
        return users.get(uid) ?? null;
      },
    };

    const app = makeAuthenticatedApp(makeVerifier(identityA), repository);
    const first = await request(app)
      .post("/api/v1/auth/sync")
      .set("Authorization", "Bearer firebase-token");
    const second = await request(app)
      .post("/api/v1/auth/sync")
      .set("Authorization", "Bearer firebase-token");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(createCount).toBe(1);
  });

  it("returns the account matching the verified identity from GET /me", async () => {
    const findByFirebaseUid = vi.fn(async (uid: string) => uid === identityA.uid ? accountA : null);

    const response = await request(
      makeAuthenticatedApp(makeVerifier(identityA), makeRepository({ findByFirebaseUid })),
    )
      .get("/api/v1/me")
      .set("Authorization", "Bearer firebase-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user: accountResponseA } });
    expect(findByFirebaseUid).toHaveBeenCalledWith(identityA.uid);
  });

  it("does not let one Firebase identity fetch another user's account", async () => {
    const identityB: FirebaseIdentity = {
      uid: "firebase-uid-b",
      email: "person-b@example.test",
      emailVerified: true,
    };
    const findByFirebaseUid = vi.fn(async (uid: string) => uid === identityA.uid ? accountA : null);

    const response = await request(
      makeAuthenticatedApp(makeVerifier(identityB), makeRepository({ findByFirebaseUid })),
    )
      .get("/api/v1/me?userId=application-user-a")
      .set("Authorization", "Bearer firebase-token");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_PROVISIONED");
    expect(findByFirebaseUid).toHaveBeenCalledWith(identityB.uid);
    expect(findByFirebaseUid).not.toHaveBeenCalledWith(identityA.uid);
  });

  it("keeps API-version metadata public", async () => {
    const response = await request(createApp()).get("/api/v1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "Purple Hearts API", version: "v1" });
  });
});

describe("unexpected Firebase verifier errors", () => {
  it("does not expose SDK or credential errors to API clients", async () => {
    const verifier = vi.fn(async (_idToken: string) => {
      throw new Error("service account private key failure");
    });
    const repository = makeRepository();
    const authenticatedApp = makeAuthenticatedApp(verifier, repository);

    const response = await request(authenticatedApp)
      .get("/api/v1/me")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private key failure");
    expect(repository.findByFirebaseUid).not.toHaveBeenCalled();
  });
});
