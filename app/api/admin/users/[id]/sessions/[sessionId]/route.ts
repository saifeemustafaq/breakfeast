import { objectId, ok, route } from "@/lib/api/http";
import { revokeOneSession } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

export const DELETE = route<{ id: string; sessionId: string }>(async ({ ctx, params }) => {
  const auth = await requireAdmin(ctx);
  const { revoked } = await revokeOneSession(
    objectId(params.id, "That user"),
    objectId(params.sessionId, "That session"),
    auth,
  );
  return ok({ revoked });
});
