import { NextRequest } from "next/server";
import { withRouteAuth } from "../../../route-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return withRouteAuth(request, async ({ user, supabase, createAdminClient }) => {
    const { sessionId } = await params;
    if (
      !uuid.test(sessionId) ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")
    )
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
      !("round" in body) ||
      typeof body.round !== "number" ||
      !Number.isInteger(body.round) ||
      body.round < 0 ||
      body.round > 2147483647
    )
      return fail(400, "INVALID_REQUEST", "Invalid request");
    const membership = await supabase.rpc("is_session_member", { p_session_id: sessionId });
    if (membership.error) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (membership.data !== true) return fail(403, "FORBIDDEN", "Forbidden");
    const path = `sessions/${sessionId.toLowerCase()}/${body.round}/${user.id}.jpg`;
    const object = await createAdminClient().storage.from("media").info(path);
    if (object.error) {
      if (object.error.statusCode === "404" || object.error.status === 404)
        return fail(409, "CONFLICT", "Object not found");
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
    const existing = await supabase
      .from("shots")
      .select("id,storage_path")
      .eq("session_id", sessionId)
      .eq("round", body.round)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (existing.data)
      return existing.data.storage_path === path
        ? Response.json({ shotId: existing.data.id, storagePath: path })
        : fail(409, "CONFLICT", "Conflict");
    const inserted = await supabase
      .from("shots")
      .insert({ session_id: sessionId, user_id: user.id, round: body.round, storage_path: path })
      .select("id")
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23505") {
        const retry = await supabase
          .from("shots")
          .select("id,storage_path")
          .eq("session_id", sessionId)
          .eq("round", body.round)
          .eq("user_id", user.id)
          .maybeSingle();
        if (retry.error) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
        if (retry.data?.storage_path === path)
          return Response.json({ shotId: retry.data.id, storagePath: path });
        return fail(409, "CONFLICT", "Conflict");
      }
      if (inserted.error.code === "42501") return fail(403, "FORBIDDEN", "Forbidden");
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
    return Response.json({ shotId: inserted.data.id, storagePath: path }, { status: 201 });
  });
}
