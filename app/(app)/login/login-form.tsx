"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon, ShieldAlertIcon } from "lucide-react";
import { collectDevice, gpsWithin, requestGps } from "@/components/activity/device";
import { clearActivity } from "@/components/activity/logger";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ClientApiError } from "@/lib/api-client";
import { SESSION_END_MESSAGES, type SessionEndReason } from "@/lib/auth/errors";
import { safeReturnPath } from "@/lib/return-path";
import { SEC } from "@/lib/time";

const GPS_SIGN_IN_WAIT_MS = 1.5 * SEC;

const isReason = (r: string | null): r is SessionEndReason => !!r && r in SESSION_END_MESSAGES;

export function LoginForm() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const notice = isReason(reason) ? SESSION_END_MESSAGES[reason] : null;
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // Ask for location as the page opens, so the prompt is usually answered before Sign in.
  useEffect(() => void requestGps(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      const device = await collectDevice(await gpsWithin(GPS_SIGN_IN_WAIT_MS));
      await apiFetch("/api/auth/login", { body: { loginId, password, device } });
      clearActivity();
      window.location.replace(safeReturnPath(params.get("next"), "/"));
    } catch (err) {
      setPending(false);
      if (err instanceof ClientApiError) {
        if (err.code === "VALIDATION_FAILED") setFields(err.fields);
        else if (err.code === "RATE_LIMITED" && err.retryAfterSec) {
          const minutes = Math.ceil(err.retryAfterSec / 60);
          setError(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
        } else setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {notice && !error && (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="loginId">Login ID (mobile number)</Label>
        <PhoneInput
          id="loginId"
          name="loginId"
          value={loginId}
          onValueChange={setLoginId}
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!fields.loginId}
          aria-describedby={fields.loginId ? "loginId-error" : undefined}
          className="h-12 text-base"
        />
        {fields.loginId && (
          <p id="loginId-error" className="text-sm text-destructive">
            {fields.loginId}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fields.password}
            aria-describedby={fields.password ? "password-error" : undefined}
            className="h-12 pr-12 text-base"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {showPassword ? (
              <EyeOffIcon className="size-5" aria-hidden />
            ) : (
              <EyeIcon className="size-5" aria-hidden />
            )}
          </button>
        </div>
        {fields.password && (
          <p id="password-error" className="text-sm text-destructive">
            {fields.password}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Forgot your password? Contact your administrator.
      </p>
      <p className="flex items-start justify-center gap-2 text-center text-xs text-muted-foreground">
        <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        Access to this account is monitored, including device, location and activity.
      </p>
    </form>
  );
}
