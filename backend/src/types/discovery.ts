export interface DiscoveryPhoto {
  id: string;
  position: number;
}

export interface DiscoveryCandidate {
  userId: string;
  displayName: string;
  dateOfBirth: Date;
  bio: string | null;
  gender: string | null;
  university: string | null;
  interests: string[];
  photos: DiscoveryPhoto[];
}

export interface DiscoveryQuery {
  limit: number;
  cursor: string | null;
  university: string | null;
}

export interface DiscoveryPage {
  candidates: DiscoveryCandidate[];
  nextCursor: string | null;
}