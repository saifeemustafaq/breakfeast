import { ok, route } from "@/lib/api/http";
import { loginAdmin } from "@/lib/auth/login";

export const POST = route(async ({ body, ctx }) => {
  const admin = await loginAdmin(body, ctx);
  return ok({ admin: { id: admin._id.toHexString(), adminId: admin.adminId } });
});
