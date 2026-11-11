import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PhotoRepository } from "../src/db/photo-repository.js";
import type { UserRepository } from "../src/db/user-repository.js";
import type { ApplicationUser } from "../src/types/account.js";
import type { FirebaseIdentity, FirebaseTokenVerifier } from "../src/types/auth.js";
import type { ProfilePhoto } from "../src/types/photo.js";
import type { PhotoStorage } from "../src/types/photo-storage.js";

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

const ownKey = "users/application-user-a/photos/11111111-1111-1111-1111-111111111111.jpg";

const photoA: ProfilePhoto = {
  id: "photo-a",
  userId: accountA.id,
  storageKey: ownKey,
  contentType: "image/jpeg",
  sizeBytes: 1024,
  position: 0,
  createdAt: new Date("2026-11-11T00:00:00.000Z"),
};

function makeUserRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    syncFromFirebase: vi.fn(async () => accountA),
    findByFirebaseUid: vi.fn(async () => accountA),
    ...overrides,
  };
}

function makePhotoRepository(overrides: Partial<PhotoRepository> = {}): PhotoRepository {
  return {
    listByUserId: vi.fn(async () => [] as ProfilePhoto[]),
    add: vi.fn(async (_userId: string, _input, _max: number) => photoA as ProfilePhoto | null),
    remove: vi.fn(async (_userId: string, _photoId: string) => photoA as ProfilePhoto | null),
    reorder: vi.fn(async (_userId: string, _ids: string[]) => [photoA] as ProfilePhoto[] | null),
    ...overrides,
  };
}

function makeStorage(overrides: Partial<PhotoStorage> = {}): PhotoStorage {
  return {
    createUploadTarget: vi.fn(async (_params) => ({
      uploadUrl: "https://storage.example.test/upload",
      expiresInSeconds: 300,
    })),
    getObjectInfo: vi.fn(async (_key: string) => ({ contentType: "image/jpeg", sizeBytes: 1024 })),
    deleteObject: vi.fn(async (_key: string) => undefined),
    ...overrides,
  };
}

function makeVerifier(): FirebaseTokenVerifier {
  return vi.fn(async (_idToken: string) => identityA);
}

function makeApp(options: {
  userRepository?: UserRepository;
  photoRepository?: PhotoRepository;
  photoStorage?: PhotoStorage;
} = {}) {
  return createApp({
    firebaseTokenVerifier: makeVerifier(),
    userRepository: options.userRepository ?? makeUserRepository(),
    photoRepository: options.photoRepository ?? makePhotoRepository(),
    ...(options.photoStorage ? { photoStorage: options.photoStorage } : {}),
  });
}

const AUTH = "Bearer valid-token";

const photoSet = (count: number): ProfilePhoto[] =>
  Array.from({ length: count }, (_, index) => ({
    ...photoA,
    id: "photo-" + index,
    storageKey: "users/application-user-a/photos/existing-" + index + ".jpg",
    position: index,
  }));

