import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ProfileRepository } from "../src/db/profile-repository.js";
import type { SwipeRepository } from "../src/db/swipe-repository.js";
import type { UserRepository } from "../src/db/user-repository.js";
import type { ApplicationUser } from "../src/types/account.js";
import type { FirebaseIdentity, FirebaseTokenVerifier } from "../src/types/auth.js";
import type { UserProfile } from "../src/types/profile.js";
import type { MatchRecord, SwipeAction, SwipeOutcome } from "../src/types/swipe.js";

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

const matchCreatedAt = new Date("2026-11-12T10:00:00.000Z");

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

function makeSwipeRepository(overrides: Partial<SwipeRepository> = {}): SwipeRepository {
  return {
    record: vi.fn(
      async (_swiperId: string, _targetId: string, action: SwipeAction) =>
        ({ action, matched: false, match: null }) as SwipeOutcome | null,
    ),
    listMatches: vi.fn(async (_userId: string) => [] as MatchRecord[]),
    ...overrides,
  };
}

function makeVerifier(): FirebaseTokenVerifier {
  return vi.fn(async (_idToken: string) => identityA);
}

function makeApp(options: {
  userRepository?: UserRepository;
  profileRepository?: ProfileRepository;
  swipeRepository?: SwipeRepository;
} = {}) {
  return createApp({
    firebaseTokenVerifier: makeVerifier(),
    userRepository: options.userRepository ?? makeUserRepository(),
    profileRepository: options.profileRepository ?? makeProfileRepository(),
    swipeRepository: options.swipeRepository ?? makeSwipeRepository(),
  });
}

const AUTH = "Bearer valid-token";

