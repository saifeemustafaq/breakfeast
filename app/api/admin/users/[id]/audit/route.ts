import { json, objectId, queryObject, route } from "@/lib/api/http";
import { listAudit } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route<{ id: string }>(async ({ ctx, params, query }) => {
  await requireAdmin(ctx);
  return json(await listAudit(queryObject(query), objectId(params.id, "That user")));
});
