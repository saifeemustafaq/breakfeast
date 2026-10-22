import { noContent, route } from "@/lib/api/http";
import { recordAppOpen } from "@/lib/auth/user-session";

export const POST = route(async ({ body, ctx }) => {
  await recordAppOpen(body, ctx);
  return noContent();
});
