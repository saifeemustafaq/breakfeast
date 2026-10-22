import { ok, route } from "@/lib/api/http";
import { reauthAdmin } from "@/lib/admin/auth";
import { requireAdmin } from "@/lib/auth/guards";

export const POST = route(async ({ body, ctx }) => {
  return ok(await reauthAdmin(await requireAdmin(ctx), body));
});
