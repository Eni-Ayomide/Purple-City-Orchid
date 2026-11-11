export interface ProfilePhoto {
  id: string;
  userId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  position: number;
  createdAt: Date;
}

export interface NewProfilePhotoInput {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
}