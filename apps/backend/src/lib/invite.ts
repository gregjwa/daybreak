import { customAlphabet } from "nanoid";

// Generate a secure, URL-safe invite code
const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 12);

export function generateInviteCode(): string {
  return nanoid();
}

export function isInviteExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

export function createExpiryDate(daysFromNow: number = 7): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + daysFromNow);
  return expiry;
}


