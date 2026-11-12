import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { DiscoveryRepository } from "../src/db/discovery-repository.js";
import type { ProfileRepository } from "../src/db/profile-repository.js";
import type { UserRepository } from "../src/db/user-repository.js";
import { calculateAge } from "../src/services/discovery-service.js";
import type { ApplicationUser } from "../src/types/account.js";
import type { FirebaseIdentity, FirebaseTokenVerifier } from "../src/types/auth.js";
import type { DiscoveryCandidate, DiscoveryPage, DiscoveryQuery } from "../src/types/discovery.js";
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

function profileFor(userId: string): UserProfile {
  return {
    id: "profile-" + userId,
    userId,
    displayName: "Person " + userId,
    dateOfBirth: new Date("1999-05-20T00:00:00.000Z"),
    bio: null,
    gender: null,
    university: null,
    interests: [],
    createdAt: new Date("2026-11-04T00:00:00.000Z"),
    updatedAt: new Date("2026-11-04T00:00:00.000Z"),
  };
}

function candidateFor(userId: string, dateOfBirth: Date): DiscoveryCandidate {
  return {
    userId,
    displayName: "Candidate " + userId,
    dateOfBirth,
    bio: "Hello there",
    gender: "female",
    university: "Example University",
    interests: ["music"],
    photos: [{ id: "photo-1", position: 0 }],
  };
}

function yearsAgoUtc(years: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
}

function makeUserRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    syncFromFirebase: vi.fn(async () => accountA),
    findByFirebaseUid: vi.fn(async () => accountA),
    ...overrides,
  };
}

function makeProfileRepository(overrides: Partial<ProfileRepository> = {}): ProfileRepository {
  return {
    findByUserId: vi.fn(async (userId: string) => profileFor(userId) as UserProfile | null),
    upsertForUser: vi.fn(async (userId: string, _input) => profileFor(userId)),
    ...overrides,
  };
}

function makeDiscoveryRepository(page: DiscoveryPage = { candidates: [], nextCursor: null }): DiscoveryRepository {
  return {
    listCandidates: vi.fn(async (_viewerId: string, _query: DiscoveryQuery) => page),
  };
}

function makeVerifier(): FirebaseTokenVerifier {
  return vi.fn(async (_idToken: string) => identityA);
}

function makeApp(options: {
  userRepository?: UserRepository;
  profileRepository?: ProfileRepository;
  discoveryRepository?: DiscoveryRepository;
} = {}) {
  return createApp({
    firebaseTokenVerifier: makeVerifier(),
    userRepository: options.userRepository ?? makeUserRepository(),
    profileRepository: options.profileRepository ?? makeProfileRepository(),
    discoveryRepository: options.discoveryRepository ?? makeDiscoveryRepository(),
  });
}

const AUTH = "Bearer valid-token";

describe("calculateAge", () => {
  const dateOfBirth = new Date("2000-05-20T00:00:00.000Z");

  it.each([
    ["the day before the birthday", "2026-05-19T12:00:00.000Z", 25],
    ["on the birthday", "2026-05-20T00:00:00.000Z", 26],
    ["after the birthday", "2026-11-12T00:00:00.000Z", 26],
    ["earlier in the year than the birth month", "2026-01-01T00:00:00.000Z", 25],
  ])("%s", (_label, now, expected) => {
    expect(calculateAge(dateOfBirth, new Date(now))).toBe(expected);
  });
});

