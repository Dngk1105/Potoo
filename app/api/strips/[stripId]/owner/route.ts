import { NextRequest } from "next/server";
import { withRouteAuth } from "../../../route-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const visibilityValues = ["private", "session", "friends", "link"];
const error = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stripId: string }> },
) {
  return withRouteAuth(request, async ({ user, supabase }) => {
    const { stripId } = await params;
    if (
      !uuid.test(stripId) ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")
    ) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    const fields = body as Record<string, unknown>;
    const keys = Object.keys(fields);
    if (
      keys.length === 0 ||
      keys.some((key) => key !== "visibility" && key !== "hidden") ||
      ("visibility" in fields &&
        (typeof fields.visibility !== "string" || !visibilityValues.includes(fields.visibility))) ||
      ("hidden" in fields && typeof fields.hidden !== "boolean")
    ) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    const update: { visibility?: string; hidden_at?: string | null } = {};
    if (typeof fields.visibility === "string") update.visibility = fields.visibility;
    if (typeof fields.hidden === "boolean")
      update.hidden_at = fields.hidden ? new Date().toISOString() : null;
    const result = await supabase
      .from("strip_owners")
      .update(update)
      .eq("strip_id", stripId)
      .eq("user_id", user.id)
      .select("visibility,hidden_at")
      .maybeSingle();
    if (result.error) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (!result.data) return error(404, "NOT_FOUND", "Not found");
    return Response.json({
      visibility: result.data.visibility,
      hidden: result.data.hidden_at !== null,
    });
  });
}
