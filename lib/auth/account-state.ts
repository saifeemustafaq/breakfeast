import "server-only";
import { collections } from "@/lib/db";
import type { UserDoc } from "@/lib/schema";
import { writeAudit } from "./audit";

/**
 * Applies a due timed resume. The filter includes the exact `pausedUntil` that was read,
 * so a later deactivation or an extended pause can never be overwritten.
 */
export async function applyTimedResume<T extends Pick<UserDoc, "_id" | "status" | "pausedUntil" | "name">>(
  user: T,
  now = new Date(),
): Promise<T> {
  if (user.status !== "paused" || !user.pausedUntil || user.pausedUntil > now) return user;
  const c = await collections();
  const resumed = await c.users.findOneAndUpdate(
    { _id: user._id, status: "paused", pausedUntil: user.pausedUntil },
    {
      $set: {
        status: "active",
        pauseReason: null,
        pausedUntil: null,
        pausedAt: null,
        pausedBy: null,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (resumed) {
    await writeAudit({
      actor: { type: "system" },
      action: "user.resumed_automatically",
      target: { type: "user", id: user._id, label: user.name },
      changes: { status: { from: "paused", to: "active" } },
    });
    return { ...user, ...resumed };
  }
  const current = await c.users.findOne({ _id: user._id });
  return current ? { ...user, ...current } : user;
}
