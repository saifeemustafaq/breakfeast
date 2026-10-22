"use client";

import { useState, useTransition } from "react";
import { rateBreakfast } from "@/app/actions";
import { toast } from "@/components/activity/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { failureMessage, unwrap } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const QUESTIONS = [
  { key: "taste", label: "Taste", low: "Didn't like it", high: "Loved it" },
  {
    key: "feel",
    label: "How she felt afterward",
    low: "Sluggish or hungry soon",
    high: "Energized and full",
  },
  { key: "again", label: "Want it again?", low: "Never again", high: "Every week" },
] as const;

type Key = (typeof QUESTIONS)[number]["key"];

export function RatingForm({ historyId, onDone }: { historyId: string; onDone: () => void }) {
  const [scores, setScores] = useState<Partial<Record<Key, number>>>({});
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const complete = QUESTIONS.every((q) => scores[q.key]);

  function save() {
    if (!complete) return;
    const taste = scores.taste;
    const feel = scores.feel;
    const again = scores.again;
    if (taste === undefined || feel === undefined || again === undefined) return;
    startTransition(async () => {
      try {
        await unwrap(
          rateBreakfast(historyId, {
            taste,
            feel,
            again,
            note: note.trim() || undefined,
          }),
        );
        toast.success("Rating saved");
        onDone();
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't save the rating. Try again."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {QUESTIONS.map((q) => (
        <div key={q.key} className="flex flex-col gap-2">
          <p className="text-sm font-medium">{q.label}</p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                variant={scores[q.key] === n ? "default" : "outline"}
                className={cn("h-11 text-base")}
                aria-pressed={scores[q.key] === n}
                onClick={() => setScores((s) => ({ ...s, [q.key]: n }))}
              >
                {n}
              </Button>
            ))}
          </div>
          <div className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span>1 · {q.low}</span>
            <span className="text-right">5 · {q.high}</span>
          </div>
        </div>
      ))}
      <Textarea
        placeholder='Notes, e.g. "less thick", "smaller serving", "good on workout mornings"'
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="ghost" className="h-11 flex-1" onClick={onDone}>
          Skip
        </Button>
        <Button className="h-11 flex-1" disabled={!complete || pending} onClick={save}>
          {pending ? "Saving…" : "Save rating"}
        </Button>
      </div>
    </div>
  );
}
