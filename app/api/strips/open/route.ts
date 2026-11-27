import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status, headers });
const notFound = () => fail(404, "NOT_FOUND", "Not found");

export async function POST(request: NextRequest) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return fail(400, "INVALID_REQUEST", "Invalid request");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "INVALID_REQUEST", "Invalid request");
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("shareToken" in body) ||
    typeof body.shareToken !== "string" ||
    body.shareToken.length === 0 ||
    body.shareToken.length > 1024
  )
    return fail(400, "INVALID_REQUEST", "Invalid request");

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key || !secret) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    const authorization = request.headers.get("authorization");
    const bearer = authorization?.match(/^Bearer ([^\s,]+)$/i);
    if (authorization && !bearer) return fail(401, "UNAUTHENTICATED", "Unauthorized");
    const client = bearer
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : createServerClient(url, key, {
          cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
        });
    const auth = bearer ? await client.auth.getUser(bearer[1]) : await client.auth.getUser();
    if (
      auth.error &&
      (bearer ||
        (auth.error.name !== "AuthSessionMissingError" &&
          auth.error.status !== 400 &&
          auth.error.status !== 401 &&
          auth.error.status !== 403))
    ) {
      if (bearer && [400, 401, 403].includes(auth.error.status ?? 0))
        return fail(401, "UNAUTHENTICATED", "Unauthorized");
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
    const viewer = auth.data.user?.id;
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const stripResult = await admin
      .from("strips")
      .select("id,kind,created_by,session_id,export_path,strip_owners(user_id,visibility)")
      .eq("share_token", body.shareToken)
      .maybeSingle();
    if (stripResult.error) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    const strip = stripResult.data;
    if (
      !strip ||
      strip.export_path !== `strips/${strip.id}.png` ||
      !Array.isArray(strip.strip_owners) ||
      strip.strip_owners.length === 0
    )
      return notFound();
    // The schema cannot verify which people appear in a shared strip.
    if (strip.kind === "shared") return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (strip.kind !== "personal") return notFound();
    let sessionMember = false;
    let friends = new Set<string>();
    if (viewer) {
      const [membership, friendships] = await Promise.all([
        admin.rpc("is_session_member", { p_session_id: strip.session_id, p_user_id: viewer }),
        admin
          .from("friendships")
          .select("requester_id,addressee_id")
          .eq("status", "accepted")
          .or(`requester_id.eq.${viewer},addressee_id.eq.${viewer}`),
      ]);
      if (membership.error || friendships.error)
        return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
      sessionMember = membership.data === true;
      friends = new Set(
        (friendships.data ?? []).map((row) =>
          row.requester_id === viewer ? row.addressee_id : row.requester_id,
        ),
      );
    }
    const allowed = strip.strip_owners.every(
      (owner: { user_id: string; visibility: string }) =>
        owner.visibility === "link" ||
        (viewer &&
          (owner.user_id === viewer ||
            (["session", "friends"].includes(owner.visibility) && sessionMember) ||
            (owner.visibility === "friends" && friends.has(owner.user_id)))),
    );
    if (!allowed) return notFound();
    const storage = admin.storage.from("media");
    const object = await storage.info(strip.export_path);
    if (object.error) {
      if (object.error.statusCode === "404" || object.error.status === 404) return notFound();
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
    const signed = await storage.createSignedUrl(strip.export_path, 60);
    if (signed.error || !signed.data?.signedUrl)
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return Response.json({ url: signed.data.signedUrl, expiresIn: 60 }, { headers });
  } catch {
    return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
  }
}
