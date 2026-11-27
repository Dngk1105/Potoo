import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { generateKeyPairSync } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: true }));
vi.mock("./route-auth", () => ({
  withRouteAuth: async (
    _request: NextRequest,
    handler: (context: unknown) => Promise<Response>,
  ) => {
    const response = mocks.auth
      ? await handler({
          user: { id: "10000000-0000-4000-8000-000000000005" },
          createAdminClient: () => ({ rpc: mocks.rpc }),
        })
      : NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
}));
import {
  signStartShot,
  wrapStartShotEnvelope,
  loadStartShotEd25519Key,
} from "./start-shot-signature";
import { GET as publicKey } from "./start-shot-public-key/route";
import { PUT } from "./rooms/[roomId]/shot-session/route";
import { POST as issue } from "./rooms/[roomId]/start-shot/route";
import { POST as verify } from "./rooms/[roomId]/start-shot/verify/route";

const roomId = "10000000-0000-4000-8000-000000000003";
const sessionId = "10000000-0000-4000-8000-000000000004";
const requestId = "10000000-0000-4000-8000-000000000002";
const hostId = "10000000-0000-4000-8000-000000000005";
const key = Buffer.alloc(32, 7);
const payload = {
  version: 1 as const,
  eventId: "10000000-0000-4000-8000-000000000001",
  requestId,
  roomId,
  sessionId,
  hostId,
  generation: 2,
  round: 1,
  delayMs: 3000,
  issuedAt: 1000,
  expiresAt: 31000,
};
const context = { params: Promise.resolve({ roomId }) };
const req = (body: unknown, method = "POST") =>
  new NextRequest(`http://localhost/api/rooms/${roomId}/start-shot`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const input = { sessionId, requestId, round: 1, delayMs: 3000 };
const privateKey = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "der" })
  .toString("base64url");
