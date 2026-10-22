import { objectId, ok, route } from "@/lib/api/http";
import { removeFromHousehold } from "@/lib/admin/households";
import { requireAdmin } from "@/lib/auth/guards";

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  const auth = await requireAdmin(ctx);
  return ok(await removeFromHousehold(objectId(params.id, "That user"), auth));
});
