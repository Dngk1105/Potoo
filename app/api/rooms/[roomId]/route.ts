import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../../route-auth";
import { error, jsonObject, uuid } from "../shared";

function validSettings(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16 * 1024) return false;
  const safe = (item: unknown, depth: number): boolean => {
    if (!item || typeof item !== "object") return true;
    if (depth > 16) return false;
    return Object.entries(item).every(
      ([key, child]) =>
        !["__proto__", "constructor", "prototype"].includes(key) && safe(child, depth + 1),
    );
  };
  return safe(value, 1);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { roomId } = await context.params;
    const body = await jsonObject(request);
    if (
      !uuid(roomId) ||
      !body ||
      !Object.keys(body).length ||
      Object.keys(body).some((key) => !["locked", "frameId", "settings"].includes(key)) ||
      ("locked" in body && typeof body.locked !== "boolean") ||
      ("frameId" in body && body.frameId !== null && !uuid(body.frameId)) ||
      ("settings" in body && !validSettings(body.settings))
    )
      return error(400, "INVALID_REQUEST", "Invalid request");

    const { data, error: dbError } = await createAdminClient().rpc("k405_patch_room", {
      p_actor: user.id,
      p_room_id: roomId,
      p_patch: body,
    });
    if (dbError || !data || typeof data !== "object")
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (data.code === "NOT_FOUND") return error(404, "NOT_FOUND", "Not found");
    if (data.code === "FORBIDDEN") return error(403, "FORBIDDEN", "Forbidden");
    if (data.code === "CONFLICT") return error(409, "CONFLICT", "Room state conflict");
    if (data.code === "INVALID_REQUEST") return error(400, "INVALID_REQUEST", "Invalid request");
    if (
      data.roomId !== roomId ||
      !["open", "locked"].includes(data.status) ||
      (data.frameId !== null && !uuid(data.frameId)) ||
      data.settings === null ||
      typeof data.settings !== "object" ||
      Array.isArray(data.settings)
    )
      return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return NextResponse.json({
      roomId: data.roomId,
      status: data.status,
      frameId: data.frameId,
      settings: data.settings,
    });
  });
}
