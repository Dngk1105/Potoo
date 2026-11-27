import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { withRouteAuth } from "../../../route-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stripId: string }> },
) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { stripId } = await params;
    if (
      !uuid.test(stripId) ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")
    )
      return fail(400, "INVALID_REQUEST", "Invalid request");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0)
      return fail(400, "INVALID_REQUEST", "Invalid request");
    const token = randomBytes(32).toString("hex");
    const { data, error } = await createAdminClient().rpc("k406_share_strip", {
      p_actor: user.id,
      p_strip: stripId,
      p_token: token,
    });
    if (error?.code === "42501") return fail(403, "FORBIDDEN", "Forbidden");
    if (error || typeof data !== "string")
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return Response.json({ shareToken: data }, { headers: { "Cache-Control": "no-store" } });
  });
}
