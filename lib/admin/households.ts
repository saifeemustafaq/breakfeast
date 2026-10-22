import "server-only";
import type { ObjectId } from "mongodb";
import { z } from "zod";
import { objectId, parse } from "@/lib/api/http";
import { writeAudit } from "@/lib/auth/audit";
import { ApiError } from "@/lib/auth/errors";
import type { AdminAuth } from "@/lib/auth/guards";
import { collections } from "@/lib/db";
import { invitesWithNames, leaveHousehold, livePending, memberCount, moveToHousehold } from "@/lib/households";
import { displayPhone } from "@/lib/phone";
import type { AccountStatus, UserDoc } from "@/lib/schema";
import { adminActor } from "./auth";
import { loadUser } from "./users";

export type HouseholdMember = { id: string; name: string; loginId: string; status: AccountStatus };
export type HouseholdInviteRow = { id: string; phone: string; fromName: string; createdAt: string; expiresAt: string };
export type HouseholdDetail = {
  householdId: string;
  members: HouseholdMember[];
  /** Pending invites sent from this household. */
  sent: HouseholdInviteRow[];
  /** Pending invites addressed to this user's number. */
  received: HouseholdInviteRow[];
};

const sizeLabel = (n: number) => (n <= 1 ? "Solo" : `Shared with ${n - 1}`);

export async function householdDetail(userId: ObjectId): Promise<HouseholdDetail> {
  const user = await loadUser(userId);
  const c = await collections();
  const now = new Date();
  const [members, sent, received] = await Promise.all([
    c.users.find({ householdId: user.householdId }).sort({ createdAt: 1 }).toArray(),
    c.householdInvites.find({ householdId: user.householdId, ...livePending(now) }).sort({ createdAt: -1 }).toArray(),
    c.householdInvites.find({ toLoginId: user.loginIdNormalized, ...livePending(now) }).sort({ createdAt: -1 }).toArray(),
  ]);
  const [sentRows, receivedRows] = await Promise.all([invitesWithNames(c, sent), invitesWithNames(c, received)]);
  const toRow = (i: (typeof sentRows)[number]): HouseholdInviteRow => ({
    id: i._id.toHexString(),
    phone: displayPhone(i.toLoginId),
    fromName: i.fromName,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
  });
  return {
    householdId: user.householdId.toHexString(),
    members: members.map((m: UserDoc) => ({ id: m._id.toHexString(), name: m.name, loginId: m.loginId, status: m.status })),
    sent: sentRows.map(toRow),
    received: receivedRows.map(toRow),
  };
}

/** Takes the user out of a shared household; they keep a copy of its data. */
export async function removeFromHousehold(userId: ObjectId, auth: AdminAuth) {
  const user = await loadUser(userId);
  const c = await collections();
  if ((await memberCount(c, user.householdId)) <= 1) {
    throw new ApiError("INVALID_TRANSITION", `${user.name} isn't sharing a household.`);
  }
  const result = await leaveHousehold(user._id);
  await writeAudit({
    actor: adminActor(auth),
    action: "household.member_removed",
    target: { type: "user", id: user._id, label: user.name },
    changes: { household: { from: sizeLabel(result.previousSize), to: "Solo" } },
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return householdDetail(user._id);
}

const moveBody = z.object({ targetUserId: z.string() });

/** Moves the user into the target user's household, merging their data in. */
export async function moveUserToHousehold(userId: ObjectId, body: unknown, auth: AdminAuth) {
  const { targetUserId } = parse(moveBody, body);
  const [user, target] = await Promise.all([loadUser(userId), loadUser(objectId(targetUserId, "That household member"))]);
  const c = await collections();
  const [fromSize, intoSize] = await Promise.all([memberCount(c, user.householdId), memberCount(c, target.householdId)]);
  await moveToHousehold(user._id, target.householdId);
  await writeAudit({
    actor: adminActor(auth),
    action: "household.member_moved",
    target: { type: "user", id: user._id, label: user.name },
    changes: {
      household: {
        from: sizeLabel(fromSize),
        to: `${target.name}'s household (${intoSize + 1} people)`,
      },
    },
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return householdDetail(user._id);
}
