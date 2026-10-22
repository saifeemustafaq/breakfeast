import { json, objectId, route } from "@/lib/api/http";
import { listDevices } from "@/lib/admin/monitoring";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route<{ id: string }>(async ({ ctx, params, query }) => {
  await requireAdmin(ctx);
  return json(await listDevices(objectId(params.id, "That user"), query.get("cursor")));
});
