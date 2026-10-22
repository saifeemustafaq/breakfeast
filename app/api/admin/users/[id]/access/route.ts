import { json, objectId, queryObject, route } from "@/lib/api/http";
import { listAccess } from "@/lib/admin/monitoring";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route<{ id: string }>(async ({ ctx, params, query }) => {
  await requireAdmin(ctx);
  return json(await listAccess(objectId(params.id, "That user"), queryObject(query)));
});
