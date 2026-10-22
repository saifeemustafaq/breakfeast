import { objectId, ok, route } from "@/lib/api/http";
import { moveUserToHousehold } from "@/lib/admin/households";
import { requireAdmin } from "@/lib/auth/guards";

export const POST = route<{ id: string }>(async ({ ctx, params, body }) => {
  const auth = await requireAdmin(ctx);
  return ok(await moveUserToHousehold(objectId(params.id, "That user"), body, auth));
});
