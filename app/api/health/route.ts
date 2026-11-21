import { createHmac } from "node:crypto";
import { connection } from "next/server";

// Deployment health check: verifies that each environment variable is set, points at the
// right project for this environment, and is accepted by the service. Never returns values.
// Expected hosts mirror docs/design/environments.md, section 2.

type Env = "production" | "staging" | "local";
type Result = "ok" | "missing" | "wrong-environment" | "rejected" | "unreachable";

const EXPECTED: Record<Env, { supabaseHost: string; livekitHost: string; retentionHours: string }> =
  {
    production: {
      supabaseHost: "ddqpfmknmumdpihaohil.supabase.co",
      livekitHost: "potoo-main-sr9wj8yb.livekit.cloud",
      retentionHours: "24",
    },
    staging: {
      supabaseHost: "xpxvrglutvgmifydzauj.supabase.co",
      livekitHost: "potoo-b619gqn3.livekit.cloud",
      retentionHours: "24",
    },
    local: { supabaseHost: "127.0.0.1:54321", livekitHost: "localhost:7880", retentionHours: "5" },
  };

const TIMEOUT_MS = 5000;

function currentEnv(): Env {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  return "local";
}

function hostOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).host : undefined;
  } catch {
    return undefined;
  }
}

async function accepted(url: string, init: RequestInit): Promise<Result> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok ? "ok" : "rejected";
  } catch {
    return "unreachable";
  }
}

// Minimal HS256 JWT for the LiveKit server API (same claims livekit-server-sdk would sign).
function livekitToken(apiKey: string, apiSecret: string): string {
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: apiKey, nbf: now, exp: now + 60, video: { roomList: true } })}`;
  const signature = createHmac("sha256", apiSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export async function GET() {
  await connection(); // always run at request time, never prerender

  const env = currentEnv();
  const expected = EXPECTED[env];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const livekitKey = process.env.LIVEKIT_API_KEY;
  const livekitSecret = process.env.LIVEKIT_API_SECRET;
  const retention = process.env.SHOT_RETENTION_HOURS;

  const supabaseHostOk = hostOf(supabaseUrl) === expected.supabaseHost;
  const livekitHostOk = hostOf(livekitUrl) === expected.livekitHost;
  const livekitHttp = livekitUrl?.replace(/^ws/, "http");

  const [supabasePublishableKey, supabaseSecretKey, livekitKeys] = await Promise.all([
    !publishableKey
      ? ("missing" as const)
      : !supabaseHostOk
        ? ("wrong-environment" as const)
        : accepted(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey } }),
    !secretKey
      ? ("missing" as const)
      : !supabaseHostOk
        ? ("wrong-environment" as const)
        : accepted(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
            headers: { apikey: secretKey },
          }),
    !livekitKey || !livekitSecret
      ? ("missing" as const)
      : !livekitHostOk
        ? ("wrong-environment" as const)
        : accepted(`${livekitHttp}/twirp/livekit.RoomService/ListRooms`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${livekitToken(livekitKey, livekitSecret)}`,
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
  ]);

  const checks: Record<string, Result> = {
    supabaseUrl: !supabaseUrl ? "missing" : supabaseHostOk ? "ok" : "wrong-environment",
    supabasePublishableKey,
    supabaseSecretKey,
    livekitUrl: !livekitUrl ? "missing" : livekitHostOk ? "ok" : "wrong-environment",
    livekitKeys,
    shotRetentionHours: !retention
      ? "missing"
      : retention === expected.retentionHours
        ? "ok"
        : "wrong-environment",
  };
  const ok = Object.values(checks).every((r) => r === "ok");

  return Response.json(
    { ok, env, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null, checks },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
