import "server-only";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { ApiError, STORAGE_MESSAGE } from "@/lib/auth/errors";
import { requireUserAction, type UserAuth } from "@/lib/auth/guards";
import { householdTag, userTag } from "@/lib/cache-tags";
import { isStorageError } from "@/lib/db";
import { recordWorkflow, traceFrom } from "@/lib/monitoring/activity";

export type { ActionResult } from "@/lib/action-result";

export const done = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

/** A business event pair from docs/business-events.md, e.g. `["cart.added", "cart.add_failed"]`. */
export type BusinessEvent = readonly [success: string, failure: string];

/** Validates Server Action input; the first issue's message becomes the action's error. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ApiError("VALIDATION_FAILED", result.error.issues[0]?.message ?? "That request wasn't valid.");
}

function messageFor(error: unknown, requestId: string) {
  if (error instanceof ApiError) return error.message;
  if (isStorageError(error)) return STORAGE_MESSAGE;
  console.error(`[${requestId}] Server Action failed`, error);
  return "Something went wrong. Try again.";
}

/**
 * Runs a user Server Action: session and same-origin check (which may redirect, so it sits
 * outside the try), then `fn`, with failures turned into `{ ok: false, error }`. Records the
 * success or failure business event after the response.
 */
export async function userAction<T>(
  event: BusinessEvent,
  data: Record<string, unknown>,
  fn: (auth: UserAuth) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const auth = await requireUserAction();
  const trace = traceFrom(await headers());
  let result: ActionResult<T>;
  try {
    result = await fn(auth);
  } catch (error) {
    result = { ok: false, error: messageFor(error, auth.ctx.requestId) };
  }
  // Every write touches the household's or the user's own data, so expire both: this also
  // clears the client router cache, which is what makes the change show on the next tab.
  if (result.ok) {
    updateTag(householdTag(auth.user.householdId.toHexString()));
    updateTag(userTag(auth.user._id.toHexString()));
  }
  const [success, failure] = event;
  after(() => recordWorkflow(auth, trace, result.ok ? success : failure, result.ok ? data : { ...data, error: result.error }));
  return result;
}
