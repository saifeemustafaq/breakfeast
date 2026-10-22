import { json, queryObject, route } from "@/lib/api/http";
import { listAudit } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route(async ({ ctx, query }) => {
  await requireAdmin(ctx);
  return json(await listAudit(queryObject(query)));
});
