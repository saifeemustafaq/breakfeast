import { ok, route } from "@/lib/api/http";
import { signInUser } from "@/lib/auth/user-session";

export const POST = route(async ({ body, ctx }) => ok(await signInUser(body, ctx)));
