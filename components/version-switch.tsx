"use client";

import { UserIcon, UsersIcon } from "lucide-react";
import type { VersionChoice } from "@/lib/types";
import type { ChoiceOption } from "@/lib/versions";
import { cn } from "@/lib/utils";

/** Your version / Original / shared versions, as one row of chips. Hidden when there's only the original. */
export function VersionSwitch({
  options,
  value,
  onChange,
  className,
}: {
  options: ChoiceOption[];
  value: VersionChoice;
  onChange: (choice: VersionChoice) => void;
  className?: string;
}) {
  if (options.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Which version" className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.choice === value;
        return (
          <button
            key={o.choice}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => !on && onChange(o.choice)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:size-3.5",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {o.choice === "mine" && <UserIcon />}
            {o.choice.startsWith("user:") && <UsersIcon />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
