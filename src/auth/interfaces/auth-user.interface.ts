export interface FirebaseUserPayload {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

export interface SessionUserPayload {
  uid: string;
  userId: string;
  email: string;
}
