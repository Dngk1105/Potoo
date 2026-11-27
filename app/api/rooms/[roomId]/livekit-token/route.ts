import { NextRequest } from "next/server";
import { withRouteAuth } from "../../../route-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { roomId } = await context.params;
    if (
      !uuid.test(roomId) ||
      !request.headers.get("content-type")?.match(/^application\/json(?:\s*;|$)/i)
    ) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    try {
      const db = createAdminClient();
      const room = await db.from("rooms").select("host_id,status").eq("id", roomId).maybeSingle();
      if (room.error) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
      if (!room.data) return error(404, "NOT_FOUND", "Not found");
      const membership = await db
        .from("room_members")
        .select("kicked_at")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership.error) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
      if (!membership.data || membership.data.kicked_at !== null)
        return error(403, "FORBIDDEN", "Forbidden");
      if (room.data.status !== "open" || !room.data.host_id)
        return error(409, "CONFLICT", "Room unavailable");
      const role = room.data.host_id === user.id ? "host" : "member";
      const adapter = process.env.REALTIME_ADAPTER;
      if (adapter === "mock") {
        return Response.json(
          { url: null, token: null, role },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      // A previously issued token can restore a stale host role after transfer or kick.
      // Refuse real credentials until join and event authorization can revoke that role.
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    } catch {
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
  });
}
