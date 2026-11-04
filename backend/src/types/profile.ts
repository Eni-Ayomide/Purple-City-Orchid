export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  dateOfBirth: Date;
  bio: string | null;
  gender: string | null;
  university: string | null;
  interests: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertProfileInput {
  displayName: string;
  dateOfBirth: Date;
  bio?: string | null;
  gender?: string | null;
  university?: string | null;
  interests?: string[];
}