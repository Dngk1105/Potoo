import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.fn();
vi.mock("../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "actor" }, createAdminClient: () => ({ rpc }) }),
}));
import { POST as kick } from "./[roomId]/kick/route";
import { POST as host } from "./[roomId]/host/route";
const roomId = "12345678-1234-4234-8234-123456789abc";
const userId = "aaaaaaaa-1234-4234-8234-123456789abc";
const context = { params: Promise.resolve({ roomId }) };
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/rooms/x/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("REALTIME_ADAPTER", "mock");
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  { name: "kick", handler: kick, rpcName: "k405_kick", output: { userId, kicked: true } },
  { name: "host", handler: host, rpcName: "k405_transfer_host", output: { hostId: userId } },
])("$name command", ({ handler, rpcName, output }) => {
  it("validates target and rejects extra fields", async () => {
    for (const body of [{}, { userId: "bad" }, { userId, actor: userId }]) {
      expect((await handler(request(body), context)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["real", "", "invalid"])("fails closed with adapter %s", async (adapter) => {
    vi.stubEnv("REALTIME_ADAPTER", adapter);
    expect((await handler(request({ userId }), context)).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses authenticated actor and returns the committed result", async () => {
    rpc.mockResolvedValue({ data: output, error: null });
    const response = await handler(request({ userId: userId.toUpperCase() }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(output);
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_actor: "actor",
      p_room_id: roomId,
      p_target: userId,
    });
  });
  it.each([
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["CONFLICT", 409],
  ])("maps %s", async (code, status) => {
    rpc.mockResolvedValue({ data: { code }, error: null });
    expect((await handler(request({ userId }), context)).status).toBe(status);
  });
  it("rejects failed or unexpected RPC results", async () => {
    for (const result of [
      { data: null, error: {} },
      { data: {}, error: null },
    ]) {
      rpc.mockResolvedValue(result);
      expect((await handler(request({ userId }), context)).status).toBe(503);
    }
  });
});
