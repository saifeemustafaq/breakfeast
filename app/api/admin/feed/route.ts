import { ok, queryObject, route } from "@/lib/api/http";
import { feed } from "@/lib/admin/monitoring";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route(async ({ ctx, query }) => {
  await requireAdmin(ctx);
  return ok(await feed(queryObject(query)));
});
