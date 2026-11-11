export interface PhotoUploadTarget {
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface StoredObjectInfo {
  contentType: string;
  sizeBytes: number;
}

export interface PhotoStorage {
  createUploadTarget(params: {
    key: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<PhotoUploadTarget>;
  getObjectInfo(key: string): Promise<StoredObjectInfo | null>;
  deleteObject(key: string): Promise<void>;
}