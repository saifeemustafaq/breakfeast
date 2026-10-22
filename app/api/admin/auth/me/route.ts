import { ok, route } from "@/lib/api/http";
import { reauthValidUntil, requireAdmin } from "@/lib/auth/guards";

export const GET = route(async ({ ctx }) => {
  const { admin, session } = await requireAdmin(ctx);
  return ok({
    admin: { id: admin._id.toHexString(), adminId: admin.adminId },
    reauthValidUntil: reauthValidUntil(session)?.toISOString() ?? null,
  });
});
