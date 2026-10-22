/**
 * US mobile numbers (NANP): 10 digits, NXX-NXX-XXXX where N is 2-9, and
 * neither the area code nor the exchange may be an N11 service code.
 * Shared by the client (formatting while typing) and the server (normalizing).
 */

export const PHONE_ERROR = "Enter a valid 10-digit US mobile number.";

export function phoneDigits(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

/** Formats partial input as the user types: "(555) 123-4567". */
export function formatPhoneInput(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const isN11 = (part: string) => part[1] === "1" && part[2] === "1";

export function validatePhone(input: string): { ok: true; e164: string; display: string } | { ok: false } {
  const digits = phoneDigits(input.trim());
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return { ok: false };
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (isN11(area) || isN11(exchange)) return { ok: false };
  return { ok: true, e164: `+1${digits}`, display: formatPhoneInput(digits) };
}

/** "+15551234567" -> "(555) 123-4567" */
export function displayPhone(e164: string) {
  return formatPhoneInput(e164.replace(/^\+1/, ""));
}
