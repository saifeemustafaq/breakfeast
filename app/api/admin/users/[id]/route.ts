import { objectId, ok, route } from "@/lib/api/http";
import { detail, loadUser, updateUser } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

type Params = { id: string };

export const GET = route<Params>(async ({ ctx, params }) => {
  await requireAdmin(ctx);
  return ok(await detail(await loadUser(objectId(params.id, "That user"))));
});

export const PATCH = route<Params>(async ({ ctx, params, body }) => {
  const auth = await requireAdmin(ctx);
  return ok(await updateUser(objectId(params.id, "That user"), body, auth));
});
