import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("../../../route-auth", () => ({ withRouteAuth: mocks.auth }));
import { POST } from "./route";

const roomId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ roomId }) };
const request = (body = "{}", extra: Record<string, string> = {}) =>
  new NextRequest(`https://example.test/api/rooms/${roomId}/livekit-token`, {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body,
  });

function data(room: unknown, member: unknown) {
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: table === "rooms" ? room : member, error: null }),
    };
    return query;
  });
}

describe("livekit token route", () => {
  beforeEach(() => {
    vi.stubEnv("REALTIME_ADAPTER", "mock");
    mocks.auth.mockImplementation((_req, handler) =>
      handler({ user: { id: userId }, createAdminClient: () => ({ from: mocks.from }) }),
    );
    data({ host_id: userId, status: "open" }, { kicked_at: null });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it("returns the DB role for authenticated mock members", async () => {
    const response = await POST(request(), context);
    expect(await response.json()).toEqual({ url: null, token: null, role: "host" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.auth).toHaveBeenCalledOnce();
  });
  it("delegates bearer authentication to the shared helper", async () => {
    expect((await POST(request("{}", { authorization: "Bearer x" }), context)).status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledOnce();
  });
  it("rejects unknown request fields", async () => {
    expect((await POST(request('{"role":"host"}'), context)).status).toBe(400);
  });
  it.each([
    [{ host_id: userId, status: "locked" }, { kicked_at: null }, 409],
    [{ host_id: null, status: "open" }, { kicked_at: null }, 409],
    [{ host_id: userId, status: "open" }, { kicked_at: "now" }, 403],
    [{ host_id: userId, status: "open" }, null, 403],
    [null, null, 404],
  ])("rejects unavailable membership or room", async (room, member, status) => {
    data(room, member);
    expect((await POST(request(), context)).status).toBe(status);
  });
  it.each(["host", "member"] as const)(
    "refuses real credentials for %s until revocation is safe",
    async (role) => {
      vi.stubEnv("REALTIME_ADAPTER", "real");
      data({ host_id: role === "host" ? userId : roomId, status: "open" }, { kicked_at: null });
      const response = await POST(request(), context);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
    },
  );
  it.each([
    ["NEXT_PUBLIC_LIVEKIT_URL", ""],
    ["NEXT_PUBLIC_LIVEKIT_URL", "https://example.test"],
    ["NEXT_PUBLIC_LIVEKIT_URL", "wss://user:pass@example.test"],
    ["LIVEKIT_API_KEY", ""],
    ["LIVEKIT_API_SECRET", ""],
    ["REALTIME_ADAPTER", "invalid"],
  ])("fails closed for invalid configuration %s", async (key, value) => {
    vi.stubEnv("REALTIME_ADAPTER", "real");
    vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", "ws://localhost:7880");
    vi.stubEnv("LIVEKIT_API_KEY", "test-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-not-for-production");
    vi.stubEnv(key, value);
    expect((await POST(request(), context)).status).toBe(503);
  });
  it.each(["editing", "ended"])("rejects room status %s", async (status) => {
    data({ host_id: userId, status }, { kicked_at: null });
    expect((await POST(request(), context)).status).toBe(409);
  });
  it.each(["null", "[]", "{", '{"identity":"x"}'])("rejects invalid body %s", async (body) => {
    expect((await POST(request(body), context)).status).toBe(400);
  });
  it("rejects an invalid room ID", async () => {
    expect((await POST(request(), { params: Promise.resolve({ roomId: "bad" }) })).status).toBe(
      400,
    );
  });
  it("returns 503 on a database error", async () => {
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: { message: "private detail" } }),
      };
      return query;
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private detail");
  });
});
