"use client";

import type * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (formatted: string) => void;
};

/** US mobile number field that applies "(555) 123-4567" formatting as the user types. */
export function PhoneInput({ value, onValueChange, ...props }: Props) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete={props.autoComplete ?? "tel-national"}
      placeholder={props.placeholder ?? "(555) 123-4567"}
      maxLength={14}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        // Backspacing over ")" or "-" should also remove the digit before it.
        const deletedFormatting =
          raw.length < value.length && raw.replace(/\D/g, "") === value.replace(/\D/g, "");
        onValueChange(formatPhoneInput(deletedFormatting ? raw.replace(/\D/g, "").slice(0, -1) : raw));
      }}
    />
  );
}
