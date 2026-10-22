import { toast as sonner } from "sonner";
import { track } from "./logger";

type Message = Parameters<typeof sonner>[0];
type Options = Parameters<typeof sonner>[1];
type Variant = "default" | "success" | "error" | "info" | "warning";

const text = (m: Message) => (typeof m === "string" || typeof m === "number" ? String(m) : "(custom content)");

function shown(variant: Variant, message: Message) {
  track("notification", text(message).slice(0, 120), { variant });
}

/** sonner's `toast`, plus an activity event for each notification shown. Use this in the user app. */
export const toast = Object.assign(
  (message: Message, options?: Options) => {
    shown("default", message);
    return sonner(message, options);
  },
  {
    success: (message: Message, options?: Options) => (shown("success", message), sonner.success(message, options)),
    error: (message: Message, options?: Options) => (shown("error", message), sonner.error(message, options)),
    info: (message: Message, options?: Options) => (shown("info", message), sonner.info(message, options)),
    warning: (message: Message, options?: Options) => (shown("warning", message), sonner.warning(message, options)),
    dismiss: sonner.dismiss,
  },
);
