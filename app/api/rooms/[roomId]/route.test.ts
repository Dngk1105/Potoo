import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
vi.mock("../../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "actor" }, createAdminClient: () => ({ rpc }) }),
}));
import { PATCH } from "./route";

const roomId = "12345678-1234-4234-8234-123456789abc";
const context = { params: Promise.resolve({ roomId }) };
function request(body: unknown) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => rpc.mockReset());

describe("patch room", () => {
  it("rejects unknown fields and unsupported settings", async () => {
    for (const body of [
      {},
      { locked: null },
      { frameId: "bad" },
      { settings: [] },
      { settings: { text: "x".repeat(16 * 1024) } },
      { settings: { nested: { constructor: { test: 1 } } } },
      { settings: JSON.parse('{"__proto__":{"admin":true}}') },
      { extra: 1 },
    ]) {
      expect((await PATCH(request(body), context)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts bounded JSON settings and passes them to the transaction", async () => {
    const settings = { rounds: 4, countdown: { seconds: 3 }, enabled: true };
    rpc.mockResolvedValue({
      data: { roomId, status: "open", frameId: null, settings },
      error: null,
    });
    const response = await PATCH(request({ settings }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).settings).toEqual(settings);
    expect(rpc).toHaveBeenCalledWith("k405_patch_room", {
      p_actor: "actor",
      p_room_id: roomId,
      p_patch: { settings },
    });
  });
  it("rejects settings nested beyond the maximum depth", async () => {
    let settings: Record<string, unknown> = {};
    for (let i = 0; i < 16; i++) settings = { child: settings };
    expect((await PATCH(request({ settings }), context)).status).toBe(400);
  });
  it("passes the authenticated actor to the transaction", async () => {
    rpc.mockResolvedValue({
      data: { roomId, status: "locked", frameId: null, settings: {} },
      error: null,
    });
    const response = await PATCH(request({ locked: true }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      roomId,
      status: "locked",
      frameId: null,
      settings: {},
    });
    expect(rpc).toHaveBeenCalledWith("k405_patch_room", {
      p_actor: "actor",
      p_room_id: roomId,
      p_patch: { locked: true },
    });
  });
  it.each([
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["CONFLICT", 409],
    ["INVALID_REQUEST", 400],
  ])("maps %s", async (code, status) => {
    rpc.mockResolvedValue({ data: { code }, error: null });
    expect((await PATCH(request({ locked: true }), context)).status).toBe(status);
  });
  it("does not claim success on database failure", async () => {
    rpc.mockResolvedValue({ data: null, error: {} });
    expect((await PATCH(request({ locked: true }), context)).status).toBe(503);
  });
});
