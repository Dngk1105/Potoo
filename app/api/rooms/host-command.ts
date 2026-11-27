import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../route-auth";
import { error, jsonObject, uuid } from "./shared";

type Command = "kick" | "host";

export function hostCommand(command: Command) {
  return async (request: NextRequest, context: { params: Promise<{ roomId: string }> }) =>
    withRouteAuth(request, async ({ user, createAdminClient }) => {
      const { roomId } = await context.params;
      const body = await jsonObject(request);
      if (!uuid(roomId) || !body || Object.keys(body).length !== 1 || !uuid(body.userId))
        return error(400, "INVALID_REQUEST", "Invalid request");
      // Real participants require safe revocation and LiveKit reconciliation.
      if (process.env.REALTIME_ADAPTER !== "mock")
        return error(503, "SERVICE_UNAVAILABLE", "Command unavailable");
      const target = body.userId.toLowerCase();
      const { data, error: dbError } = await createAdminClient().rpc(
        command === "kick" ? "k405_kick" : "k405_transfer_host",
        { p_actor: user.id, p_room_id: roomId, p_target: target },
      );
      if (dbError || !data || typeof data !== "object")
        return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
      if (data.code === "NOT_FOUND") return error(404, "NOT_FOUND", "Not found");
      if (data.code === "FORBIDDEN") return error(403, "FORBIDDEN", "Forbidden");
      if (data.code === "CONFLICT") return error(409, "CONFLICT", "Room state conflict");
      if (command === "kick") {
        if (data.userId !== target || data.kicked !== true)
          return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
        return NextResponse.json({ userId: target, kicked: true });
      }
      if (data.hostId !== target) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
      return NextResponse.json({ hostId: target });
    });
}