describe("photo routes require authentication", () => {
  it.each([
    ["get", "/api/v1/me/photos", undefined],
    ["post", "/api/v1/me/photos/upload-url", { contentType: "image/jpeg", sizeBytes: 1000 }],
    ["post", "/api/v1/me/photos", { storageKey: ownKey }],
    ["put", "/api/v1/me/photos/order", { photoIds: ["photo-a"] }],
    ["delete", "/api/v1/me/photos/photo-a", undefined],
  ] as const)("%s %s returns 401 without touching storage or the repository", async (method, path, body) => {
    const photoRepository = makePhotoRepository();
    const photoStorage = makeStorage();
    const app = makeApp({ photoRepository, photoStorage });

    const pending = request(app)[method](path);
    const response = body ? await pending.send(body) : await pending;

    expect(response.status).toBe(401);
    expect(photoRepository.listByUserId).not.toHaveBeenCalled();
    expect(photoRepository.add).not.toHaveBeenCalled();
    expect(photoRepository.remove).not.toHaveBeenCalled();
    expect(photoRepository.reorder).not.toHaveBeenCalled();
    expect(photoStorage.createUploadTarget).not.toHaveBeenCalled();
    expect(photoStorage.deleteObject).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/me/photos", () => {
  it("lists photos by the internal user id", async () => {
    const photoRepository = makePhotoRepository({ listByUserId: vi.fn(async () => [photoA]) });

    const response = await request(makeApp({ photoRepository })).get("/api/v1/me/photos").set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(response.body.data.photos).toHaveLength(1);
    expect(photoRepository.listByUserId).toHaveBeenCalledWith("application-user-a");
  });
});

describe("POST /api/v1/me/photos/upload-url", () => {
  it("issues a storage key under the caller's own prefix", async () => {
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoStorage }))
      .post("/api/v1/me/photos/upload-url")
      .set("Authorization", AUTH)
      .send({ contentType: "image/jpeg", sizeBytes: 2048 });

    expect(response.status).toBe(200);
    const upload = response.body.data.upload;
    expect(upload.storageKey.startsWith("users/application-user-a/photos/")).toBe(true);
    expect(upload.storageKey.endsWith(".jpg")).toBe(true);
    expect(upload.uploadUrl).toBe("https://storage.example.test/upload");
    expect(photoStorage.createUploadTarget).toHaveBeenCalledWith({
      key: upload.storageKey,
      contentType: "image/jpeg",
      sizeBytes: 2048,
    });
  });

  it.each([
    [{ contentType: "image/gif", sizeBytes: 1000 }, "UNSUPPORTED_PHOTO_TYPE"],
    [{ contentType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 + 1 }, "PHOTO_TOO_LARGE"],
  ])("rejects an unsupported type or oversized file: %j", async (body, code) => {
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoStorage }))
      .post("/api/v1/me/photos/upload-url")
      .set("Authorization", AUTH)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(code);
    expect(photoStorage.createUploadTarget).not.toHaveBeenCalled();
  });

  it.each([
    { contentType: "image/jpeg", sizeBytes: 0 },
    { contentType: "image/jpeg", sizeBytes: -5 },
    { contentType: "image/jpeg", sizeBytes: 10.5 },
    { contentType: "image/jpeg" },
    { contentType: "image/jpeg", sizeBytes: 1000, userId: "someone-else" },
  ])("rejects an invalid request body: %j", async (body) => {
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoStorage }))
      .post("/api/v1/me/photos/upload-url")
      .set("Authorization", AUTH)
      .send(body);

    expect(response.status).toBe(400);
    expect(photoStorage.createUploadTarget).not.toHaveBeenCalled();
  });

  it("refuses new uploads once the photo limit is reached", async () => {
    const photoRepository = makePhotoRepository({ listByUserId: vi.fn(async () => photoSet(6)) });
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .post("/api/v1/me/photos/upload-url")
      .set("Authorization", AUTH)
      .send({ contentType: "image/png", sizeBytes: 1000 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PHOTO_LIMIT_REACHED");
    expect(photoStorage.createUploadTarget).not.toHaveBeenCalled();
  });

  it("returns 503 STORAGE_NOT_CONFIGURED when no storage is configured", async () => {
    const response = await request(makeApp())
      .post("/api/v1/me/photos/upload-url")
      .set("Authorization", AUTH)
      .send({ contentType: "image/jpeg", sizeBytes: 1000 });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_NOT_CONFIGURED");
  });
});

