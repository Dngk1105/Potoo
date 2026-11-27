import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../../route-auth";
import { error, jsonObject, uuid } from "../shared";

export async function POST(request: NextRequest) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const body = await jsonObject(request);
    if (
      !body ||
      Object.keys(body).length !== 1 ||
      !(uuid(body.roomId) || (typeof body.pin === "string" && /^\d{6}$/.test(body.pin)))
    ) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    const { data, error: dbError } = await createAdminClient().rpc("k405_join_room", {
      p_actor: user.id,
      p_room_id: body.roomId ?? null,
      p_pin: body.pin ?? null,
    });
    if (dbError || !data || typeof data !== "object") {
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
    if (data.code === "NOT_FOUND") return error(404, "NOT_FOUND", "Not found");
    if (data.code === "CONFLICT") return error(409, "CONFLICT", "Room is not open");
    if (data.code === "FORBIDDEN") return error(403, "FORBIDDEN", "Forbidden");
    if (!uuid(data.roomId)) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return NextResponse.json({ roomId: data.roomId });
  });
}
