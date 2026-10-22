/**
 * Admin bootstrap, recovery and setup. Run through npm scripts, e.g.
 *   npm run db:init
 *   npm run admin:create -- <adminId> [--stdin | --generate]
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { authConfig } from "../lib/auth/config";
import { normalizeAdminId } from "../lib/auth/identifiers";
import { checkAdminPassword, generateAdminPassword, hashPassword } from "../lib/auth/passwords";
import { COLLECTIONS, createIndexes, type AdminDoc, type AuditDoc, type SessionDoc } from "../lib/schema";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

class CliError extends Error {}

const APP_DATA = [COLLECTIONS.pantry, COLLECTIONS.cart, COLLECTIONS.upcoming, COLLECTIONS.history, COLLECTIONS.ratings];

async function connect(): Promise<{ client: MongoClient; db: Db }> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new CliError("MONGODB_URI is not set. Add it to .env.local or the environment.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
  } catch {
    await client.close().catch(() => {});
    throw new CliError("Could not reach MongoDB within 10 s. Is the cluster paused or the URI wrong?");
  }
  return { client, db: client.db(process.env.MONGODB_DB ?? "breakfeast") };
}

async function audit(db: Db, action: string, admin: AdminDoc | null, changes: AuditDoc["changes"] = {}) {
  const at = new Date();
  await db.collection<AuditDoc>(COLLECTIONS.audit).insertOne({
    at,
    requestId: `cli-${Date.now()}`,
    actorType: "cli",
    actorId: null,
    actorLabel: "cli",
    action,
    targetType: admin ? "admin" : null,
    targetId: admin?._id ?? null,
    targetLabel: admin?.adminId ?? null,
    result: "success",
    changes,
    ip: "",
    expiresAt: new Date(at.getTime() + authConfig.retention.auditMs),
  });
}

function hiddenPrompt(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new CliError("No terminal for a hidden prompt. Use --stdin or --generate."));
      return;
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

function readStdinLine(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    let done = false;
    rl.once("line", (line) => {
      done = true;
      rl.close();
      resolve(line.replace(/\r$/, ""));
    });
    rl.once("close", () => {
      if (!done) resolve("");
    });
  });
}

async function obtainPassword(flags: Set<string>): Promise<{ password: string; generated: boolean }> {
  if (flags.has("--generate")) return { password: generateAdminPassword(12), generated: true };
  const password = flags.has("--stdin") ? await readStdinLine() : await hiddenPrompt("New admin password: ");
  const problem = checkAdminPassword(password);
  if (problem) throw new CliError(problem);
  if (!flags.has("--stdin")) {
    const again = await hiddenPrompt("Repeat the password: ");
    if (again !== password) throw new CliError("The passwords did not match.");
  }
  return { password, generated: false };
}

function adminIdArg(raw: string | undefined) {
  const id = normalizeAdminId(raw ?? "");
  if (!id.ok) throw new CliError(raw ? id.error : "Give an Admin ID, e.g. npm run admin:create -- alex");
  return id.value;
}

async function revokeAdminSessions(db: Db, adminId: ObjectId, reason: SessionDoc["revokeReason"]) {
  await db
    .collection<SessionDoc>(COLLECTIONS.adminSessions)
    .updateMany(
      { principalId: adminId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedBy: "cli", revokeReason: reason } },
    );
}

const commands: Record<string, (db: Db, args: string[], flags: Set<string>) => Promise<void>> = {
  async "db:init"(db) {
    const legacy = await db.collection(COLLECTIONS.pantry).countDocuments({ householdId: { $exists: false } });
    const legacyUpcoming = await db.collection(COLLECTIONS.upcoming).countDocuments({ householdId: { $exists: false } });
    if (legacy || legacyUpcoming) {
      throw new CliError(
        "Found breakfast data from before accounts existed. Run `npm run db:reset-app-data -- --yes` to drop it, then rerun db:init.",
      );
    }
    await createIndexes(db);
    console.log("Indexes are in place.");
  },

  async "db:reset-app-data"(db, _args, flags) {
    if (!flags.has("--yes")) {
      throw new CliError(`This deletes ${APP_DATA.join(", ")} for every household. Rerun with --yes to confirm.`);
    }
    for (const name of APP_DATA) {
      const { deletedCount } = await db.collection(name).deleteMany({});
      console.log(`${name}: deleted ${deletedCount}`);
    }
    for (const name of APP_DATA) {
      await db.collection(name).dropIndexes().catch(() => {});
    }
    await createIndexes(db);
    console.log("Breakfast data cleared and indexes recreated.");
  },

  async "admin:create"(db, args, flags) {
    const adminId = adminIdArg(args[0]);
    const admins = db.collection<AdminDoc>(COLLECTIONS.admins);
    if (await admins.findOne({ adminId })) throw new CliError(`Admin "${adminId}" already exists.`);
    const { password, generated } = await obtainPassword(flags);
    const now = new Date();
    const admin: AdminDoc = {
      _id: new ObjectId(),
      adminId,
      passwordHash: await hashPassword(password),
      status: "active",
      authVersion: 1,
      createdAt: now,
      updatedAt: now,
      passwordUpdatedAt: now,
      lastLoginAt: null,
    };
    await createIndexes(db);
    await admins.insertOne(admin);
    await audit(db, "admin.created", admin);
    console.log(`Created admin "${adminId}".`);
    if (generated) console.log(`Password (shown once): ${password}`);
  },

  async "admin:reset-password"(db, args, flags) {
    const adminId = adminIdArg(args[0]);
    const admins = db.collection<AdminDoc>(COLLECTIONS.admins);
    const admin = await admins.findOne({ adminId });
    if (!admin) throw new CliError(`No admin "${adminId}". Check the spelling or run admin:list.`);
    const { password, generated } = await obtainPassword(flags);
    const now = new Date();
    await admins.updateOne(
      { _id: admin._id },
      { $set: { passwordHash: await hashPassword(password), passwordUpdatedAt: now, updatedAt: now }, $inc: { authVersion: 1 } },
    );
    await revokeAdminSessions(db, admin._id, "password_changed");
    await db.collection(COLLECTIONS.authAttempts).deleteMany({ bucket: `id:admin:${adminId}` });
    await audit(db, "admin.password_reset", admin);
    console.log(`Password reset for "${adminId}". All of their sessions were signed out.`);
    if (generated) console.log(`Password (shown once): ${password}`);
  },

  async "admin:list"(db) {
    const admins = await db.collection<AdminDoc>(COLLECTIONS.admins).find().sort({ adminId: 1 }).toArray();
    if (!admins.length) {
      console.log("No admins yet. Create one with: npm run admin:create -- <adminId>");
      return;
    }
    console.table(
      admins.map((a) => ({
        "Admin ID": a.adminId,
        Status: a.status,
        "Last login": a.lastLoginAt ? a.lastLoginAt.toISOString() : "never",
      })),
    );
  },

  async "admin:disable"(db, args) {
    const adminId = adminIdArg(args[0]);
    const admins = db.collection<AdminDoc>(COLLECTIONS.admins);
    const admin = await admins.findOneAndUpdate(
      { adminId },
      { $set: { status: "disabled", updatedAt: new Date() }, $inc: { authVersion: 1 } },
    );
    if (!admin) throw new CliError(`No admin "${adminId}".`);
    await revokeAdminSessions(db, admin._id, "admin");
    await audit(db, "admin.disabled", admin, { status: { from: admin.status, to: "disabled" } });
    console.log(`Disabled "${adminId}" and signed out their sessions.`);
  },

  async "admin:enable"(db, args) {
    const adminId = adminIdArg(args[0]);
    const admins = db.collection<AdminDoc>(COLLECTIONS.admins);
    const admin = await admins.findOneAndUpdate({ adminId }, { $set: { status: "active", updatedAt: new Date() } });
    if (!admin) throw new CliError(`No admin "${adminId}".`);
    await audit(db, "admin.enabled", admin, { status: { from: admin.status, to: "active" } });
    console.log(`Enabled "${adminId}".`);
  },
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const args = rest.filter((a) => !a.startsWith("--"));
  const run = command ? commands[command] : undefined;
  if (!run) {
    console.log(`Usage: tsx scripts/admin-cli.ts <command>\n\nCommands:\n  ${Object.keys(commands).join("\n  ")}`);
    process.exit(command ? 1 : 0);
  }
  const { client, db } = await connect();
  try {
    await run(db, args, flags);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof CliError ? error.message : error);
  process.exit(1);
});
