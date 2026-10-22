/**
 * Runs what a Netlify deploy runs, locally, so failures show up before a push to main:
 * tests, typecheck, lint, the production build, and a copy of Netlify's secrets scan.
 *
 *   npm run predeploy                 everything
 *   npm run predeploy -- --scan-only  just the secrets scan (against the last build)
 *
 * The scan looks for the value of every variable in .env.local / .env.production.local
 * (and .env.netlify, if you export the site's variables there) in the repo, the build
 * output and node_modules, which Netlify bundles into the server functions.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const ENV_FILES = [".env.local", ".env.production.local", ".env.netlify"];
const SKIP_DIRS = new Set([".git", ".next/cache", ".next/dev", "node_modules/.cache"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIN_SECRET_LENGTH = 4;

function parseEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function omittedKeys(): Set<string> {
  const toml = existsSync(join(ROOT, "netlify.toml")) ? readFileSync(join(ROOT, "netlify.toml"), "utf8") : "";
  const m = toml.match(/SECRETS_SCAN_OMIT_KEYS\s*=\s*"([^"]*)"/);
  return new Set((m?.[1] ?? "").split(",").map((k) => k.trim()).filter(Boolean));
}

/** Variable names the app or CLI actually read, from .env.example. */
function knownKeys(): Set<string> {
  const example = readFileSync(join(ROOT, ".env.example"), "utf8");
  return new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(ROOT, path);
    if (SKIP_DIRS.has(rel) || entry.name.startsWith(".env")) continue;
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

function scanSecrets(): boolean {
  const env: Record<string, string> = {};
  for (const f of ENV_FILES) if (existsSync(join(ROOT, f))) Object.assign(env, parseEnv(join(ROOT, f)));
  const omit = omittedKeys();
  const known = knownKeys();

  for (const key of Object.keys(env)) {
    if (!known.has(key)) console.warn(`  note: ${key} is set but the app doesn't read it. Remove it here and in Netlify.`);
  }

  const secrets = Object.entries(env)
    .filter(([key, value]) => !omit.has(key) && value.length >= MIN_SECRET_LENGTH)
    .map(([key, value]) => ({ key, needle: Buffer.from(value) }));
  if (!secrets.length) {
    console.log("  No env values to scan for (add .env.local or .env.netlify).");
    return true;
  }

  const hits = new Map<string, string[]>();
  for (const file of walk(ROOT)) {
    if (statSync(file).size > MAX_FILE_BYTES) continue;
    const content = readFileSync(file);
    for (const { key, needle } of secrets) {
      if (content.includes(needle)) hits.set(key, [...(hits.get(key) ?? []), relative(ROOT, file)]);
    }
  }

  if (!hits.size) {
    console.log(`  No values of ${secrets.length} env variables found.`);
    return true;
  }
  for (const [key, files] of hits) {
    console.error(`  ${key} found in ${files.length} file(s), e.g.:`);
    for (const f of files.slice(0, 5)) console.error(`    ${f}`);
  }
  console.error(
    "\n  Netlify will fail the deploy. If the variable isn't a secret, add it to SECRETS_SCAN_OMIT_KEYS in\n" +
      "  netlify.toml. If it's unused, delete it in Netlify. If it's a real secret, remove it from the code.",
  );
  return false;
}

function run(label: string, cmd: string, args: string[]): boolean {
  console.log(`\n> ${label}`);
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  return res.status === 0;
}

function main() {
  const scanOnly = process.argv.includes("--scan-only");
  const steps: [string, string, string[]][] = scanOnly
    ? []
    : [
        ["Tests", "npm", ["test"]],
        ["Typecheck", "npx", ["tsc", "--noEmit"]],
        ["Lint", "npm", ["run", "lint"]],
        ["Production build", "npm", ["run", "build"]],
      ];
  for (const [label, cmd, args] of steps) {
    if (!run(label, cmd, args)) {
      console.error(`\nPredeploy failed at: ${label}`);
      process.exit(1);
    }
  }
  console.log("\n> Secrets scan (as Netlify does it)");
  if (!scanSecrets()) {
    console.error("\nPredeploy failed at: Secrets scan");
    process.exit(1);
  }
  console.log("\nPredeploy passed. Safe to push to main.");
}

main();
