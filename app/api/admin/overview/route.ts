import { ok, route } from "@/lib/api/http";
import { overview } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route(async ({ ctx }) => {
  await requireAdmin(ctx);
  return ok(await overview());
});
