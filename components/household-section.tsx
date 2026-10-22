"use client";

import { useState, useTransition } from "react";
import { UsersIcon } from "lucide-react";
import { logout } from "@/app/actions";
import { cancelInvite, inviteToHousehold, leaveHousehold, respondToInvite } from "@/app/household-actions";
import { clearActivity, flush } from "@/components/activity/logger";
import { toast } from "@/components/activity/toast";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { failureMessage, unwrapDone, type ActionResult } from "@/lib/action-result";
import type { HouseholdView } from "@/lib/household-data";
import { validatePhone } from "@/lib/phone";

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

type Confirm = { kind: "accept"; id: string; fromName: string } | { kind: "leave" } | null;

export function HouseholdSection({ view }: { view: HouseholdView }) {
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const shared = view.members.length > 1;

  function act(fn: () => Promise<ActionResult>, onDone?: () => void) {
    startTransition(async () => {
      try {
        const { message } = await unwrapDone(fn());
        if (message) toast.success(message);
        onDone?.();
      } catch (err) {
        toast.error(failureMessage(err));
      }
    });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePhone(phone).ok) {
      setInviteError("Enter a valid 10-digit US mobile number.");
      return;
    }
    setInviteError(null);
    startTransition(async () => {
      try {
        const { message } = await unwrapDone(inviteToHousehold(phone));
        setPhone("");
        if (message) toast.success(message);
      } catch (err) {
        setInviteError(
          failureMessage(err, "Couldn't send the invite. Check your connection."),
        );
      }
    });
  }

  return (
    <section aria-labelledby="household-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="household-heading" className="font-heading text-lg font-semibold">
          Household
        </h2>
        <form
          action={logout}
          onSubmit={() => {
            void flush({ all: true });
            clearActivity();
          }}
          className="ml-auto"
        >
          <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
            Sign out
          </Button>
        </form>
      </div>

      {view.incoming.map((inv) => (
        <div key={inv.id} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
          <div>
            <p className="leading-snug">
              <span className="font-medium">{inv.fromName}</span> invited you to share their household (
              {people(inv.householdSize)}).
            </p>
            <p className="text-xs text-muted-foreground">Expires in {days(inv.expiresInDays)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => setConfirm({ kind: "accept", id: inv.id, fromName: inv.fromName })}>
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => respondToInvite(inv.id, false))}>
              Decline
            </Button>
          </div>
        </div>
      ))}

      {shared ? (
        <ul className="flex flex-col divide-y">
          {view.members.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="truncate">
                {m.name}
                {m.you && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{m.phone}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Just you for now. Invite someone to share the pantry, cart, tomorrow&apos;s plan and breakfast history.
        </p>
      )}

      {view.outgoing.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Invites sent</p>
          <ul className="flex flex-col gap-2">
            {view.outgoing.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="tabular-nums">{inv.phone}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.mine ? "Sent by you" : `Sent by ${inv.invitedBy}`}, expires in {days(inv.expiresInDays)}
                  </p>
                </div>
                {inv.mine && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => cancelInvite(inv.id))}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={invite} noValidate className="flex flex-col gap-1.5">
        <Label htmlFor="invite-phone">Invite by mobile number</Label>
        <div className="flex gap-2">
          <PhoneInput
            id="invite-phone"
            value={phone}
            onValueChange={(v) => {
              setPhone(v);
              setInviteError(null);
            }}
            autoComplete="off"
            aria-invalid={!!inviteError}
            aria-describedby={inviteError ? "invite-error" : undefined}
          />
          <Button type="submit" disabled={pending || !phone}>
            Invite
          </Button>
        </div>
        {inviteError && (
          <p id="invite-error" role="alert" className="text-sm text-destructive">
            {inviteError}
          </p>
        )}
      </form>

      {shared && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => setConfirm({ kind: "leave" })}
        >
          Leave household
        </Button>
      )}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <DialogContent>
          {confirm?.kind === "accept" && (
            <>
              <DialogHeader>
                <DialogTitle>Join {confirm.fromName}&apos;s household?</DialogTitle>
                <DialogDescription>
                  Your pantry, cart and breakfast history will be combined with theirs. If you both have a plan for
                  tomorrow, theirs is kept. Your ratings stay yours.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  disabled={pending}
                  onClick={() => act(() => respondToInvite(confirm.id, true), () => setConfirm(null))}
                >
                  {pending ? "Joining…" : "Join household"}
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>
                  Not now
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm?.kind === "leave" && (
            <>
              <DialogHeader>
                <DialogTitle>Leave this household?</DialogTitle>
                <DialogDescription>
                  You&apos;ll keep your own copy of the pantry, cart, tomorrow&apos;s plan and breakfast history, and
                  your ratings go with you. To rejoin, someone will need to invite you again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => act(leaveHousehold, () => setConfirm(null))}
                >
                  {pending ? "Leaving…" : "Leave household"}
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>
                  Stay
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
