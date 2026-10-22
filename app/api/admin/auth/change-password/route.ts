import { noContent, route } from "@/lib/api/http";
import { changeAdminPassword } from "@/lib/admin/auth";
import { requireAdmin } from "@/lib/auth/guards";

export const POST = route(async ({ body, ctx }) => {
  await changeAdminPassword(await requireAdmin(ctx), body);
  return noContent();
});
