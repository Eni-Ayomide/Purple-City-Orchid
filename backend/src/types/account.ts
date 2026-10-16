export interface ApplicationUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
