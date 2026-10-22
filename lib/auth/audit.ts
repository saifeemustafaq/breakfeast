import "server-only";
import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import type { AuditDoc } from "@/lib/schema";
import { authConfig } from "./config";

export type AuditActor =
  | { type: "admin"; id: ObjectId | null; label: string }
  | { type: "cli" }
  | { type: "system" };

export type AuditInput = {
  actor: AuditActor;
  action: string;
  target?: { type: "user" | "admin"; id: ObjectId; label: string } | null;
  result?: "success" | "failure";
  changes?: AuditDoc["changes"];
  ip?: string;
  requestId?: string;
};

/** Awaited before responding so the record exists whenever the action did. */
export async function writeAudit(input: AuditInput) {
  const c = await collections();
  const at = new Date();
  const actor = input.actor;
  await c.audit.insertOne({
    at,
    requestId: input.requestId ?? "",
    actorType: actor.type,
    actorId: actor.type === "admin" ? actor.id : null,
    actorLabel: actor.type === "admin" ? actor.label : actor.type,
    action: input.action,
    targetType: input.target?.type ?? null,
    targetId: input.target?.id ?? null,
    targetLabel: input.target?.label ?? null,
    result: input.result ?? "success",
    changes: input.changes ?? {},
    ip: input.ip ?? "",
    expiresAt: new Date(at.getTime() + authConfig.retention.auditMs),
  });
}
