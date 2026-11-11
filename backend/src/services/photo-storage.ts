import { ApiError } from "../errors/api-error.js";
import type { PhotoStorage } from "../types/photo-storage.js";

function storageNotConfigured(): ApiError {
  return new ApiError(503, "STORAGE_NOT_CONFIGURED", "Photo storage is not configured on this server.");
}

export const unconfiguredPhotoStorage: PhotoStorage = {
  async createUploadTarget() {
    throw storageNotConfigured();
  },
  async getObjectInfo() {
    throw storageNotConfigured();
  },
  async deleteObject() {
    throw storageNotConfigured();
  },
};