import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateKeyPairSync } from "node:crypto";

const state = vi.hoisted(() => ({
  selected: false,
  host: "10000000-0000-4000-8000-000000000001",
  member: "10000000-0000-4000-8000-000000000002",
  room: "10000000-0000-4000-8000-000000000003",
  session: "10000000-0000-4000-8000-000000000004",
  request: "10000000-0000-4000-8000-000000000005",
  event: "10000000-0000-4000-8000-000000000006",
  claims: new Map<string, string>(),
  envelopeData: null as Record<string, unknown> | null,
  rooms: [] as Array<{ identity: string; emit: (name: string, ...args: unknown[]) => void }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("./route-auth", () => ({
  withRouteAuth: async (request: NextRequest, handler: (context: unknown) => Promise<Response>) => {
    const actor = request.headers.get("x-test-user");
    if (!actor) return new Response(null, { status: 401 });
    return handler({ user: { id: actor }, createAdminClient: () => ({ rpc }) });
  },
}));
vi.mock("livekit-client", async () => {
  const { EventEmitter } = await import("node:events");
  class Room extends EventEmitter {
    identity = "";
    remoteParticipants = new Map();
    localParticipant = {
      identity: "",
      attributes: { role: "host" },
      publishTrack: vi.fn(),
      publishData: async (packet: Uint8Array) => {
        for (const peer of state.rooms) {
          if (peer !== this && peer.identity) {
            peer.emit("dataReceived", packet, {
              identity: this.identity,
              attributes: { role: "host" },
            });
          }
        }
      },
    };
    async connect(_url: string, token: string) {
      this.identity = token;
      this.localParticipant.identity = token;
      state.rooms.push(this);
    }
    async disconnect() {
      const index = state.rooms.indexOf(this);
      if (index >= 0) state.rooms.splice(index, 1);
      this.emit("disconnected");
    }
  }
  return {
    Room,
    RoomEvent: {
      ParticipantConnected: "participantConnected",
      ParticipantDisconnected: "participantDisconnected",
      ParticipantAttributesChanged: "participantAttributesChanged",
      TrackSubscribed: "trackSubscribed",
      TrackUnsubscribed: "trackUnsubscribed",
      Reconnected: "reconnected",
      Disconnected: "disconnected",
      DataReceived: "dataReceived",
    },
  };
});

async function rpc(name: string, args: Record<string, unknown>) {
  if (name === "k407_select_shot_session") {
    if (args.p_actor !== state.host) return { data: { code: "FORBIDDEN" }, error: null };
    state.selected = args.p_session === state.session;
    return { data: { code: "OK", sessionId: args.p_session, generation: 1 }, error: null };
  }
  if (name === "k407_issue_start_shot") {
    if (args.p_actor !== state.host) return { data: { code: "FORBIDDEN" }, error: null };
    if (!state.selected || args.p_session !== state.session)
      return { data: { code: "CONFLICT" }, error: null };
    const now = Date.now();
    state.envelopeData = {
      version: 1,
      eventId: state.event,
      requestId: args.p_request,
      roomId: state.room,
      sessionId: state.session,
      hostId: state.host,
      generation: 1,
      round: args.p_round,
      delayMs: args.p_delay_ms,
      issuedAt: now,
      expiresAt: now + 30000,
    };
    return { data: { code: "OK", ...state.envelopeData }, error: null };
  }
  if (name === "k407_claim_start_shot_v2") {
    if (!state.envelopeData || state.envelopeData.hostId !== state.host)
      return { data: { code: "STALE" }, error: null };
    if (args.p_actor !== state.host && args.p_actor !== state.member)
      return { data: { code: "FORBIDDEN" }, error: null };
    const actor = String(args.p_actor);
    const claimId = String(args.p_claim_request);
    const existing = state.claims.get(actor);
    if (existing && existing !== claimId) return { data: { code: "REPLAY" }, error: null };
    state.claims.set(actor, claimId);
    return { data: { code: "OK", ...state.envelopeData }, error: null };
  }
  return { data: null, error: new Error("Unexpected RPC") };
}

import { PUT as selectSession } from "./rooms/[roomId]/shot-session/route";
import { POST as issue } from "./rooms/[roomId]/start-shot/route";
import { POST as verify } from "./rooms/[roomId]/start-shot/verify/route";
import { GET as publicKey } from "./start-shot-public-key/route";
import { createRealRealtime } from "@/core/adapters";
import { createStartShotHttp } from "@/core/adapters";

function fetcher(actor: string): typeof fetch {
  return (async (input, init) => {
    const url = String(input);
    const request = new NextRequest(`http://localhost${url}`, {
      ...init,
      signal: init?.signal ?? undefined,
      headers: { "content-type": "application/json", "x-test-user": actor },
    });
    const context = { params: Promise.resolve({ roomId: state.room }) };
    if (url === "/api/start-shot-public-key") return publicKey(request);
    if (url.endsWith("/shot-session")) return selectSession(request, context);
    if (url.endsWith("/start-shot/verify")) return verify(request, context);
    if (url.endsWith("/start-shot")) return issue(request, context);
    throw new Error("Unexpected test route");
  }) as typeof fetch;
}

describe("START_SHOT route and RoomBus flow with mocked services", () => {
  beforeEach(() => {
    state.selected = false;
    state.claims.clear();
    state.envelopeData = null;
    state.rooms.length = 0;
    vi.stubEnv("START_SHOT_SIGNING_KEY", Buffer.alloc(32, 7).toString("base64url"));
    const { privateKey } = generateKeyPairSync("ed25519");
    vi.stubEnv(
      "START_SHOT_ED25519_PRIVATE_KEY",
      privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
    );
  });

  test("retries a lost claim response without dispatching twice", async () => {
    const hostApi = createStartShotHttp(fetcher(state.host));
    const baseFetch = fetcher(state.member);
    let verifyCalls = 0;
    const memberFetch: typeof fetch = async (input, init) => {
      const response = await baseFetch(input, init);
      if (String(input).endsWith("/start-shot/verify") && verifyCalls++ === 0) {
        throw new TypeError("response lost after DB commit");
      }
      return response;
    };
    const memberApi = createStartShotHttp(memberFetch);
    await hostApi.selectSession(state.room, state.session);
    const host = createRealRealtime({
      getCredentials: async () => ({ url: "ws://local", token: state.host }),
      ...hostApi,
    });
    const member = createRealRealtime({
      getCredentials: async () => ({ url: "ws://local", token: state.member }),
      ...memberApi,
    });
    const listener = vi.fn();
    member.bus.on("START_SHOT", listener);
    await host.room.join({ roomId: state.room });
    await member.room.join({ roomId: state.room });
    const payload = { sessionId: state.session, requestId: state.request, round: 0, delayMs: 3000 };
    await host.bus.send({ type: "START_SHOT", payload });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(verifyCalls).toBe(2);
    expect(listener).toHaveBeenCalledExactlyOnceWith(payload, {
      identity: state.host,
      role: "host",
    });
    await Promise.all([host.room.leave(), member.room.leave()]);
  });

  test("issues, signs, publishes and claims once per user", async () => {
    const hostApi = createStartShotHttp(fetcher(state.host));
    const memberFetcher = vi.fn(fetcher(state.member));
    const memberApi = createStartShotHttp(memberFetcher);
    await hostApi.selectSession(state.room, state.session);
    const host = createRealRealtime({
      getCredentials: async () => ({ url: "ws://local", token: state.host }),
      ...hostApi,
    });
    const member = createRealRealtime({
      getCredentials: async () => ({ url: "ws://local", token: state.member }),
      ...memberApi,
    });
    const hostEvents = vi.fn();
    const memberEvents = vi.fn();
    host.bus.on("START_SHOT", hostEvents);
    member.bus.on("START_SHOT", memberEvents);
    await host.room.join({ roomId: state.room });
    await member.room.join({ roomId: state.room });
    const payload = { sessionId: state.session, requestId: state.request, round: 0, delayMs: 3000 };
    await host.bus.send({ type: "START_SHOT", payload });
    await vi.waitFor(() => expect(memberEvents).toHaveBeenCalledOnce());
    expect(hostEvents).toHaveBeenCalledExactlyOnceWith(payload, {
      identity: state.host,
      role: "host",
    });
    expect(memberEvents).toHaveBeenCalledExactlyOnceWith(payload, {
      identity: state.host,
      role: "host",
    });
    expect(new Set(state.claims.keys())).toEqual(new Set([state.host, state.member]));
    state.rooms[1].emit(
      "dataReceived",
      new TextEncoder().encode(JSON.stringify({ type: "SIGNED_START_SHOT", envelope: "forged" })),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(memberFetcher).toHaveBeenCalledTimes(2);
    expect(memberEvents).toHaveBeenCalledTimes(1);
    await Promise.all([host.room.leave(), member.room.leave()]);
  });
});
