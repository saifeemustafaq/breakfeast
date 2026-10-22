import { noContent, route } from "@/lib/api/http";
import { signOutUser } from "@/lib/auth/user-session";

export const POST = route(async ({ ctx }) => {
  await signOutUser(ctx);
  return noContent();
});
