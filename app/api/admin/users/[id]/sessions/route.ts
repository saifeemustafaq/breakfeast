import { json, objectId, ok, route } from "@/lib/api/http";
import { listSessions, revokeAllSessions } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

type Params = { id: string };

export const GET = route<Params>(async ({ ctx, params, query }) => {
  await requireAdmin(ctx);
  return json(await listSessions(objectId(params.id, "That user"), query.get("cursor")));
});

export const DELETE = route<Params>(async ({ ctx, params }) => {
  const auth = await requireAdmin(ctx);
  return ok(await revokeAllSessions(objectId(params.id, "That user"), auth));
});
