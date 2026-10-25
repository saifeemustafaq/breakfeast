"use client";

import { useId, useState, useTransition } from "react";
import { PencilIcon, StickyNoteIcon, Trash2Icon } from "lucide-react";
import { deleteRecipeNote, saveRecipeNote } from "@/app/notes-actions";
import { toast } from "@/components/activity/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { failureMessage, unwrap } from "@/lib/action-result";
import type { RecipeNote } from "@/lib/types";
import { cn } from "@/lib/utils";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const NOTE_MAX = 1000;
export const NOTE_PLACEHOLDER = 'e.g. "Too tangy, added a little honey" or "Half the chia next time"';

/**
 * The household's one note for a recipe: read it, edit it, delete it (with undo).
 * Keeps its own copy; `onChange` lets a parent screen stay in sync.
 */
export function RecipeNoteCard({
  recipeId,
  note: initial,
  onChange,
  className,
}: {
  recipeId: number;
  note?: RecipeNote;
  onChange?: (note: RecipeNote | undefined) => void;
  className?: string;
}) {
  const id = useId();
  const [note, setLocal] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(next: RecipeNote | undefined) {
    setLocal(next);
    onChange?.(next);
  }

  function save(text: string) {
    const previous = note;
    const body = text.trim();
    set(body ? { text: body, updatedAt: new Date().toISOString() } : undefined);
    setDraft(null);
    startTransition(async () => {
      try {
        await unwrap(saveRecipeNote(recipeId, body));
      } catch (err) {
        set(previous);
        setDraft(text);
        toast.error(failureMessage(err, "Couldn't save the note. Try again."));
      }
    });
  }

  function remove() {
    const previous = note;
    if (!previous) return;
    set(undefined);
    startTransition(async () => {
      try {
        await unwrap(deleteRecipeNote(recipeId));
        toast("Note deleted", { action: { label: "Undo", onClick: () => save(previous.text) } });
      } catch (err) {
        set(previous);
        toast.error(failureMessage(err, "Couldn't delete the note. Try again."));
      }
    });
  }

  if (draft !== null) {
    return (
      <form
        className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3", className)}
        onSubmit={(e) => {
          e.preventDefault();
          save(draft);
        }}
      >
        <Label htmlFor={`${id}-note`}>Note for next time</Label>
        <Textarea
          id={`${id}-note`}
          autoFocus
          maxLength={NOTE_MAX}
          placeholder={NOTE_PLACEHOLDER}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Everyone in your household sees this note.</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-11 flex-1" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button type="submit" className="h-11 flex-1" disabled={pending || draft.trim() === (note?.text ?? "")}>
            Save note
          </Button>
        </div>
      </form>
    );
  }

  if (!note) {
    return (
      <Button
        variant="outline"
        className={cn("h-11 justify-start border-dashed text-muted-foreground", className)}
        onClick={() => setDraft("")}
      >
        <StickyNoteIcon />
        Add a note for next time
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border border-warning/30 bg-warning/10 p-3", className)}>
      <div className="flex items-center gap-2">
        <StickyNoteIcon className="size-4 shrink-0 text-warning" aria-hidden />
        <p className="flex-1 text-xs font-semibold tracking-wide text-warning uppercase">
          Your note
          <span className="ml-2 font-normal tracking-normal text-muted-foreground normal-case">
            {DATE.format(new Date(note.updatedAt))}
          </span>
        </p>
        <Button variant="ghost" size="icon" aria-label="Edit note" onClick={() => setDraft(note.text)}>
          <PencilIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Delete note" disabled={pending} onClick={remove}>
          <Trash2Icon />
        </Button>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.text}</p>
    </div>
  );
}
