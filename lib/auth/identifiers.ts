import { PHONE_ERROR, validatePhone } from "@/lib/phone";

export type NormalizedLoginId = { display: string; normalized: string; type: "phone" };

/** Login IDs are US mobile numbers, stored as E.164 and displayed as "(555) 123-4567". */
export function normalizeLoginId(
  input: unknown,
): { ok: true; value: NormalizedLoginId } | { ok: false; error: string } {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "Enter a mobile number." };
  const phone = validatePhone(input);
  if (!phone.ok) return { ok: false, error: PHONE_ERROR };
  return { ok: true, value: { display: phone.display, normalized: phone.e164, type: "phone" } };
}

const ADMIN_ID = /^[a-z0-9._-]{3,32}$/;

export function normalizeAdminId(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter an Admin ID." };
  const value = input.trim().toLowerCase();
  if (!ADMIN_ID.test(value)) {
    return { ok: false, error: "Admin IDs are 3 to 32 characters: letters, digits, dot, underscore or dash." };
  }
  return { ok: true, value };
}
