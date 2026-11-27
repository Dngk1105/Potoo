import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
vi.mock("../../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "actor" }, createAdminClient: () => ({ rpc }) }),
}));
import { POST } from "./route";

const roomId = "12345678-1234-4234-8234-123456789abc";
function request(body: unknown) {
  return new NextRequest("http://localhost/api/rooms/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => rpc.mockReset());

describe("join room", () => {
  it("rejects malformed requests before database access", async () => {
    for (const body of [
      {},
      { pin: 123456 },
      { pin: "12345" },
      { roomId: "bad" },
      { roomId, pin: "012345" },
      { other: roomId },
      null,
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ roomId }, { pin: "012345" }])("joins using %j", async (body) => {
    rpc.mockResolvedValue({ data: { roomId }, error: null });
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roomId });
    expect(rpc).toHaveBeenCalledWith("k405_join_room", {
      p_actor: "actor",
      p_room_id: "roomId" in body ? roomId : null,
      p_pin: "pin" in body ? "012345" : null,
    });
  });
  it.each([
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["FORBIDDEN", 403],
  ])("maps %s to %i", async (code, status) => {
    rpc.mockResolvedValue({ data: { code }, error: null });
    expect((await POST(request({ roomId }))).status).toBe(status);
  });
  it("fails closed for DB errors and unexpected data", async () => {
    for (const result of [
      { data: null, error: { code: "08006" } },
      { data: { roomId: "wrong" }, error: null },
      { data: { code: "UNKNOWN" }, error: null },
    ]) {
      rpc.mockResolvedValue(result);
      expect((await POST(request({ roomId }))).status).toBe(503);
    }
  });
});