const envelope = () =>
  wrapStartShotEnvelope(signStartShot(payload, key), loadStartShotEd25519Key(privateKey)!);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  vi.stubEnv("START_SHOT_SIGNING_KEY", key.toString("base64url"));
  vi.stubEnv("START_SHOT_ED25519_PRIVATE_KEY", privateKey);
  mocks.auth = true;
  mocks.rpc.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("START_SHOT routes", () => {
  test("public key requires authentication and is not cached", async () => {
    const request = new NextRequest("http://localhost/api/start-shot-public-key");
    mocks.auth = false;
    expect((await publicKey(request)).status).toBe(401);
    mocks.auth = true;
    const response = await publicKey(request);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const loaded = loadStartShotEd25519Key(privateKey)!;
    expect(await response.json()).toEqual({
      version: 2,
      kid: loaded.kid,
      publicKey: loaded.encodedPublicKey,
    });
    vi.stubEnv("START_SHOT_ED25519_PRIVATE_KEY", "bad");
    expect((await publicKey(request)).status).toBe(503);
  });
  test("rejects missing Ed25519 key and v1 envelope", async () => {
    expect((await verify(req({ envelope: signStartShot(payload, key) }), context)).status).toBe(
      400,
    );
    vi.stubEnv("START_SHOT_ED25519_PRIVATE_KEY", "bad");
    expect((await issue(req(input), context)).status).toBe(503);
    expect((await verify(req({ envelope: envelope() }), context)).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("requires authentication", async () => {
    mocks.auth = false;
    expect((await issue(req(input), context)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test.each([sessionId, null])("selects session %s using authenticated actor", async (session) => {
    mocks.rpc.mockResolvedValue({
      data: { code: "OK", sessionId: session, generation: 2 },
      error: null,
    });
    const response = await PUT(req({ sessionId: session }, "PUT"), context);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("k407_select_shot_session", {
      p_actor: hostId,
      p_room: roomId,
      p_session: session,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  test("issues and verifies an event", async () => {
    mocks.rpc.mockResolvedValue({ data: { code: "OK", ...payload }, error: null });
    const issued = await issue(req(input), context);
    expect(issued.status).toBe(200);
    const { envelope: token } = await issued.json();
    expect(mocks.rpc).toHaveBeenCalledWith("k407_issue_start_shot", {
      p_actor: hostId,
      p_room: roomId,
      p_session: sessionId,
      p_request: requestId,
      p_round: 1,
      p_delay_ms: 3000,
    });
    const checked = await verify(req({ envelope: token }), context);
    expect(await checked.json()).toEqual({
      payload: input,
      sender: { identity: hostId, role: "host" },
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("k407_claim_start_shot", {
      p_actor: hostId,
      p_room: roomId,
      p_event: payload.eventId,
    });
  });
  test("retains v2 idempotency and rejects replay and stale state", async () => {
    const claimRequestId = "10000000-0000-4000-8000-000000000009";
    const other = "10000000-0000-4000-8000-000000000010";
    let claimed: unknown;
    let stale = false;
    mocks.rpc.mockImplementation(async (_name, args) => {
      if (stale) return { data: { code: "STALE" }, error: null };
      if (claimed && claimed !== args.p_claim_request)
        return { data: { code: "REPLAY" }, error: null };
      claimed = args.p_claim_request;
      return { data: { code: "OK", ...payload }, error: null };
    });
    expect((await verify(req({ envelope: envelope(), claimRequestId }), context)).status).toBe(200);
    expect((await verify(req({ envelope: envelope(), claimRequestId }), context)).status).toBe(200);
    expect(
      (await verify(req({ envelope: envelope(), claimRequestId: other }), context)).status,
    ).toBe(409);
    stale = true;
    expect((await verify(req({ envelope: envelope(), claimRequestId }), context)).status).toBe(409);
  });
  test("passes the retryable claim ID from the authenticated user to v2", async () => {
    const claimRequestId = "10000000-0000-4000-8000-000000000009";
    mocks.rpc.mockResolvedValue({ data: { code: "OK", ...payload }, error: null });
    const response = await verify(req({ envelope: envelope(), claimRequestId }), context);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("k407_claim_start_shot_v2", {
      p_actor: hostId,
      p_room: roomId,
      p_event: payload.eventId,
      p_claim_request: claimRequestId,
    });
    expect(
      (await verify(req({ envelope: envelope(), claimRequestId: "bad" }), context)).status,
    ).toBe(400);
  });
  test.each([
    undefined,
    "",
    "a".repeat(42),
    "a".repeat(43),
    Buffer.alloc(33).toString("base64url"),
    key.toString("base64url") + "=",
  ])("rejects invalid signing key", async (value) => {
    vi.stubEnv("START_SHOT_SIGNING_KEY", value);
    expect((await issue(req(input), context)).status).toBe(503);
    expect((await verify(req({ envelope: "x" }), context)).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test.each([
    { ...input, actor: hostId },
    { ...input, round: -1 },
    { ...input, delayMs: 60001 },
    { ...input, sessionId: null },
    { ...input, round: 2147483648 },
  ])("rejects invalid issue input", async (body) => {
    expect((await issue(req(body), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("rejects oversized, invalid content type and invalid room", async () => {
    expect((await verify(req({ envelope: "x".repeat(9000) }), context)).status).toBe(400);
    expect(
      (await issue(new NextRequest("http://localhost", { method: "POST", body: "{}" }), context))
        .status,
    ).toBe(400);
    expect((await issue(req(input), { params: Promise.resolve({ roomId: "bad" }) })).status).toBe(
      400,
    );
  });
  test("rejects tampering, expired and wrong room before claim", async () => {
    const token = envelope();
    expect(
      (
        await verify(
          req({ envelope: token.slice(0, -1) + (token.endsWith("A") ? "B" : "A") }),
          context,
        )
      ).status,
    ).toBe(400);
    vi.setSystemTime(31000);
    expect((await verify(req({ envelope: token }), context)).status).toBe(400);
    vi.setSystemTime(5000);
    expect(
      (await verify(req({ envelope: token }), { params: Promise.resolve({ roomId: sessionId }) }))
        .status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test.each([
    "INVALID_REQUEST",
    "NOT_FOUND",
    "FORBIDDEN",
    "CONFLICT",
    "STALE",
    "EXPIRED",
    "REPLAY",
    "OTHER",
  ])("maps RPC error %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: { code }, error: null });
    const expected: Record<string, number> = {
      INVALID_REQUEST: 400,
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      CONFLICT: 409,
      STALE: 409,
      EXPIRED: 409,
      REPLAY: 409,
      OTHER: 503,
    };
    expect((await verify(req({ envelope: envelope() }), context)).status).toBe(expected[code]);
  });
  test.each(Object.keys(payload))("rejects claim with mismatched %s", async (field) => {
    mocks.rpc.mockResolvedValue({
      data: { code: "OK", ...payload, [field]: "wrong" },
      error: null,
    });
    expect((await verify(req({ envelope: envelope() }), context)).status).toBe(503);
  });
  test("rejects incorrect issue data and DB failures", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { code: "OK", ...payload, round: 9 }, error: null })
      .mockResolvedValueOnce({ data: null, error: {} })
      .mockRejectedValueOnce(new Error("failure"));
    expect((await issue(req(input), context)).status).toBe(503);
    expect((await issue(req(input), context)).status).toBe(503);
    expect((await issue(req(input), context)).status).toBe(503);
  });
});
