import "server-only";
import {
  MongoClient,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
  type ClientSession,
  type Db,
} from "mongodb";
import {
  COLLECTIONS,
  createIndexes,
  type AccessEventDoc,
  type ActivityEventDoc,
  type AdminDoc,
  type DeviceDoc,
  type AuditDoc,
  type AuthAttemptDoc,
  type CartDoc,
  type CustomIngredientDoc,
  type HistoryDoc,
  type HouseholdDoc,
  type HouseholdInviteDoc,
  type PantryDoc,
  type PreferencesDoc,
  type RatingDoc,
  type RecipeNoteDoc,
  type RecipeVersionDoc,
  type SessionDoc,
  type UpcomingDoc,
  type UserDoc,
} from "./schema";

const globalForMongo = globalThis as unknown as {
  _mongoClient?: Promise<MongoClient>;
  _mongoIndexes?: Promise<void>;
};

// Sized for a single household on serverless hosting: each function instance
// keeps its own small pool and releases idle sockets quickly.
const options = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 5_000,
};

function clientPromise() {
  if (!globalForMongo._mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set. See .env.example.");
    globalForMongo._mongoClient = new MongoClient(uri, options)
      .connect()
      .catch((error) => {
        globalForMongo._mongoClient = undefined;
        throw error;
      });
  }
  return globalForMongo._mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const db = client.db(process.env.MONGODB_DB ?? "breakfeast");
  // Lazily create indexes once per process so a forgotten `db:init` never breaks the app.
  globalForMongo._mongoIndexes ??= createIndexes(db).catch((error) => {
    globalForMongo._mongoIndexes = undefined;
    console.error("Index creation failed", error);
  });
  await globalForMongo._mongoIndexes;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    admins: db.collection<AdminDoc>(COLLECTIONS.admins),
    users: db.collection<UserDoc>(COLLECTIONS.users),
    userSessions: db.collection<SessionDoc>(COLLECTIONS.userSessions),
    adminSessions: db.collection<SessionDoc>(COLLECTIONS.adminSessions),
    authAttempts: db.collection<AuthAttemptDoc>(COLLECTIONS.authAttempts),
    audit: db.collection<AuditDoc>(COLLECTIONS.audit),
    households: db.collection<HouseholdDoc>(COLLECTIONS.households),
    householdInvites: db.collection<HouseholdInviteDoc>(COLLECTIONS.householdInvites),
    pantry: db.collection<PantryDoc>(COLLECTIONS.pantry),
    cart: db.collection<CartDoc>(COLLECTIONS.cart),
    upcoming: db.collection<UpcomingDoc>(COLLECTIONS.upcoming),
    history: db.collection<HistoryDoc>(COLLECTIONS.history),
    ratings: db.collection<RatingDoc>(COLLECTIONS.ratings),
    preferences: db.collection<PreferencesDoc>(COLLECTIONS.preferences),
    customIngredients: db.collection<CustomIngredientDoc>(COLLECTIONS.customIngredients),
    recipeNotes: db.collection<RecipeNoteDoc>(COLLECTIONS.recipeNotes),
    recipeVersions: db.collection<RecipeVersionDoc>(COLLECTIONS.recipeVersions),
    accessEvents: db.collection<AccessEventDoc>(COLLECTIONS.accessEvents),
    devices: db.collection<DeviceDoc>(COLLECTIONS.devices),
    activityEvents: db.collection<ActivityEventDoc>(COLLECTIONS.activityEvents),
  };
}

export type Collections = Awaited<ReturnType<typeof collections>>;

export const isDuplicateKey = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

/** Mongo is unreachable (as opposed to rejecting the operation). */
export const isStorageError = (error: unknown) =>
  error instanceof MongoServerSelectionError ||
  error instanceof MongoNetworkError ||
  error instanceof MongoTopologyClosedError ||
  error instanceof MongoNotConnectedError;

/** Runs `fn` in a transaction, retried by the driver on transient conflicts. Pass `session` to every operation. */
export async function withTransaction<T>(fn: (c: Collections, session: ClientSession) => Promise<T>): Promise<T> {
  const client = await clientPromise();
  const c = await collections();
  return client.withSession((session) => session.withTransaction(() => fn(c, session)));
}
