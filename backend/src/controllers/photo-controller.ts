import type { Request, RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { PhotoService } from "../services/photo-service.js";
import type { FirebaseIdentity } from "../types/auth.js";

function getFirebaseIdentity(request: Request): FirebaseIdentity {
  if (!request.firebaseIdentity) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid Firebase ID token is required.");
  }

  return request.firebaseIdentity;
}

function getPhotoId(request: Request): string {
  const photoId = request.params["photoId"];
  if (typeof photoId !== "string" || photoId.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "A photo id is required.");
  }

  return photoId;
}

export function createPhotoController(photoService: PhotoService): {
  list: RequestHandler;
  requestUpload: RequestHandler;
  confirm: RequestHandler;
  reorder: RequestHandler;
  remove: RequestHandler;
} {
  return {
    list: async (request, response) => {
      const photos = await photoService.listOwnPhotos(getFirebaseIdentity(request).uid);
      response.status(200).json({ data: { photos } });
    },

    requestUpload: async (request, response) => {
      const upload = await photoService.requestUpload(getFirebaseIdentity(request).uid, request.body);
      response.status(200).json({ data: { upload } });
    },

    confirm: async (request, response) => {
      const photo = await photoService.confirmUpload(
        getFirebaseIdentity(request).uid,
        request.body.storageKey,
      );
      response.status(201).json({ data: { photo } });
    },

    reorder: async (request, response) => {
      const photos = await photoService.reorderOwnPhotos(
        getFirebaseIdentity(request).uid,
        request.body.photoIds,
      );
      response.status(200).json({ data: { photos } });
    },

    remove: async (request, response) => {
      await photoService.deleteOwnPhoto(getFirebaseIdentity(request).uid, getPhotoId(request));
      response.status(204).send();
    },
  };
}