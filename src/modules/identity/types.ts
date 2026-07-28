export type AppRole = "admin" | "coach";

export interface UserProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  locale: string;
}

export interface CurrentUser {
  profile: UserProfile;
  roles: AppRole[];
}
