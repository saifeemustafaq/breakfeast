/** What every user Server Action returns. Expected failures are values, not exceptions. */
export type ActionResult<T = null> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export const CONNECTION_ERROR = "Couldn't save. Check your connection.";

export class ActionFailed extends Error {}

/**
 * Turns `{ ok: false }` into a thrown ActionFailed, so a caller's optimistic-update
 * `try/catch` handles both a failed action and a dropped connection.
 */
export async function unwrapDone<T>(
  pending: Promise<ActionResult<T>>,
): Promise<{ data: T; message?: string }> {
  const result = await pending;
  if (!result.ok) throw new ActionFailed(result.error);
  return { data: result.data, message: result.message };
}

export async function unwrap<T>(pending: Promise<ActionResult<T>>): Promise<T> {
  const { data } = await unwrapDone(pending);
  return data;
}

/** The message to toast for an error caught around `unwrap`. */
export const failureMessage = (error: unknown, fallback = CONNECTION_ERROR) =>
  error instanceof ActionFailed ? error.message : fallback;
