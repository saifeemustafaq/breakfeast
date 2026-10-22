import "server-only";
import { DAY } from "@/lib/time";
import { requireUserPage } from "@/lib/auth/guards";
import { collections } from "@/lib/db";
import { invitesWithNames, livePending, memberCount } from "@/lib/households";
import { displayPhone } from "@/lib/phone";

export type HouseholdView = {
  members: { id: string; name: string; phone: string; you: boolean }[];
  /** Pending invites sent from this household. */
  outgoing: { id: string; phone: string; invitedBy: string; mine: boolean; expiresInDays: number }[];
  /** Invites waiting for this user; only shown while they're on their own. */
  incoming: { id: string; fromName: string; householdSize: number; expiresInDays: number }[];
};

const daysLeft = (at: Date, now: Date) => Math.max(1, Math.ceil((at.getTime() - now.getTime()) / DAY));

export async function getHouseholdView(): Promise<HouseholdView> {
  const { user } = await requireUserPage();
  const c = await collections();
  const now = new Date();
  const [members, outgoingDocs] = await Promise.all([
    c.users
      .find({ householdId: user.householdId }, { projection: { name: 1, loginIdNormalized: 1 } })
      .sort({ createdAt: 1 })
      .toArray(),
    c.householdInvites.find({ householdId: user.householdId, ...livePending(now) }).sort({ createdAt: -1 }).toArray(),
  ]);

  const incomingDocs =
    members.length === 1
      ? await c.householdInvites.find({ toLoginId: user.loginIdNormalized, ...livePending(now) }).sort({ createdAt: -1 }).toArray()
      : [];
  const [outgoing, incoming] = await Promise.all([invitesWithNames(c, outgoingDocs), invitesWithNames(c, incomingDocs)]);
  const sizes = await Promise.all(incoming.map((i) => memberCount(c, i.householdId)));

  return {
    members: members.map((m) => ({
      id: m._id.toHexString(),
      name: m.name,
      phone: displayPhone(m.loginIdNormalized),
      you: m._id.equals(user._id),
    })),
    outgoing: outgoing.map((i) => ({
      id: i._id.toHexString(),
      phone: displayPhone(i.toLoginId),
      invitedBy: i.fromName,
      mine: i.fromUserId.equals(user._id),
      expiresInDays: daysLeft(i.expiresAt, now),
    })),
    incoming: incoming
      .map((i, n) => ({ invite: i, size: sizes[n] }))
      .filter(({ size }) => size > 0)
      .map(({ invite, size }) => ({
        id: invite._id.toHexString(),
        fromName: invite.fromName,
        householdSize: size,
        expiresInDays: daysLeft(invite.expiresAt, now),
      })),
  };
}
