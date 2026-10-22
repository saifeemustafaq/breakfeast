import type { Db, IndexDescription, ObjectId } from "mongodb";
import { authConfig } from "./auth/config";
import { DAY, SEC } from "./time";

export type AccountStatus = "active" | "paused" | "disabled";

export type AdminDoc = {
  _id: ObjectId;
  adminId: string;
  passwordHash: string;
  status: "active" | "disabled";
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
  passwordUpdatedAt: Date;
  lastLoginAt: Date | null;
};

export type UserDoc = {
  _id: ObjectId;
  name: string;
  loginId: string;
  loginIdNormalized: string;
  loginIdType: "username" | "email" | "phone";
  notes: string;
  details: Record<string, unknown>;
  status: AccountStatus;
  pauseReason: string | null;
  pausedUntil: Date | null;
  pausedAt: Date | null;
  pausedBy: string | null;
  passwordHash: string;
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
  passwordUpdatedAt: Date;
  createdBy: string;
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  householdId: ObjectId;
};

export type RevokeReason =
  | "logout"
  | "admin"
  | "password_reset"
  | "paused"
  | "deactivated"
  | "revoke_all"
  | "password_changed";

export type SessionDoc = {
  _id: ObjectId;
  tokenHash: string;
  principalId: ObjectId;
  authVersion: number;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: RevokeReason | null;
  deviceId: string | null;
  ip: string;
  userAgent: string;
  deviceLabel: string;
  reauthAt: Date | null;
};

export type AuthAttemptDoc = { _id?: ObjectId; bucket: string; at: Date; expiresAt: Date };

export type AuditDoc = {
  _id?: ObjectId;
  at: Date;
  requestId: string;
  actorType: "admin" | "cli" | "system";
  actorId: ObjectId | null;
  actorLabel: string;
  action: string;
  targetType: "user" | "admin" | null;
  targetId: ObjectId | null;
  targetLabel: string | null;
  result: "success" | "failure";
  changes: Record<string, { from: unknown; to: unknown }>;
  ip: string;
  expiresAt: Date;
};

export type HouseholdDoc = { _id: ObjectId; createdAt: Date; updatedAt: Date };

/**
 * Invites are addressed to a mobile number (E.164), not an account, so sending one
 * never reveals whether that number belongs to a user.
 */
export type HouseholdInviteDoc = {
  _id: ObjectId;
  householdId: ObjectId;
  fromUserId: ObjectId;
  toLoginId: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: Date;
  respondedAt: Date | null;
  expiresAt: Date;
};

export type PantryDoc = {
  _id?: ObjectId;
  householdId: ObjectId;
  ingredientId: string;
  inStock: boolean;
  updatedAt: Date;
};
export type CartDoc = {
  _id?: ObjectId;
  householdId: ObjectId;
  ingredientId: string;
  kind: "buy" | "cook";
  forRecipes: number[];
  addedAt: Date;
};
export type UpcomingDoc = {
  _id?: ObjectId;
  householdId: ObjectId;
  recipeId: number;
  needsPrep: boolean;
  createdAt: Date;
};
export type HistoryDoc = {
  _id?: ObjectId;
  householdId: ObjectId;
  recipeId: number;
  madeAt: Date;
  madeBy: ObjectId;
};
export type RatingDoc = {
  _id?: ObjectId;
  householdId: ObjectId;
  historyId: ObjectId;
  userId: ObjectId;
  recipeId: number;
  taste: number;
  feel: number;
  again: number;
  note?: string;
  updatedAt: Date;
};

export const ACCESS_KINDS = ["login_success", "login_failure", "logout", "app_open", "session_revoked"] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

export const FLAGS = [
  "new_device",
  "new_country",
  "far_location",
  "impossible_travel",
  "concurrent_devices",
  "session_moved",
  "failed_logins",
  "vpn_or_proxy",
  "gps_denied",
] as const;
export type Flag = (typeof FLAGS)[number];

