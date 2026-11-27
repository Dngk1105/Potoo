import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const container = "supabase_db_potoo";
const database = `potoo_shot_test_${randomUUID().replaceAll("-", "")}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20261127122752_k407_start_shot_events.sql",
);
const retryPath = path.join(root, "supabase/migrations/20261127130013_start_shot_retry.sql");
const host = "aa110000-0000-4000-8000-000000000001";
const member = "aa110000-0000-4000-8000-000000000002";
const room = "aa110000-0000-4000-8000-000000000003";
const session = "aa110000-0000-4000-8000-000000000004";
let created = false;

async function command(args) {
  return exec("docker", ["exec", container, ...args], { timeout: 30000, maxBuffer: 1024 * 1024 });
}

function sql(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`psql failed: ${err}`)),
    );
    child.stdin.end(text);
  });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await command(["createdb", "-U", "postgres", database]);
  created = true;
  const migration = await readFile(migrationPath, "utf8");
  const retry = await readFile(retryPath, "utf8");
  await sql(`
    create table public.rooms (id uuid primary key, host_id uuid, status text not null);
    create table public.room_members (room_id uuid not null references public.rooms(id), user_id uuid not null, kicked_at timestamptz, primary key(room_id,user_id));
    create table public.sessions (id uuid primary key, room_id uuid not null references public.rooms(id), started_at timestamptz);
    ${migration}
    ${retry}
    insert into public.rooms(id,host_id,status) values('${room}','${host}','open');
    insert into public.room_members(room_id,user_id) values('${room}','${host}'),('${room}','${member}');
    insert into public.sessions(id,room_id,started_at) values('${session}','${room}',now());
    select public.k407_select_shot_session('${host}','${room}','${session}');
  `);
  const requests = [randomUUID(), randomUUID()];
  const issues = await Promise.all(
    requests.map((id) =>
      sql(`select public.k407_issue_start_shot('${host}','${room}','${session}','${id}',0,3000);`),
    ),
  );
  const issueResults = issues.map(JSON.parse);
  check(
    issueResults.filter((result) => result.code === "OK").length === 1,
    "Expected one issued event",
  );
  check(
    issueResults.filter((result) => result.code === "CONFLICT").length === 1,
    "Expected one conflicting issue",
  );
  const eventId = issueResults.find((result) => result.code === "OK").eventId;
  const claims = await Promise.all(
    [0, 1].map(() =>
      sql(`select public.k407_claim_start_shot('${member}','${room}','${eventId}');`),
    ),
  );
  const claimResults = claims.map(JSON.parse);
  check(
    claimResults.filter((result) => result.code === "OK").length === 1,
    "Expected one successful claim",
  );
  check(
    claimResults.filter((result) => result.code === "REPLAY").length === 1,
    "Expected one replay rejection",
  );
  const nextEvent = JSON.parse(
    await sql(
      `select public.k407_issue_start_shot('${host}','${room}','${session}','${randomUUID()}',1,3000);`,
    ),
  );
  check(nextEvent.code === "OK", "Expected second event");
  await sql(
    `update public.room_members set kicked_at=clock_timestamp() where room_id='${room}' and user_id='${member}';`,
  );
  const afterKick = JSON.parse(
    await sql(`select public.k407_claim_start_shot('${member}','${room}','${nextEvent.eventId}');`),
  );
  check(
    afterKick.code === "STALE" || afterKick.code === "FORBIDDEN",
    "Claim after kick must be rejected",
  );
  console.log("PASS: concurrent issue, concurrent claim, kick invalidation");
} finally {
  if (created) {
    await command(["dropdb", "-U", "postgres", database]);
    console.log("Temporary test database removed");
  }
}
