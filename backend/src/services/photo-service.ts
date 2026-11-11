import { randomUUID } from "node:crypto";
import { ApiError } from "../errors/api-error.js";
import type { PhotoRepository } from "../db/photo-repository.js";
import type { ProfilePhoto } from "../types/photo.js";
import type { PhotoStorage } from "../types/photo-storage.js";
import { UserService } from "./user-service.js";

export const MAX_PHOTOS_PER_PROFILE = 6;
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PhotoUploadRequest {
  contentType: string;
  sizeBytes: number;
}

export interface PhotoUploadTicket {
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

function keyPrefixFor(userId: string): string {
  return `users/${userId}/photos/`;
}

export class PhotoService {
  constructor(
    private readonly userService: UserService,
    private readonly photoRepository: PhotoRepository,
    private readonly storage: PhotoStorage,
  ) {}

  async listOwnPhotos(firebaseUid: string): Promise<ProfilePhoto[]> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);
    return this.photoRepository.listByUserId(user.id);
  }

  async requestUpload(firebaseUid: string, request: PhotoUploadRequest): Promise<PhotoUploadTicket> {
    const extension = ALLOWED_PHOTO_TYPES[request.contentType];
    if (!extension) {
      throw new ApiError(400, "UNSUPPORTED_PHOTO_TYPE", "Photos must be JPEG, PNG, or WebP.");
    }
    if (request.sizeBytes <= 0 || request.sizeBytes > MAX_PHOTO_SIZE_BYTES) {
      throw new ApiError(400, "PHOTO_TOO_LARGE", "Photos must be 5 MB or smaller.");
    }

    const user = await this.userService.getByFirebaseUid(firebaseUid);
    const existing = await this.photoRepository.listByUserId(user.id);
    if (existing.length >= MAX_PHOTOS_PER_PROFILE) {
      throw new ApiError(409, "PHOTO_LIMIT_REACHED", "This profile already has the maximum number of photos.");
    }

    const storageKey = `${keyPrefixFor(user.id)}${randomUUID()}.${extension}`;
    const target = await this.storage.createUploadTarget({
      key: storageKey,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
    });

    return { storageKey, uploadUrl: target.uploadUrl, expiresInSeconds: target.expiresInSeconds };
  }

  async confirmUpload(firebaseUid: string, storageKey: string): Promise<ProfilePhoto> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);

    if (!storageKey.startsWith(keyPrefixFor(user.id)) || storageKey.includes("..")) {
      throw new ApiError(400, "INVALID_PHOTO_KEY", "That upload does not belong to this account.");
    }

    const existing = await this.photoRepository.listByUserId(user.id);
    if (existing.some((photo) => photo.storageKey === storageKey)) {
      throw new ApiError(409, "PHOTO_ALREADY_CONFIRMED", "This upload has already been added.");
    }

    const info = await this.storage.getObjectInfo(storageKey);
    if (!info) {
      throw new ApiError(400, "PHOTO_NOT_UPLOADED", "No uploaded file was found for this key.");
    }

    if (!ALLOWED_PHOTO_TYPES[info.contentType] || info.sizeBytes > MAX_PHOTO_SIZE_BYTES) {
      await this.storage.deleteObject(storageKey);
      throw new ApiError(400, "INVALID_PHOTO_FILE", "The uploaded file is not an allowed photo.");
    }

    const photo = await this.photoRepository.add(
      user.id,
      { storageKey, contentType: info.contentType, sizeBytes: info.sizeBytes },
      MAX_PHOTOS_PER_PROFILE,
    );
    if (!photo) {
      await this.storage.deleteObject(storageKey);
      throw new ApiError(409, "PHOTO_LIMIT_REACHED", "This profile already has the maximum number of photos.");
    }

    return photo;
  }

  async deleteOwnPhoto(firebaseUid: string, photoId: string): Promise<void> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);
    const removed = await this.photoRepository.remove(user.id, photoId);
    if (!removed) {
      throw new ApiError(404, "PHOTO_NOT_FOUND", "No such photo on this profile.");
    }

    await this.storage.deleteObject(removed.storageKey);
  }

  async reorderOwnPhotos(firebaseUid: string, orderedPhotoIds: string[]): Promise<ProfilePhoto[]> {
    const user = await this.userService.getByFirebaseUid(firebaseUid);
    const photos = await this.photoRepository.reorder(user.id, orderedPhotoIds);
    if (!photos) {
      throw new ApiError(
        400,
        "INVALID_PHOTO_ORDER",
        "The order must list each of your photos exactly once.",
      );
    }

    return photos;
  }
}