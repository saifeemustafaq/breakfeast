/** Accepts only same-site absolute paths (optionally under a prefix); otherwise returns the fallback. */
export function safeReturnPath(next: unknown, fallback: string, requiredPrefix?: string) {
  if (typeof next !== "string" || !next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(next)) return fallback;
  if (
    requiredPrefix &&
    next !== requiredPrefix &&
    !next.startsWith(`${requiredPrefix}/`) &&
    !next.startsWith(`${requiredPrefix}?`)
  ) {
    return fallback;
  }
  return next;
}
