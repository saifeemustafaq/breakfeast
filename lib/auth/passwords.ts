import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { authConfig } from "./config";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, authConfig.bcryptCost);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | undefined;

/** Spends the same time as a real compare so unknown identifiers aren't revealed by timing. */
export async function dummyVerify(password: string) {
  dummyHash ??= bcrypt.hash("dummy-password-for-timing", authConfig.bcryptCost);
  await bcrypt.compare(password, await dummyHash);
  return false;
}

export function generateUserPassword() {
  const { generatedAlphabet: alphabet } = authConfig;
  const { generatedLength } = authConfig.userPassword;
  for (;;) {
    let out = "";
    for (let i = 0; i < generatedLength; i++) out += alphabet[randomInt(alphabet.length)];
    if (/[a-z]/.test(out) && /\d/.test(out)) return out;
  }
}

export function generateAdminPassword(length = 12) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Returns an error message, or null when the typed user password is acceptable. */
export function checkUserPassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return "Enter a password.";
  const length = [...value].length;
  if (length > authConfig.userPassword.maxLength) return "Passwords are at most 6 characters.";
  if (length < authConfig.userPassword.minLength) return "Passwords are at least 4 characters.";
  return null;
}

export function checkAdminPassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return "Enter a password.";
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < authConfig.adminPassword.minBytes) return "Admin passwords are at least 6 characters.";
  if (bytes > authConfig.adminPassword.maxBytes) return "Admin passwords are at most 72 bytes.";
  return null;
}
