import { verifyLiveKitWebhook } from "../../livekit-webhook";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return error(401, "UNAUTHENTICATED", "Unauthorized");
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!key || !secret) return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
  let event;
  try {
    event = await verifyLiveKitWebhook(await request.text(), authorization, key, secret);
  } catch {
    return error(401, "UNAUTHENTICATED", "Unauthorized");
  }
  if (!event.event) return error(400, "INVALID_REQUEST", "Invalid request");
  if (event.event !== "participant_left") return Response.json({ ok: true });
  if (
    !event.room?.name ||
    !uuid.test(event.room.name) ||
    !event.participant?.identity ||
    !uuid.test(event.participant.identity)
  ) {
    return error(400, "INVALID_REQUEST", "Invalid request");
  }
  // A stale token or delayed LiveKit update can restore an old host role after transfer.
  return error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
}
