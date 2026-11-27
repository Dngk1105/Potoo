import { NextRequest } from "next/server";
import { withRouteAuth } from "../../../route-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { sessionId } = await params;
    if (
      !uuid.test(sessionId) ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")
    ) {
      return fail(400, "INVALID_REQUEST", "Invalid request");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return fail(400, "INVALID_REQUEST", "Invalid request");
    const fields = body as Record<string, unknown>;
    const canvas = fields.canvasJson;
    const owners = fields.ownerIds;
    if (
      Object.keys(fields).length !== 3 ||
      (fields.kind !== "shared" && fields.kind !== "personal") ||
      !canvas ||
      typeof canvas !== "object" ||
      Array.isArray(canvas) ||
      !("version" in canvas) ||
      !Array.isArray(owners) ||
      owners.length === 0 ||
      owners.some((owner) => typeof owner !== "string" || !uuid.test(owner)) ||
      new Set(owners.map((owner: string) => owner.toLowerCase())).size !== owners.length ||
      (fields.kind === "personal" &&
        (owners.length !== 1 || owners[0].toLowerCase() !== user.id.toLowerCase()))
    )
      return fail(400, "INVALID_REQUEST", "Invalid request");

    // Shared ownership needs verifiable provenance, which the schema does not yet record.
    if (fields.kind === "shared") return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    const { data, error } = await createAdminClient().rpc("k406_create_personal_strip", {
      p_actor: user.id,
      p_session: sessionId,
      p_canvas: canvas,
    });
    if (error?.code === "42501") return fail(403, "FORBIDDEN", "Forbidden");
    if (error || typeof data !== "string")
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    return Response.json({ stripId: data, ownerIds: [user.id] }, { status: 201 });
  });
}
