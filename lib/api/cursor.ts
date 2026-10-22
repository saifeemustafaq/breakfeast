import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { ApiError } from "@/lib/auth/errors";

type CursorValue = { t: string; id: string };

export function encodeCursor(time: Date, id: ObjectId) {
  return Buffer.from(JSON.stringify({ t: time.toISOString(), id: id.toHexString() })).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): { time: Date; id: ObjectId } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CursorValue;
    const time = new Date(value.t);
    if (Number.isNaN(time.getTime()) || !ObjectId.isValid(value.id)) throw new Error("bad cursor");
    return { time, id: new ObjectId(value.id) };
  } catch {
    throw new ApiError("VALIDATION_FAILED", "The page cursor is invalid.", { fields: { cursor: "Invalid cursor." } });
  }
}

/** Newest-first keyset condition on (field desc, _id desc), so ties are stable. */
export function beforeCursor<T>(field: string, cursor: ReturnType<typeof decodeCursor>): Filter<T> {
  if (!cursor) return {};
  return {
    $or: [{ [field]: { $lt: cursor.time } }, { [field]: cursor.time, _id: { $lt: cursor.id } }],
  } as Filter<T>;
}

/** Fetch `limit + 1` rows, then call this to split off the next cursor. */
export function paginate<T extends { _id: ObjectId }>(rows: T[], limit: number, timeOf: (row: T) => Date) {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor(timeOf(last), last._id) : null;
  return { page, nextCursor };
}
