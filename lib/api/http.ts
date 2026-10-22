import "server-only";
import { ObjectId } from "mongodb";
import type { z } from "zod";
import { ApiError, STORAGE_MESSAGE, validationError } from "@/lib/auth/errors";
import { assertJson, assertSameOrigin, requestContext, type RequestContext } from "@/lib/auth/request";
import { isDuplicateKey, isStorageError } from "@/lib/db";

const NO_STORE = { "Cache-Control": "no-store" };
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

export const ok = (data: unknown, status = 200) => Response.json({ data }, { status, headers: NO_STORE });
export const noContent = () => new Response(null, { status: 204, headers: NO_STORE });
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = { ...NO_STORE };
    if (error.extra.retryAfterSec) headers["Retry-After"] = String(error.extra.retryAfterSec);
    return Response.json(error.toBody(), { status: error.status, headers });
  }
  if (isStorageError(error)) {
    const e = new ApiError("STORAGE_UNAVAILABLE", STORAGE_MESSAGE);
    return Response.json(e.toBody(), { status: e.status, headers: NO_STORE });
  }
  if (isDuplicateKey(error)) {
    const e = new ApiError("CONFLICT", "That already exists. Refresh and try again.");
    return Response.json(e.toBody(), { status: e.status, headers: NO_STORE });
  }
  console.error(`[${requestId}] Unhandled API error`, error);
  return Response.json(
    { error: { code: "INTERNAL", message: `Something went wrong. Reference ${requestId}.` } },
    { status: 500, headers: NO_STORE },
  );
}

type Handler<P> = (args: {
  req: Request;
  ctx: RequestContext;
  params: P;
  body: Record<string, unknown>;
  query: URLSearchParams;
}) => Promise<Response>;

/** Wraps a route handler: CSRF and content-type checks, body limits, and error mapping. */
export function route<P = Record<string, never>>(handler: Handler<P>, opts: { maxBytes?: number } = {}) {
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    const ctx = requestContext(req.headers);
    try {
      if (MUTATING.has(req.method)) assertSameOrigin(req.headers);
      let body: Record<string, unknown> = {};
      if (WITH_BODY.has(req.method)) {
        assertJson(req.headers);
        const declared = Number(req.headers.get("content-length") ?? 0);
        if (declared > maxBytes) throw tooLarge();
        const text = await req.text();
        if (Buffer.byteLength(text, "utf8") > maxBytes) throw tooLarge();
        if (text.trim()) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new ApiError("VALIDATION_FAILED", "The request body is not valid JSON.");
          }
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new ApiError("VALIDATION_FAILED", "The request body must be a JSON object.");
          }
          body = parsed as Record<string, unknown>;
        }
      }
      const params = (await routeCtx?.params) ?? ({} as P);
      return await handler({ req, ctx, params, body, query: new URL(req.url).searchParams });
    } catch (error) {
      return errorResponse(error, ctx.requestId);
    }
  };
}

const tooLarge = () => new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large.");

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_";
    fields[key] ??= issue.message;
  }
  throw validationError(fields);
}

export function objectId(value: unknown, what = "That record") {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new ApiError("NOT_FOUND", `${what} was not found.`);
  }
  return new ObjectId(value);
}

export function queryObject(query: URLSearchParams) {
  return Object.fromEntries([...query.entries()].filter(([, v]) => v !== ""));
}
