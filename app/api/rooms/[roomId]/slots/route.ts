import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../../../route-auth";
import { error, jsonObject, uuid } from "../../shared";

export async function PUT(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { roomId } = await context.params;
    const body = await jsonObject(request);
    if (!uuid(roomId) || !body || Object.keys(body).length !== 1 || !Array.isArray(body.slots)) {
      return error(400, "INVALID_REQUEST", "Invalid request");
    }
    const users = new Set<string>();
    const indices = new Set<number>();
    for (const slot of body.slots) {
      if (
        !slot ||
        typeof slot !== "object" ||
        Array.isArray(slot) ||
        Object.keys(slot).length !== 2 ||
        !uuid(slot.userId) ||
        !Number.isSafeInteger(slot.slotIndex) ||
        slot.slotIndex < 0 ||
        users.has(slot.userId.toLowerCase()) ||
        indices.has(slot.slotIndex)
      )
        return error(400, "INVALID_REQUEST", "Invalid request");
      users.add(slot.userId.toLowerCase());
      indices.add(slot.slotIndex);
    }
    const { data, error: dbError } = await createAdminClient().rpc("k405_set_slots", {
      p_actor: user.id,
      p_room_id: roomId,
      p_slots: body.slots,
    });
    if (dbError || !data || typeof data !== "object")
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (data.code === "NOT_FOUND") return error(404, "NOT_FOUND", "Not found");
    if (data.code === "FORBIDDEN") return error(403, "FORBIDDEN", "Forbidden");
    if (data.code === "CONFLICT") return error(409, "CONFLICT", "Room state conflict");
    if (data.code === "INVALID_REQUEST") return error(400, "INVALID_REQUEST", "Invalid request");
    if (!Array.isArray(data.slots)) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return NextResponse.json({ slots: data.slots });
  });
}
