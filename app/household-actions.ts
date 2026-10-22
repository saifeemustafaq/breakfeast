"use server";

import { ObjectId } from "mongodb";
import { refresh } from "next/cache";
import { z } from "zod";
import { done, fail, parseInput, userAction, type ActionResult } from "@/lib/action";
import { authConfig } from "@/lib/auth/config";
import { collections } from "@/lib/db";
import { acceptInvite, leaveHousehold as leave, livePending } from "@/lib/households";
import { PHONE_ERROR, validatePhone } from "@/lib/phone";
import { DAY } from "@/lib/time";

const INVITES_PER_DAY = 20;
const UNAVAILABLE = "This invite is no longer available.";

const phoneText = z.string().catch("");
const inviteId = z.string().refine(ObjectId.isValid, { error: UNAVAILABLE });

/**
 * The reply is the same whether or not the number has an account, or can join,
 * so invites can't be used to discover who uses Breakfeast.
 */
export async function inviteToHousehold(phoneInput: string): Promise<ActionResult> {
  return userAction(["household.invited", "household.invite_failed"], {}, async ({ user }) => {
    const phone = validatePhone(parseInput(phoneText, phoneInput));
    if (!phone.ok) return fail(PHONE_ERROR);
    if (phone.e164 === user.loginIdNormalized) return fail("That's your own number.");

    const c = await collections();
    const now = new Date();
    const member = await c.users.findOne(
      { loginIdNormalized: phone.e164, householdId: user.householdId },
      { projection: { name: 1 } },
    );
    if (member) return fail(`${member.name} is already in your household.`);

    const sent = await c.householdInvites.countDocuments({
      householdId: user.householdId,
      createdAt: { $gt: new Date(now.getTime() - DAY) },
    });
    if (sent >= INVITES_PER_DAY) return fail("You've sent a lot of invites today. Try again tomorrow.");

    const expiresAt = new Date(now.getTime() + authConfig.householdInviteMs);
    const existing = await c.householdInvites.findOneAndUpdate(
      { householdId: user.householdId, toLoginId: phone.e164, ...livePending(now) },
      { $set: { expiresAt, fromUserId: user._id } },
    );
    if (!existing) {
      await c.householdInvites.insertOne({
        _id: new ObjectId(),
        householdId: user.householdId,
        fromUserId: user._id,
        toLoginId: phone.e164,
        status: "pending",
        createdAt: now,
        respondedAt: null,
        expiresAt,
      });
    }
    refresh();
    return done(null, `Invite sent. If ${phone.display} can join, they'll see it next time they open Breakfeast.`);
  });
}

export async function respondToInvite(inviteIdInput: string, accept: boolean): Promise<ActionResult> {
  const event = accept === true
    ? (["household.joined", "household.join_failed"] as const)
    : (["household.declined", "household.decline_failed"] as const);
  return userAction(event, {}, async ({ user }) => {
    const accepted = parseInput(z.boolean(), accept);
    const id = new ObjectId(parseInput(inviteId, inviteIdInput));
    if (accepted) {
      await acceptInvite(user._id, id);
      refresh();
      return done(null, "You've joined the household.");
    }
    const c = await collections();
    const res = await c.householdInvites.updateOne(
      { _id: id, toLoginId: user.loginIdNormalized, ...livePending() },
      { $set: { status: "declined", respondedAt: new Date() } },
    );
    if (!res.matchedCount) return fail(UNAVAILABLE);
    refresh();
    return done(null, "Invite declined.");
  });
}

export async function cancelInvite(inviteIdInput: string): Promise<ActionResult> {
  return userAction(["household.invite_cancelled", "household.cancel_failed"], {}, async ({ user }) => {
    const id = new ObjectId(parseInput(inviteId, inviteIdInput));
    const c = await collections();
    const res = await c.householdInvites.updateOne(
      { _id: id, householdId: user.householdId, fromUserId: user._id, status: "pending" },
      { $set: { status: "cancelled", respondedAt: new Date() } },
    );
    if (!res.matchedCount) return fail(UNAVAILABLE);
    refresh();
    return done(null, "Invite cancelled.");
  });
}

export async function leaveHousehold(): Promise<ActionResult> {
  return userAction(["household.left", "household.leave_failed"], {}, async ({ user }) => {
    await leave(user._id);
    refresh();
    return done(null, "You've left the household. Your copy of everything is saved.");
  });
}