describe("GET /api/v1/discovery authentication and access", () => {
  it("returns 401 without a token and never reaches the repository", async () => {
    const discoveryRepository = makeDiscoveryRepository();

    const response = await request(makeApp({ discoveryRepository })).get("/api/v1/discovery");

    expect(response.status).toBe(401);
    expect(discoveryRepository.listCandidates).not.toHaveBeenCalled();
  });

  it("checks authentication before validating the query", async () => {
    const discoveryRepository = makeDiscoveryRepository();

    const response = await request(makeApp({ discoveryRepository })).get("/api/v1/discovery?limit=0");

    expect(response.status).toBe(401);
    expect(discoveryRepository.listCandidates).not.toHaveBeenCalled();
  });

  it("requires the viewer to have a profile", async () => {
    const discoveryRepository = makeDiscoveryRepository();
    const profileRepository = makeProfileRepository({ findByUserId: vi.fn(async () => null) });

    const response = await request(makeApp({ discoveryRepository, profileRepository }))
      .get("/api/v1/discovery")
      .set("Authorization", AUTH);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PROFILE_REQUIRED");
    expect(discoveryRepository.listCandidates).not.toHaveBeenCalled();
  });

  it("returns 404 USER_NOT_PROVISIONED when the caller has no application account", async () => {
    const userRepository = makeUserRepository({ findByFirebaseUid: vi.fn(async () => null) });
    const discoveryRepository = makeDiscoveryRepository();

    const response = await request(makeApp({ userRepository, discoveryRepository }))
      .get("/api/v1/discovery")
      .set("Authorization", AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_PROVISIONED");
    expect(discoveryRepository.listCandidates).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/discovery privacy", () => {
  it("never exposes the date of birth or any field outside the public view", async () => {
    const candidate = {
      ...candidateFor("application-user-b", new Date("1999-05-20T00:00:00.000Z")),
      email: "secret@example.test",
      photos: [{ id: "photo-1", position: 0, storageKey: "users/application-user-b/photos/secret.jpg" }],
    } as DiscoveryCandidate;
    const discoveryRepository = makeDiscoveryRepository({ candidates: [candidate], nextCursor: null });

    const response = await request(makeApp({ discoveryRepository }))
      .get("/api/v1/discovery")
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    const profile = response.body.data.profiles[0];
    expect(Object.keys(profile).sort()).toEqual(
      ["age", "bio", "displayName", "gender", "interests", "photos", "university", "userId"].sort(),
    );
    expect(Object.keys(profile.photos[0]).sort()).toEqual(["id", "position"]);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("dateOfBirth");
    expect(serialized).not.toContain("1999-05-20");
    expect(serialized).not.toContain("secret@example.test");
    expect(serialized).not.toContain("secret.jpg");
  });

  it("returns an age calculated from the date of birth", async () => {
    const discoveryRepository = makeDiscoveryRepository({
      candidates: [candidateFor("application-user-b", yearsAgoUtc(30))],
      nextCursor: null,
    });

    const response = await request(makeApp({ discoveryRepository }))
      .get("/api/v1/discovery")
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(response.body.data.profiles[0].age).toBe(30);
    expect(response.body.data.profiles[0].userId).toBe("application-user-b");
  });
});

describe("GET /api/v1/discovery query handling", () => {
  it("uses the defaults when no query parameters are given", async () => {
    const discoveryRepository = makeDiscoveryRepository();

    const response = await request(makeApp({ discoveryRepository }))
      .get("/api/v1/discovery")
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(discoveryRepository.listCandidates).toHaveBeenCalledWith("application-user-a", {
      limit: 20,
      cursor: null,
      university: null,
    });
  });

  it("passes limit, cursor, and university through and returns nextCursor", async () => {
    const discoveryRepository = makeDiscoveryRepository({
      candidates: [candidateFor("application-user-b", yearsAgoUtc(25))],
      nextCursor: "profile-9",
    });

    const response = await request(makeApp({ discoveryRepository }))
      .get("/api/v1/discovery?limit=5&cursor=profile-3&university=Covenant%20University")
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(response.body.data.nextCursor).toBe("profile-9");
    expect(discoveryRepository.listCandidates).toHaveBeenCalledWith("application-user-a", {
      limit: 5,
      cursor: "profile-3",
      university: "Covenant University",
    });
  });

  it.each([
    "limit=0",
    "limit=51",
    "limit=abc",
    "limit=1.5",
    "limit=-3",
    "cursor=",
    "university=%20%20",
    "userId=application-user-b",
    "limit=5&unknown=1",
  ])("rejects an invalid query string: ?%s", async (queryString) => {
    const discoveryRepository = makeDiscoveryRepository();

    const response = await request(makeApp({ discoveryRepository }))
      .get("/api/v1/discovery?" + queryString)
      .set("Authorization", AUTH);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(discoveryRepository.listCandidates).not.toHaveBeenCalled();
  });
});