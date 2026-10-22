import "server-only";
import { objectId, ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/guards";
import { changeState } from "./users";

export const stateRoute = (kind: Parameters<typeof changeState>[1]) =>
  route<{ id: string }>(async ({ ctx, params, body }) => {
    const auth = await requireAdmin(ctx);
    return ok(await changeState(objectId(params.id, "That user"), kind, body, auth));
  });
