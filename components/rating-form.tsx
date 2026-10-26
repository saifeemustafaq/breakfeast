"use client";

import { useId, useState, useTransition } from "react";
import { rateBreakfast } from "@/app/actions";
import { saveRecipeNote } from "@/app/notes-actions";
import { toast } from "@/components/activity/toast";
import { NOTE_MAX, NOTE_PLACEHOLDER } from "@/components/recipe-note";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { failureMessage, unwrap } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const QUESTIONS = [
  { key: "taste", label: "Taste", low: "Didn't like it", high: "Loved it" },
  {
    key: "feel",
    label: "How you felt afterward",
    low: "Sluggish or hungry soon",
    high: "Energized and full",
  },
  { key: "again", label: "Want it again?", low: "Never again", high: "Every week" },
] as const;

type Key = (typeof QUESTIONS)[number]["key"];
export type Scores = Partial<Record<Key, number>>;
export type Rating = Record<Key, number>;

/** All three answered, or null. */
export function completeRating(scores: Scores): Rating | null {
  const { taste, feel, again } = scores;
  return taste && feel && again ? { taste, feel, again } : null;
}

export function ScoreRows({ scores, onChange }: { scores: Scores; onChange: (s: Scores) => void }) {
  return (
    <>
      {QUESTIONS.map((q) => (
        <div key={q.key} className="flex flex-col gap-2">
          <p className="text-sm font-medium">{q.label}</p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant={scores[q.key] === n ? "default" : "outline"}
                className={cn("h-11 text-base")}
                aria-pressed={scores[q.key] === n}
                onClick={() => onChange({ ...scores, [q.key]: n })}
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
    </>
  );
}

/** Rates one breakfast. The text box edits the recipe's note, so it's there next time. */
export function RatingForm({
  historyId,
  recipeId,
  note = "",
  onNoteSaved,
  onDone,
}: {
  historyId: string;
  recipeId: number;
  note?: string;
  onNoteSaved?: (text: string) => void;
  onDone: () => void;
}) {
  const id = useId();
  const [scores, setScores] = useState<Scores>({});
  const [draft, setDraft] = useState(note);
  const [pending, startTransition] = useTransition();
  const rating = completeRating(scores);
  const noteChanged = draft.trim() !== note.trim();

  async function saveNote() {
    if (!noteChanged) return;
    await unwrap(saveRecipeNote(recipeId, draft));
    onNoteSaved?.(draft.trim());
  }

  function finish(withRating: boolean) {
    if (withRating && !rating) return;
    startTransition(async () => {
      try {
        if (withRating && rating) await unwrap(rateBreakfast(historyId, rating));
        await saveNote();
        if (withRating) toast.success("Rating saved");
        else if (noteChanged) toast.success("Note saved");
        onDone();
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't save. Try again."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <ScoreRows scores={scores} onChange={setScores} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>Note for next time</Label>
        <Textarea
          id={`${id}-note`}
          maxLength={NOTE_MAX}
          placeholder={NOTE_PLACEHOLDER}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          One note per recipe, shown whenever it comes up. Your household sees it too.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-11 flex-1" disabled={pending} onClick={() => finish(false)}>
          {noteChanged ? "Save note only" : "Skip"}
        </Button>
        <Button className="h-11 flex-1" disabled={!rating || pending} onClick={() => finish(true)}>
          {pending ? "Saving…" : "Save rating"}
        </Button>
      </div>
    </div>
  );
}
