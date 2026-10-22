export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "SESSION_ENDED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_PAUSED"
  | "ACCOUNT_DISABLED"
  | "REAUTH_REQUIRED"
  | "CSRF_REJECTED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  SESSION_ENDED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_PAUSED: 403,
  ACCOUNT_DISABLED: 403,
  REAUTH_REQUIRED: 403,
  CSRF_REJECTED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  STORAGE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export type SessionEndReason = "revoked" | "expired" | "paused" | "disabled";

/** Shown on /login?reason= and in SESSION_ENDED responses. Isomorphic so the login form can share it. */
export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  revoked: "You were signed out by an administrator.",
  expired: "Your session expired. Sign in again.",
  paused: "Your access is paused. Contact your administrator.",
  disabled: "Your account is deactivated. Contact your administrator.",
};

export const ACCOUNT_MESSAGES = {
  paused: SESSION_END_MESSAGES.paused,
  disabled: SESSION_END_MESSAGES.disabled,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: {
      fields?: Record<string, string>;
      reason?: SessionEndReason;
      retryAfterSec?: number;
    } = {},
  ) {
    super(message);
    this.status = STATUS[code];
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.extra.fields ? { fields: this.extra.fields } : {}),
        ...(this.extra.reason ? { reason: this.extra.reason } : {}),
      },
    };
  }
}

export const validationError = (fields: Record<string, string>, message = "Check the highlighted fields.") =>
  new ApiError("VALIDATION_FAILED", message, { fields });

export const notFound = (what = "That record") => new ApiError("NOT_FOUND", `${what} was not found.`);

export const STORAGE_MESSAGE = "The database is unreachable. Try again shortly.";