export const ACTIVITY_TYPES = ["navigation", "click", "change", "workflow", "api", "notification", "error", "settings"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type IpGeo = {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  isp: string | null;
  org: string | null;
  asn: string | null;
  isMobile: boolean | null;
  isProxy: boolean | null;
  isHosting: boolean | null;
};

export type GpsStatus = "granted" | "denied" | "unavailable" | "timeout";
export type GpsFix = { status: GpsStatus; lat: number | null; lon: number | null; accuracyM: number | null } | null;

export type ParsedUa = {
  browser: string | null;
  browserVersion: string | null;
  engine: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: string | null;
  deviceVendor: string | null;
  deviceModel: string | null;
};

/** What the browser reports about itself (validated and clamped on the server). */
export type ClientInfo = {
  hardware: {
    cores: number | null;
    memoryGb: number | null;
    gpuVendor: string | null;
    gpuRenderer: string | null;
    maxTouchPoints: number | null;
    screenW: number | null;
    screenH: number | null;
    colorDepth: number | null;
  };
  env: {
    timezone: string | null;
    locale: string | null;
    languages: string[];
    cookiesEnabled: boolean | null;
    connection: string | null;
    standalone: boolean | null;
    referrer: string | null;
  };
  hints: { platform: string | null; platformVersion: string | null; model: string | null; architecture: string | null };
};

export type AccessEventDoc = {
  _id: ObjectId;
  at: Date;
  kind: AccessKind;
  principalType: "user";
  userId: ObjectId | null;
  loginIdAttempted: string | null;
  sessionId: ObjectId | null;
  ip: string;
  ipGeo: IpGeo | null;
  gps: GpsFix;
  deviceId: string | null;
  fingerprint: string | null;
  deviceLabel: string;
  ua: ParsedUa;
  client: ClientInfo | null;
  flags: Flag[];
  expiresAt: Date;
};

export type DeviceDoc = {
  _id: ObjectId;
  userId: ObjectId;
  deviceId: string;
  fingerprint: string | null;
  label: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastIp: string;
  lastCity: string | null;
  lastCountry: string | null;
  accessCount: number;
};

export type ActivityEventDoc = {
  _id?: ObjectId;
  userId: ObjectId;
  sessionId: ObjectId;
  deviceId: string | null;
  pageLoadId: string;
  seq: number;
  clientAt: Date;
  receivedAt: Date;
  type: ActivityType;
  name: string;
  target: string | null;
  data: Record<string, unknown> | null;
  path: string;
};

export const COLLECTIONS = {
  admins: "admins",
  users: "users",
  userSessions: "user_sessions",
  adminSessions: "admin_sessions",
  authAttempts: "auth_attempts",
  audit: "admin_audit",
  accessEvents: "access_events",
  devices: "devices",
  activityEvents: "activity_events",
  alertLog: "alert_log",
  households: "households",
  householdInvites: "household_invites",
  pantry: "pantry",
  cart: "cart",
  upcoming: "upcoming",
  history: "history",
  ratings: "ratings",
} as const;

const sessionIndexes: IndexDescription[] = [
  { key: { tokenHash: 1 }, unique: true },
  { key: { principalId: 1, lastSeenAt: -1 } },
  { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
];

export function indexSpecs(): Record<string, IndexDescription[]> {
  const activityTtlSec = Math.round(authConfig.retention.activityMs / SEC);
  return {
    [COLLECTIONS.admins]: [{ key: { adminId: 1 }, unique: true }],
    [COLLECTIONS.users]: [
      { key: { loginIdNormalized: 1 }, unique: true },
      { key: { createdAt: -1 } },
      { key: { status: 1, createdAt: -1 } },
      { key: { lastSeenAt: -1 } },
      { key: { householdId: 1 } },
    ],
    [COLLECTIONS.userSessions]: sessionIndexes,
    [COLLECTIONS.adminSessions]: sessionIndexes,
    [COLLECTIONS.authAttempts]: [
      { key: { bucket: 1, at: -1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    [COLLECTIONS.audit]: [
      { key: { at: -1 } },
      { key: { targetId: 1, at: -1 } },
      { key: { actorLabel: 1, at: -1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    [COLLECTIONS.accessEvents]: [
      { key: { userId: 1, at: -1 } },
      { key: { at: -1 } },
      { key: { "flags.0": 1, at: -1 }, partialFilterExpression: { "flags.0": { $exists: true } } },
      { key: { loginIdAttempted: 1, at: -1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    [COLLECTIONS.devices]: [
      { key: { userId: 1, deviceId: 1 }, unique: true },
      { key: { userId: 1, fingerprint: 1 } },
      { key: { userId: 1, lastSeenAt: -1 } },
    ],
    [COLLECTIONS.activityEvents]: [
      { key: { userId: 1, clientAt: -1 } },
      { key: { pageLoadId: 1, seq: 1 } },
      { key: { sessionId: 1, clientAt: -1 } },
      { key: { receivedAt: 1 }, expireAfterSeconds: activityTtlSec },
    ],
    [COLLECTIONS.alertLog]: [
      { key: { userId: 1, flag: 1, sentAt: -1 } },
      { key: { sentAt: 1 }, expireAfterSeconds: DAY / SEC },
    ],
    [COLLECTIONS.householdInvites]: [
      { key: { toLoginId: 1, status: 1, createdAt: -1 } },
      { key: { householdId: 1, status: 1, createdAt: -1 } },
    ],
    [COLLECTIONS.pantry]: [{ key: { householdId: 1, ingredientId: 1 }, unique: true }],
    [COLLECTIONS.cart]: [{ key: { householdId: 1, ingredientId: 1 }, unique: true }],
    [COLLECTIONS.upcoming]: [{ key: { householdId: 1 }, unique: true }],
    [COLLECTIONS.history]: [{ key: { householdId: 1, madeAt: -1 } }],
    [COLLECTIONS.ratings]: [
      { key: { historyId: 1, userId: 1 }, unique: true },
      { key: { householdId: 1, recipeId: 1 } },
    ],
  };
}

export async function createIndexes(db: Db) {
  for (const [name, specs] of Object.entries(indexSpecs())) {
    await db.collection(name).createIndexes(specs);
  }
}
