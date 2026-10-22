import { json, queryObject, route } from "@/lib/api/http";
import { listAlerts } from "@/lib/admin/monitoring";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route(async ({ ctx, query }) => {
  await requireAdmin(ctx);
  return json(await listAlerts(queryObject(query)));
});
