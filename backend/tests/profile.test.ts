import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ProfileRepository } from "../src/db/profile-repository.js";
import type { UserRepository } from "../src/db/user-repository.js";
import type { ApplicationUser } from "../src/types/account.js";
import type { FirebaseIdentity, FirebaseTokenVerifier } from "../src/types/auth.js";
import type { UserProfile } from "../src/types/profile.js";

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

const profileA: UserProfile = {
  id: "profile-a",
  userId: accountA.id,
  displayName: "Person A",
  dateOfBirth: new Date("1999-05-20T00:00:00.000Z"),
  bio: null,
  gender: null,
  university: null,
  interests: [],
  createdAt: new Date("2026-11-04T00:00:00.000Z"),
  updatedAt: new Date("2026-11-04T00:00:00.000Z"),
};

function makeUserRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    syncFromFirebase: vi.fn(async () => accountA),
    findByFirebaseUid: vi.fn(async () => accountA),
    ...overrides,
  };
}

function makeProfileRepository(overrides: Partial<ProfileRepository> = {}): ProfileRepository {
  return {
    findByUserId: vi.fn(async () => profileA),
    upsertForUser: vi.fn(async (_userId: string, _input) => profileA),
    ...overrides,
  };
}

function makeVerifier(): FirebaseTokenVerifier {
  return vi.fn(async (_idToken: string) => identityA);
}

function makeApp(
  userRepository: UserRepository = makeUserRepository(),
  profileRepository: ProfileRepository = makeProfileRepository(),
  verifier: FirebaseTokenVerifier = makeVerifier(),
) {
  return createApp({
    firebaseTokenVerifier: verifier,
    userRepository,
    profileRepository,
  });
}

function dateOfBirthYearsAgo(years: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

const validBody = {
  displayName: "Person A",
  dateOfBirth: "1999-05-20",
};

describe("GET /api/v1/me/profile", () => {
  it("rejects unauthenticated requests without touching the repository", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository)).get("/api/v1/me/profile");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(profileRepository.findByUserId).not.toHaveBeenCalled();
  });

  it("looks the profile up by the internal user id, not the Firebase uid", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .get("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.data.profile.id).toBe("profile-a");
    expect(profileRepository.findByUserId).toHaveBeenCalledWith("application-user-a");
    expect(profileRepository.findByUserId).not.toHaveBeenCalledWith("firebase-uid-a");
  });

  it("returns 404 PROFILE_NOT_FOUND when the account has no profile yet", async () => {
    const profileRepository = makeProfileRepository({ findByUserId: vi.fn(async () => null) });

    const response = await request(makeApp(undefined, profileRepository))
      .get("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PROFILE_NOT_FOUND");
  });

  it("returns 404 USER_NOT_PROVISIONED when no application account exists", async () => {
    const userRepository = makeUserRepository({ findByFirebaseUid: vi.fn(async () => null) });
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(userRepository, profileRepository))
      .get("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_PROVISIONED");
    expect(profileRepository.findByUserId).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/me/profile", () => {
  it("rejects unauthenticated requests before validating or saving", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .send(validBody);

    expect(response.status).toBe(401);
    expect(profileRepository.upsertForUser).not.toHaveBeenCalled();
  });

  it("saves a valid profile for the internal user id with trimmed values and a Date", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ displayName: "  Person A  ", dateOfBirth: "1999-05-20" });

    expect(response.status).toBe(200);
    expect(profileRepository.upsertForUser).toHaveBeenCalledTimes(1);
    expect(profileRepository.upsertForUser).toHaveBeenCalledWith("application-user-a", {
      displayName: "Person A",
      dateOfBirth: new Date("1999-05-20T00:00:00.000Z"),
    });
  });

  it("passes optional fields through when provided, including explicit null", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({
        ...validBody,
        bio: null,
        university: "Example University",
        interests: ["music", "football"],
      });

    expect(response.status).toBe(200);
    expect(profileRepository.upsertForUser).toHaveBeenCalledWith("application-user-a", {
      displayName: "Person A",
      dateOfBirth: new Date("1999-05-20T00:00:00.000Z"),
      bio: null,
      university: "Example University",
      interests: ["music", "football"],
    });
  });

  it("rejects a client-supplied userId or other unknown fields", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validBody, userId: "someone-else" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(profileRepository.upsertForUser).not.toHaveBeenCalled();
  });

  it("rejects users under 18", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validBody, dateOfBirth: dateOfBirthYearsAgo(17) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(profileRepository.upsertForUser).not.toHaveBeenCalled();
  });

  it("accepts a user who turns 18 today", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validBody, dateOfBirth: dateOfBirthYearsAgo(18) });

    expect(response.status).toBe(200);
    expect(profileRepository.upsertForUser).toHaveBeenCalledTimes(1);
  });

  it.each(["2000-02-31", "20000-01-01", "01/01/2000", "not-a-date", "1850-01-01"])(
    "rejects an invalid date of birth: %s",
    async (dateOfBirth) => {
      const profileRepository = makeProfileRepository();

      const response = await request(makeApp(undefined, profileRepository))
        .put("/api/v1/me/profile")
        .set("Authorization", "Bearer valid-token")
        .send({ ...validBody, dateOfBirth });

      expect(response.status).toBe(400);
      expect(profileRepository.upsertForUser).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing, blank, or overlong display name", async () => {
    const profileRepository = makeProfileRepository();
    const app = makeApp(undefined, profileRepository);

    const bodies = [
      { dateOfBirth: "1999-05-20" },
      { displayName: "   ", dateOfBirth: "1999-05-20" },
      { displayName: "x".repeat(51), dateOfBirth: "1999-05-20" },
    ];

    for (const body of bodies) {
      const response = await request(app)
        .put("/api/v1/me/profile")
        .set("Authorization", "Bearer valid-token")
        .send(body);

      expect(response.status).toBe(400);
    }

    expect(profileRepository.upsertForUser).not.toHaveBeenCalled();
  });

  it("rejects too many interests", async () => {
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp(undefined, profileRepository))
      .put("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validBody, interests: Array.from({ length: 11 }, (_, index) => `interest-${index}`) });

    expect(response.status).toBe(400);
    expect(profileRepository.upsertForUser).not.toHaveBeenCalled();
  });
});