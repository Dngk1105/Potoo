import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "./route-auth";
import { error, uuid } from "./rooms/shared";
import {
  signStartShot,
  loadStartShotEd25519Key,
  loadStartShotHmacKey,
  wrapStartShotEnvelope,
  verifyStartShotEnvelope,
  type SignedStartShot,
} from "./start-shot-signature";

const unavailable = () => error(503, "SERVICE_UNAVAILABLE", "Service unavailable");
const invalid = () => error(400, "INVALID_REQUEST", "Invalid request");
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const fields: (keyof SignedStartShot)[] = [
  "version",
  "eventId",
  "requestId",
  "roomId",
  "sessionId",
  "hostId",
  "generation",
  "round",
  "delayMs",
  "issuedAt",
  "expiresAt",
];

type Kind = "select" | "issue" | "verify";
type RouteContext = { params: Promise<{ roomId: string }> };

async function bodyObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (
    !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "") ||
    !request.body
  )
    return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function rpcError(code: unknown): Response {
  switch (code) {
    case "INVALID_REQUEST":
      return invalid();
    case "NOT_FOUND":
      return error(404, "NOT_FOUND", "Not found");
    case "FORBIDDEN":
      return error(403, "FORBIDDEN", "Forbidden");
    case "CONFLICT":
    case "STALE":
    case "EXPIRED":
    case "REPLAY":
      return error(409, "CONFLICT", "State conflict");
    default:
      return unavailable();
  }
}

export async function startShotRoute(kind: Kind, request: NextRequest, context: RouteContext) {
  return withRouteAuth(request, async ({ user, createAdminClient }) => {
    const { roomId } = await context.params;
    const body = await bodyObject(request);
    if (!uuid(roomId) || !body) return invalid();
    let signingKey: Buffer | null = null;
    let edKey: ReturnType<typeof loadStartShotEd25519Key> = null;
    let signed: SignedStartShot | null = null;
    if (kind === "select") {
      if (
        Object.keys(body).length !== 1 ||
        !("sessionId" in body) ||
        (body.sessionId !== null && !uuid(body.sessionId))
      )
        return invalid();
    } else if (kind === "issue") {
      if (
        Object.keys(body).length !== 4 ||
        !uuid(body.sessionId) ||
        !uuid(body.requestId) ||
        !Number.isSafeInteger(body.round) ||
        (body.round as number) < 0 ||
        (body.round as number) > 2147483647 ||
        !Number.isSafeInteger(body.delayMs) ||
        (body.delayMs as number) < 0 ||
        (body.delayMs as number) > 60000
      )
        return invalid();
      signingKey = loadStartShotHmacKey(process.env.START_SHOT_SIGNING_KEY);
      edKey = loadStartShotEd25519Key(process.env.START_SHOT_ED25519_PRIVATE_KEY);
      if (!signingKey || !edKey) return unavailable();
    } else {
      if (
        (Object.keys(body).length !== 1 && Object.keys(body).length !== 2) ||
        typeof body.envelope !== "string" ||
        body.envelope.length > 4096 ||
        (Object.keys(body).length === 2 && !uuid(body.claimRequestId))
      )
        return invalid();
      signingKey = loadStartShotHmacKey(process.env.START_SHOT_SIGNING_KEY);
      edKey = loadStartShotEd25519Key(process.env.START_SHOT_ED25519_PRIVATE_KEY);
      if (!signingKey || !edKey) return unavailable();
      signed = verifyStartShotEnvelope(body.envelope, signingKey, edKey, Date.now());
      if (!signed || !sameId(signed.roomId, roomId)) return invalid();
    }
    try {
      const admin = createAdminClient();
      const result =
        kind === "select"
          ? await admin.rpc("k407_select_shot_session", {
              p_actor: user.id,
              p_room: roomId,
              p_session: body.sessionId,
            })
          : kind === "issue"
            ? await admin.rpc("k407_issue_start_shot", {
                p_actor: user.id,
                p_room: roomId,
                p_session: body.sessionId,
                p_request: body.requestId,
                p_round: body.round,
                p_delay_ms: body.delayMs,
              })
            : body.claimRequestId
              ? await admin.rpc("k407_claim_start_shot_v2", {
                  p_actor: user.id,
                  p_room: roomId,
                  p_event: signed!.eventId,
                  p_claim_request: body.claimRequestId,
                })
              : await admin.rpc("k407_claim_start_shot", {
                  p_actor: user.id,
                  p_room: roomId,
                  p_event: signed!.eventId,
                });
      const data = result.data;
      if (result.error || !data || typeof data !== "object" || Array.isArray(data))
        return unavailable();
      if (data.code !== "OK") return rpcError(data.code);
      if (kind === "select") {
        if (
          (data.sessionId !== null && !uuid(data.sessionId)) ||
          (body.sessionId === null
            ? data.sessionId !== null
            : typeof data.sessionId !== "string" ||
              !sameId(data.sessionId, body.sessionId as string)) ||
          !Number.isSafeInteger(data.generation) ||
          data.generation < 0
        )
          return unavailable();
        return NextResponse.json({ sessionId: data.sessionId, generation: data.generation });
      }
      const payload = { ...data };
      delete payload.code;
      if (kind === "issue") {
        if (
          typeof payload.roomId !== "string" ||
          !sameId(payload.roomId, roomId) ||
          typeof payload.hostId !== "string" ||
          !sameId(payload.hostId, user.id) ||
          typeof payload.sessionId !== "string" ||
          !sameId(payload.sessionId, body.sessionId as string) ||
          typeof payload.requestId !== "string" ||
          !sameId(payload.requestId, body.requestId as string) ||
          payload.round !== body.round ||
          payload.delayMs !== body.delayMs
        )
          return unavailable();
        const envelope = wrapStartShotEnvelope(
          signStartShot(payload as SignedStartShot, signingKey!),
          edKey!,
        );
        if (!verifyStartShotEnvelope(envelope, signingKey!, edKey!, Date.now()))
          return unavailable();
        return NextResponse.json({ envelope });
      }
      if (
        Object.keys(payload).length !== fields.length ||
        fields.some((field) => payload[field] !== signed![field])
      )
        return unavailable();
      return NextResponse.json({
        payload: {
          sessionId: signed!.sessionId,
          requestId: signed!.requestId,
          round: signed!.round,
          delayMs: signed!.delayMs,
        },
        sender: { identity: signed!.hostId, role: "host" },
      });
    } catch {
      return unavailable();
    }
  });
}
