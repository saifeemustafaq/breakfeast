import { ok, route } from "@/lib/api/http";
import { authConfig } from "@/lib/auth/config";
import { ingestActivity } from "@/lib/monitoring/activity";

export const POST = route(async ({ body, ctx }) => ok(await ingestActivity(body, ctx), 202), {
  maxBytes: authConfig.activity.maxBytes,
});
