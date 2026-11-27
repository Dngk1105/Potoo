import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../../../route-auth";
import { error, jsonObject, uuid } from "../../shared";

export async function POST(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { roomId } = await context.params;
    const body = await jsonObject(request);
    if (!uuid(roomId) || !body || Object.keys(body).length !== 0)
      return error(400, "INVALID_REQUEST", "Invalid request");
    // Deleting membership alone does not disconnect or revoke a LiveKit participant.
    if (process.env.REALTIME_ADAPTER !== "mock")
      return error(503, "SERVICE_UNAVAILABLE", "Leave is unavailable");
    const { data, error: dbError } = await createAdminClient().rpc("k405_leave_room", {
      p_actor: user.id,
      p_room_id: roomId,
    });
    if (dbError || !data || typeof data !== "object")
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (data.code === "NOT_FOUND") return error(404, "NOT_FOUND", "Not found");
    if (data.code === "FORBIDDEN") return error(403, "FORBIDDEN", "Forbidden");
    if (data.code === "CONFLICT")
      return error(409, "CONFLICT", "Host must transfer before leaving");
    if (data.left !== true) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return NextResponse.json({ left: true });
  });
}
