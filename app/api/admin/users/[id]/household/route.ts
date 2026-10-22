import { objectId, ok, route } from "@/lib/api/http";
import { householdDetail } from "@/lib/admin/households";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route<{ id: string }>(async ({ ctx, params }) => {
  await requireAdmin(ctx);
  return ok(await householdDetail(objectId(params.id, "That user")));
});
