import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guards";

export const GET = route(async ({ ctx }) => {
  const { user } = await requireUser(ctx);
  return ok({ user: { id: user._id.toHexString(), name: user.name, loginId: user.loginId } });
});
