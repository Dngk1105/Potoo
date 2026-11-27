import { NextRequest } from "next/server";
import { withRouteAuth } from "../../route-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function PATCH(
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
    if (!body || typeof body !== "object" || Array.isArray(body))
      return fail(400, "INVALID_REQUEST", "Invalid request");
    const fields = body as Record<string, unknown>;
    const canvas = fields.canvasJson;
    if (
      !Object.keys(fields).length ||
      Object.keys(fields).some((key) => key !== "canvasJson" && key !== "exported") ||
      ("exported" in fields && fields.exported !== true) ||
      ("canvasJson" in fields &&
        (!canvas || typeof canvas !== "object" || Array.isArray(canvas) || !("version" in canvas)))
    )
      return fail(400, "INVALID_REQUEST", "Invalid request");
    const admin = createAdminClient();
    const strip = await admin
      .from("strips")
      .select("kind,created_by")
      .eq("id", stripId)
      .maybeSingle();
    if (strip.error) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (!strip.data) return fail(404, "NOT_FOUND", "Not found");
    // Shared membership and the update must be checked together in the database.
    if (strip.data.kind === "shared")
      return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (strip.data.kind !== "personal" || strip.data.created_by !== user.id)
      return fail(403, "FORBIDDEN", "Forbidden");
    const path = `strips/${stripId.toLowerCase()}.png`;
    const update: { canvas_json?: object; export_path?: string } = {};
    if (canvas && typeof canvas === "object") update.canvas_json = canvas;
    if (fields.exported === true) {
      const object = await admin.storage.from("media").info(path);
      if (object.error) {
        if (object.error.statusCode === "404" || object.error.status === 404)
          return fail(409, "CONFLICT", "Object not found");
        return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
      }
      update.export_path = path;
    }
    const result = await admin
      .from("strips")
      .update(update)
      .eq("id", stripId)
      .eq("kind", "personal")
      .eq("created_by", user.id)
      .select("id,canvas_json,export_path")
      .maybeSingle();
    if (result.error) return fail(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    if (!result.data) return fail(409, "CONFLICT", "Conflict");
    return Response.json({
      stripId: result.data.id,
      canvasJson: result.data.canvas_json,
      exportPath: result.data.export_path,
    });
  });
}