describe("POST /api/v1/me/photos (confirm upload)", () => {
  it("saves a photo for the internal user id using the stored object's real type and size", async () => {
    const photoRepository = makePhotoRepository();
    const photoStorage = makeStorage({
      getObjectInfo: vi.fn(async () => ({ contentType: "image/webp", sizeBytes: 4096 })),
    });

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey: ownKey });

    expect(response.status).toBe(201);
    expect(photoRepository.add).toHaveBeenCalledWith(
      "application-user-a",
      { storageKey: ownKey, contentType: "image/webp", sizeBytes: 4096 },
      6,
    );
  });

  it.each([
    "users/application-user-b/photos/other.jpg",
    "users/application-user-a-evil/photos/other.jpg",
    "users/application-user-a/photos/../../application-user-b/photos/other.jpg",
    "other/path/file.jpg",
  ])("rejects a key that does not belong to the caller: %s", async (storageKey) => {
    const photoRepository = makePhotoRepository();
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PHOTO_KEY");
    expect(photoRepository.add).not.toHaveBeenCalled();
    expect(photoStorage.getObjectInfo).not.toHaveBeenCalled();
    expect(photoStorage.deleteObject).not.toHaveBeenCalled();
  });

  it("rejects a key that was already confirmed", async () => {
    const photoRepository = makePhotoRepository({ listByUserId: vi.fn(async () => [photoA]) });

    const response = await request(makeApp({ photoRepository }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey: ownKey });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PHOTO_ALREADY_CONFIRMED");
    expect(photoRepository.add).not.toHaveBeenCalled();
  });

  it("rejects a confirm when nothing was uploaded", async () => {
    const photoRepository = makePhotoRepository();
    const photoStorage = makeStorage({ getObjectInfo: vi.fn(async () => null) });

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey: ownKey });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PHOTO_NOT_UPLOADED");
    expect(photoRepository.add).not.toHaveBeenCalled();
  });

  it.each([
    [{ contentType: "image/gif", sizeBytes: 1000 }],
    [{ contentType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 + 1 }],
  ])("rejects and deletes an uploaded file that breaks the rules: %j", async (info) => {
    const photoRepository = makePhotoRepository();
    const photoStorage = makeStorage({ getObjectInfo: vi.fn(async () => info) });

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey: ownKey });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PHOTO_FILE");
    expect(photoStorage.deleteObject).toHaveBeenCalledWith(ownKey);
    expect(photoRepository.add).not.toHaveBeenCalled();
  });

  it("deletes the uploaded file when the profile is already full", async () => {
    const photoRepository = makePhotoRepository({ add: vi.fn(async () => null) });
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey: ownKey });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PHOTO_LIMIT_REACHED");
    expect(photoStorage.deleteObject).toHaveBeenCalledWith(ownKey);
  });

  it("rejects unknown fields in the body", async () => {
    const photoRepository = makePhotoRepository();

    const response = await request(makeApp({ photoRepository }))
      .post("/api/v1/me/photos")
      .set("Authorization", AUTH)
      .send({ storageKey: ownKey, userId: "someone-else" });

    expect(response.status).toBe(400);
    expect(photoRepository.add).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/me/photos/order", () => {
  it("reorders the caller's photos", async () => {
    const photoRepository = makePhotoRepository();

    const response = await request(makeApp({ photoRepository }))
      .put("/api/v1/me/photos/order")
      .set("Authorization", AUTH)
      .send({ photoIds: ["photo-b", "photo-a"] });

    expect(response.status).toBe(200);
    expect(photoRepository.reorder).toHaveBeenCalledWith("application-user-a", ["photo-b", "photo-a"]);
  });

  it("returns 400 INVALID_PHOTO_ORDER when the list does not match the caller's photos", async () => {
    const photoRepository = makePhotoRepository({ reorder: vi.fn(async () => null) });

    const response = await request(makeApp({ photoRepository }))
      .put("/api/v1/me/photos/order")
      .set("Authorization", AUTH)
      .send({ photoIds: ["someone-elses-photo"] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PHOTO_ORDER");
  });

  it.each([[{ photoIds: [] }], [{ photoIds: Array.from({ length: 7 }, (_, i) => "photo-" + i) }], [{}]])(
    "rejects an invalid order body: %j",
    async (body) => {
      const photoRepository = makePhotoRepository();

      const response = await request(makeApp({ photoRepository }))
        .put("/api/v1/me/photos/order")
        .set("Authorization", AUTH)
        .send(body);

      expect(response.status).toBe(400);
      expect(photoRepository.reorder).not.toHaveBeenCalled();
    },
  );
});

describe("DELETE /api/v1/me/photos/:photoId", () => {
  it("removes the photo for the internal user id and deletes the stored file", async () => {
    const photoRepository = makePhotoRepository();
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .delete("/api/v1/me/photos/photo-a")
      .set("Authorization", AUTH);

    expect(response.status).toBe(204);
    expect(photoRepository.remove).toHaveBeenCalledWith("application-user-a", "photo-a");
    expect(photoStorage.deleteObject).toHaveBeenCalledWith(ownKey);
  });

  it("returns 404 and leaves storage alone when the photo is not the caller's", async () => {
    const photoRepository = makePhotoRepository({ remove: vi.fn(async () => null) });
    const photoStorage = makeStorage();

    const response = await request(makeApp({ photoRepository, photoStorage }))
      .delete("/api/v1/me/photos/someone-elses-photo")
      .set("Authorization", AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PHOTO_NOT_FOUND");
    expect(photoStorage.deleteObject).not.toHaveBeenCalled();
  });
});