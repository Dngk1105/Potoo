import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.fn();
vi.mock("../../../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "actor" }, createAdminClient: () => ({ rpc }) }),
}));
import { POST } from "./route";
const roomId = "12345678-1234-4234-8234-123456789abc";
const context = { params: Promise.resolve({ roomId }) };
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/rooms/x/leave", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("REALTIME_ADAPTER", "mock");
});
afterEach(() => vi.unstubAllEnvs());
describe("leave room", () => {
  it.each(["real", "", "invalid"])("rejects %s adapter before mutation", async (adapter) => {
    vi.stubEnv("REALTIME_ADAPTER", adapter);
    expect((await POST(request({}), context)).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects body fields", async () => {
    expect((await POST(request({ userId: roomId }), context)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated actor", async () => {
    rpc.mockResolvedValue({ data: { left: true }, error: null });
    expect(await (await POST(request({}), context)).json()).toEqual({ left: true });
    expect(rpc).toHaveBeenCalledWith("k405_leave_room", { p_actor: "actor", p_room_id: roomId });
  });
  it.each([
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["CONFLICT", 409],
  ])("maps %s", async (code, status) => {
    rpc.mockResolvedValue({ data: { code }, error: null });
    expect((await POST(request({}), context)).status).toBe(status);
  });
  it("does not claim success on DB failure", async () => {
    rpc.mockResolvedValue({ error: {}, data: null });
    expect((await POST(request({}), context)).status).toBe(503);
  });
});
