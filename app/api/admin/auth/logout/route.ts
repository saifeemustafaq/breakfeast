import { noContent, route } from "@/lib/api/http";
import { logoutAdmin } from "@/lib/admin/auth";
import { requireAdmin } from "@/lib/auth/guards";

export const POST = route(async ({ ctx }) => {
  await logoutAdmin(await requireAdmin(ctx));
  return noContent();
});