describe("swipe routes require authentication", () => {
  it("POST /api/v1/swipes returns 401 without touching the repository", async () => {
    const swipeRepository = makeSwipeRepository();

    const response = await request(makeApp({ swipeRepository }))
      .post("/api/v1/swipes")
      .send({ targetUserId: "application-user-b", action: "LIKE" });

    expect(response.status).toBe(401);
    expect(swipeRepository.record).not.toHaveBeenCalled();
  });

  it("GET /api/v1/me/matches returns 401 without touching the repository", async () => {
    const swipeRepository = makeSwipeRepository();

    const response = await request(makeApp({ swipeRepository })).get("/api/v1/me/matches");

    expect(response.status).toBe(401);
    expect(swipeRepository.listMatches).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/swipes", () => {
  it.each(["LIKE", "PASS"] as const)("records a %s by the internal user id with no match", async (action) => {
    const swipeRepository = makeSwipeRepository();

    const response = await request(makeApp({ swipeRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-b", action });

    expect(response.status).toBe(201);
    expect(response.body.data.swipe).toEqual({ action, matched: false, match: null });
    expect(swipeRepository.record).toHaveBeenCalledWith("application-user-a", "application-user-b", action);
  });

  it("reports a match and shows only the other user's id", async () => {
    const match: MatchRecord = {
      id: "match-1",
      userAId: "application-user-a",
      userBId: "application-user-b",
      createdAt: matchCreatedAt,
    };
    const swipeRepository = makeSwipeRepository({
      record: vi.fn(async () => ({ action: "LIKE", matched: true, match }) as SwipeOutcome | null),
    });

    const response = await request(makeApp({ swipeRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-b", action: "LIKE" });

    expect(response.status).toBe(201);
    expect(response.body.data.swipe.matched).toBe(true);
    expect(response.body.data.swipe.match).toEqual({
      id: "match-1",
      otherUserId: "application-user-b",
      createdAt: matchCreatedAt.toISOString(),
    });
    expect(response.body.data.swipe.match.userAId).toBeUndefined();
    expect(response.body.data.swipe.match.userBId).toBeUndefined();
  });

  it("finds the other user even when the caller is the second id of the sorted pair", async () => {
    const match: MatchRecord = {
      id: "match-2",
      userAId: "application-user-0",
      userBId: "application-user-a",
      createdAt: matchCreatedAt,
    };
    const swipeRepository = makeSwipeRepository({
      record: vi.fn(async () => ({ action: "LIKE", matched: true, match }) as SwipeOutcome | null),
    });

    const response = await request(makeApp({ swipeRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-0", action: "LIKE" });

    expect(response.status).toBe(201);
    expect(response.body.data.swipe.match.otherUserId).toBe("application-user-0");
  });

  it("rejects swiping on yourself before any other check", async () => {
    const swipeRepository = makeSwipeRepository();
    const profileRepository = makeProfileRepository();

    const response = await request(makeApp({ swipeRepository, profileRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-a", action: "LIKE" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CANNOT_SWIPE_SELF");
    expect(profileRepository.findByUserId).not.toHaveBeenCalled();
    expect(swipeRepository.record).not.toHaveBeenCalled();
  });

  it("requires the swiper to have a profile", async () => {
    const swipeRepository = makeSwipeRepository();
    const profileRepository = makeProfileRepository({
      findByUserId: vi.fn(async (userId: string) =>
        userId === "application-user-a" ? null : profileFor(userId),
      ),
    });

    const response = await request(makeApp({ swipeRepository, profileRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-b", action: "LIKE" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PROFILE_REQUIRED");
    expect(swipeRepository.record).not.toHaveBeenCalled();
  });

  it("returns 404 USER_NOT_FOUND when the target has no profile", async () => {
    const swipeRepository = makeSwipeRepository();
    const profileRepository = makeProfileRepository({
      findByUserId: vi.fn(async (userId: string) =>
        userId === "application-user-a" ? profileFor(userId) : null,
      ),
    });

    const response = await request(makeApp({ swipeRepository, profileRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "no-such-user", action: "LIKE" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
    expect(swipeRepository.record).not.toHaveBeenCalled();
  });

  it("returns 409 ALREADY_SWIPED when the pair was already swiped", async () => {
    const swipeRepository = makeSwipeRepository({
      record: vi.fn(async () => null as SwipeOutcome | null),
    });

    const response = await request(makeApp({ swipeRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-b", action: "LIKE" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_SWIPED");
  });

  it("returns 404 USER_NOT_PROVISIONED when the caller has no application account", async () => {
    const userRepository = makeUserRepository({ findByFirebaseUid: vi.fn(async () => null) });
    const swipeRepository = makeSwipeRepository();

    const response = await request(makeApp({ userRepository, swipeRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send({ targetUserId: "application-user-b", action: "LIKE" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_PROVISIONED");
    expect(swipeRepository.record).not.toHaveBeenCalled();
  });

  it.each([
    [{ targetUserId: "application-user-b", action: "SUPERLIKE" }],
    [{ targetUserId: "application-user-b", action: "like" }],
    [{ targetUserId: "application-user-b" }],
    [{ action: "LIKE" }],
    [{ targetUserId: "   ", action: "LIKE" }],
    [{ targetUserId: "application-user-b", action: "LIKE", swiperId: "someone-else" }],
  ])("rejects an invalid body: %j", async (body) => {
    const swipeRepository = makeSwipeRepository();

    const response = await request(makeApp({ swipeRepository }))
      .post("/api/v1/swipes")
      .set("Authorization", AUTH)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(swipeRepository.record).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/me/matches", () => {
  it("lists matches by the internal user id, showing only the other user's id", async () => {
    const swipeRepository = makeSwipeRepository({
      listMatches: vi.fn(async () => [
        { id: "match-1", userAId: "application-user-a", userBId: "application-user-b", createdAt: matchCreatedAt },
        { id: "match-2", userAId: "application-user-0", userBId: "application-user-a", createdAt: matchCreatedAt },
      ]),
    });

    const response = await request(makeApp({ swipeRepository }))
      .get("/api/v1/me/matches")
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(swipeRepository.listMatches).toHaveBeenCalledWith("application-user-a");
    expect(response.body.data.matches).toEqual([
      { id: "match-1", otherUserId: "application-user-b", createdAt: matchCreatedAt.toISOString() },
      { id: "match-2", otherUserId: "application-user-0", createdAt: matchCreatedAt.toISOString() },
    ]);
  });
});