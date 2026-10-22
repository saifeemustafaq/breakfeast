const EMAIL = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;

/** "maria@gmail.com" becomes "@gmail.com" in every logged string. */
export const redactEmails = (s: string) => s.replace(EMAIL, "@$1");

export function redactData(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactEmails(value).slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth > 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactData(v, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([k, v]) => [k.slice(0, 60), redactData(v, depth + 1)]),
    );
  }
  return null;
}
