import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../route-auth";
import { error, jsonObject } from "./shared";

export async function POST(request: NextRequest) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const body = await jsonObject(request);
    if (!body || Object.keys(body).length !== 0)
      return error(400, "INVALID_REQUEST", "Invalid request");
    const admin = createAdminClient();
    for (let attempt = 0; attempt < 32; attempt++) {
      const pin = randomInt(1_000_000).toString().padStart(6, "0");
      const { data, error: dbError } = await admin.rpc("k405_create_room", {
        p_actor: user.id,
        p_pin: pin,
      });
      if (!dbError && typeof data === "string")
        return NextResponse.json({ roomId: data, pin }, { status: 201 });
      if (dbError?.code !== "23505")
        return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    }
    return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
  });
}
