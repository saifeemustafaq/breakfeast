import { json, ok, queryObject, route } from "@/lib/api/http";
import { createUser, listUsers } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guards";

export const GET = route(async ({ ctx, query }) => {
  await requireAdmin(ctx);
  return json(await listUsers(queryObject(query)));
});

export const POST = route(async ({ ctx, body }) => {
  const auth = await requireAdmin(ctx);
  return ok(await createUser(body, auth), 201);
});
