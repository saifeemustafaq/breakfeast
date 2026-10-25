"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Sticks to the top of the scrolling area so long lists stay searchable. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-5 -my-2 bg-background/95 px-5 py-2 backdrop-blur">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onChange("");
          }}
          className="h-11 rounded-xl bg-card pr-11 pl-9 text-base md:text-base [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
            onClick={() => onChange("")}
          >
            <XIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
