import { objectId, ok, route } from "@/lib/api/http";
import { resetUserPassword } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

export const POST = route<{ id: string }>(async ({ ctx, params, body }) => {
  const auth = await requireAdmin(ctx);
  return ok(await resetUserPassword(objectId(params.id, "That user"), body, auth));
});
