"use client";

import { useId, useState, useTransition } from "react";
import { logBreakfast } from "@/app/actions";
import { saveRecipeNote } from "@/app/notes-actions";
import { toast } from "@/components/activity/toast";
import { ScoreRows, completeRating, type Scores } from "@/components/rating-form";
import { NOTE_MAX, NOTE_PLACEHOLDER } from "@/components/recipe-note";
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
import { Textarea } from "@/components/ui/textarea";
import { failureMessage, unwrap } from "@/lib/action-result";
import type { Recipe } from "@/lib/recipes";
import { DAY } from "@/lib/time";
import { cn } from "@/lib/utils";

const WHEN = [
  { daysAgo: 0, label: "Today" },
  { daysAgo: 1, label: "Yesterday" },
  { daysAgo: 2, label: "2 days ago" },
  { daysAgo: 3, label: "3 days ago" },
];

export type LoggedBreakfast = { recipeId: number; madeAt: string; note: string | null };

/**
 * "I made this recently" from a suggestion: logs it (so it drops down the list), with an
 * optional rating and the recipe's note. `recipe: null` keeps it closed.
 */
export function AlreadyMadeDialog({
  recipe,
  note,
  onClose,
  onLogged,
}: {
  recipe: Recipe | null;
  note?: string;
  onClose: () => void;
  onLogged: (logged: LoggedBreakfast) => void;
}) {
  return (
    <Dialog open={recipe !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {recipe && <LogForm key={recipe.id} recipe={recipe} note={note ?? ""} onCancel={onClose} onLogged={onLogged} />}
      </DialogContent>
    </Dialog>
  );
}

function LogForm({
  recipe,
  note,
  onCancel,
  onLogged,
}: {
  recipe: Recipe;
  note: string;
  onCancel: () => void;
  onLogged: (logged: LoggedBreakfast) => void;
}) {
  const id = useId();
  const [daysAgo, setDaysAgo] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [draft, setDraft] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rating = completeRating(scores);
  const partial = !rating && Object.keys(scores).length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (partial) return;
    setError(null);
    startTransition(async () => {
      try {
        await unwrap(logBreakfast({ recipeId: recipe.id, daysAgo, ...(rating ? { rating } : {}) }));
      } catch (err) {
        setError(failureMessage(err, "Couldn't save. Check your connection."));
        return;
      }
      let saved: string | null = null;
      if (draft.trim() !== note.trim()) {
        try {
          await unwrap(saveRecipeNote(recipe.id, draft));
          saved = draft.trim();
        } catch (err) {
          toast.error(failureMessage(err, "Logged it, but couldn't save the note."));
        }
      }
      toast.success(rating ? "Logged and rated" : "Logged");
      onLogged({ recipeId: recipe.id, madeAt: new Date(Date.now() - daysAgo * DAY).toISOString(), note: saved });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>You made {recipe.name.toLowerCase()}</DialogTitle>
        <DialogDescription>
          It&apos;ll move to the back of the suggestions. Rating and a note are optional.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="When did you make it?">
        <p className="text-sm font-medium">When?</p>
        <div className="flex flex-wrap gap-2">
          {WHEN.map((w) => (
            <button
              key={w.daysAgo}
              type="button"
              role="radio"
              aria-checked={w.daysAgo === daysAgo}
              onClick={() => setDaysAgo(w.daysAgo)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                w.daysAgo === daysAgo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <p className="-mb-2 text-sm font-medium">
          How was it? <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <ScoreRows scores={scores} onChange={setScores} />
        {partial && (
          <p role="status" className="text-xs text-muted-foreground">
            Answer all three, or{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setScores({})}>
              clear the rating
            </button>
            .
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>Note for next time</Label>
        <Textarea
          id={`${id}-note`}
          maxLength={NOTE_MAX}
          placeholder={NOTE_PLACEHOLDER}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">One note per recipe. Your household sees it too.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" size="lg" className="h-12 text-base" disabled={pending || partial}>
          {pending ? "Saving…" : "Save and show the next one"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}
