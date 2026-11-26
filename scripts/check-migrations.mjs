// Guards supabase/migrations against version conflicts. Compares HEAD with the base branch:
// 1. Migrations already on the base branch must not be edited or deleted.
// 2. New migrations must be named <14-digit timestamp>_<name>.sql.
// 3. New migrations must be newer than every migration on the base branch,
//    otherwise `supabase db push` on staging/main rejects them as out of order.
// Usage: node scripts/check-migrations.mjs [baseRef]   (default: origin/dev)
import { execFileSync } from "node:child_process";

const DIR = "supabase/migrations/";
const base = process.argv[2] ?? process.env.MIGRATION_BASE_REF ?? "origin/dev";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const lines = (s) => (s ? s.split("\n") : []);
const version = (file) => file.slice(DIR.length).split("_")[0];

let mergeBase;
try {
  mergeBase = git("merge-base", base, "HEAD");
} catch {
  console.error(`check-migrations: cannot find base ref "${base}". Run "git fetch origin dev".`);
  process.exit(1);
}

const baseFiles = lines(git("ls-tree", "-r", "--name-only", base, "--", DIR)).filter((f) =>
  f.endsWith(".sql"),
);
const latestBase = baseFiles.map(version).sort().at(-1) ?? "0";

const changes = lines(git("diff", "--name-status", "--no-renames", mergeBase, "HEAD", "--", DIR));
const errors = [];

for (const line of changes) {
  const [status, file] = line.split("\t");
  if (!file.endsWith(".sql")) continue;
  if (status !== "A") {
    errors.push(
      `${file}: existing migration was ${status === "D" ? "deleted" : "modified"}. Create a new migration instead.`,
    );
    continue;
  }
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file.slice(DIR.length))) {
    errors.push(
      `${file}: name must be <14-digit timestamp>_<snake_case>.sql. Use "npm run db:new -- <name>".`,
    );
  } else if (version(file) <= latestBase) {
    errors.push(
      `${file}: timestamp ${version(file)} is not newer than ${latestBase} on ${base}. ` +
        `Rename it with a fresh timestamp (npm run db:new) and move the SQL over.`,
    );
  }
}

const versions = lines(git("ls-tree", "-r", "--name-only", "HEAD", "--", DIR)).map(version);
const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
for (const v of new Set(dupes)) errors.push(`Duplicate migration timestamp ${v}.`);

if (errors.length) {
  console.error("check-migrations failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`check-migrations: ok (base ${base}, latest ${latestBase}).`);
